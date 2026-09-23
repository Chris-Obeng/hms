import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack";
import { toMinor } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import {
  captureError,
  captureSupabaseError,
  flushSentry,
} from "@/lib/observability/sentry";
import { bookingReferenceParam, hotelSlugParam } from "@/lib/validation/params";

/**
 * POST /api/booking/[slug]/bookings/[reference]/retry-payment
 *
 * Re-initializes a Paystack transaction for a booking that is still an unpaid
 * online-payment hold (guest closed the checkout tab, card declined, etc.).
 *
 * Only ever issues a NEW authorization URL — it never mutates booking state.
 * Confirmation still arrives exclusively through the webhook / verify path.
 *
 * Observability: this is the guest's second attempt at paying, so a failure here
 * is a booking about to be lost. Every report is tagged `payment_init`. The
 * guest's email is read for the Paystack call but never sent to Sentry.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; reference: string }> }
) {
  try {
    return await handleRetryPayment(req, ctx);
  } finally {
    // Guest-facing payment path on a serverless isolate: flush before the
    // response resolves or the event is lost.
    await flushSentry();
  }
}

async function handleRetryPayment(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; reference: string }> }
) {
  // Each call creates a real Paystack transaction — keep it tight.
  const rl = await rateLimit(req, { name: "retry-payment", limit: 5, windowSeconds: 10 * 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many payment attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { slug, reference } = await params;

  if (!hotelSlugParam.safeParse(slug).success) {
    return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
  }
  if (!bookingReferenceParam.safeParse(reference).success) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  let hotelQuery = await supabaseAdmin
    .from("hotels")
    .select("id, name, currency, paystack_subaccount_code")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (!hotelQuery.data) {
    hotelQuery = await supabaseAdmin
      .from("hotels")
      .select("id, name, currency, paystack_subaccount_code")
      .eq("custom_domain", slug)
      .eq("status", "active")
      .maybeSingle();
  }

  const hotel = hotelQuery.data;
  if (!hotel || !hotel.paystack_subaccount_code) {
    return NextResponse.json({ error: "Online payment is not available." }, { status: 400 });
  }

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, status, payment_status, payment_preference, source, total_amount, amount_paid, currency, initiated_payment_refs, guests(email)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .maybeSingle();

  if (bookingErr) {
    // Reported because the 404 below is a lie in this case: the booking exists and
    // the guest is being told their reservation is gone.
    captureSupabaseError(bookingErr, "bookings.select.retry_payment", {
      scope: "booking-funnel",
      step: "payment_init",
      level: "error",
      hotelId: hotel.id,
      reference,
      tags: { "hotel.slug": slug },
    });
  }

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === "cancelled") {
    return NextResponse.json(
      { error: "This reservation has expired. Please start a new booking.", expired: true },
      { status: 410 }
    );
  }

  const payable =
    booking.status === "pending" &&
    (booking.payment_status === "unpaid" || booking.payment_status === "partial") &&
    booking.payment_preference === "pay_now" &&
    booking.source === "direct";

  if (!payable) {
    // Already paid / confirmed / not a guest online hold — nothing to retry.
    return NextResponse.json(
      { error: "No payment is due for this reservation." },
      { status: 409 }
    );
  }

  // Guests with a partial payment settle the remaining balance, not the
  // original full total.
  const remaining = Number(booking.total_amount) - Number(booking.amount_paid ?? 0);
  if (!(remaining > 0)) {
    return NextResponse.json(
      { error: "No payment is due for this reservation." },
      { status: 409 }
    );
  }

  const guest = booking.guests as { email?: string | null } | null;

  // Derive the callback from the request origin — never client-supplied headers.
  const callbackUrl = `${req.nextUrl.origin}/${slug}/book/confirmation?bref=${booking.reference}`;
  const payRef = `${booking.reference}-r${Date.now()}`;

  const attemptCurrency = booking.currency ?? hotel.currency ?? "GHS";
  const amountMinor = toMinor(remaining, attemptCurrency);

  try {
    // Durable payment intent BEFORE the reference reaches Paystack: the
    // settlement RPC rejects any reference without a matching attempt, so a
    // guest who pays ahead of this row would be charged and then refused.
    // A failed insert throws into the catch below — nothing was handed off.
    const { error: attemptErr } = await supabaseAdmin
      .from("payment_attempts")
      .insert({
        hotel_id: hotel.id,
        booking_id: booking.id,
        paystack_reference: payRef,
        amount_minor: amountMinor,
        currency: attemptCurrency,
        expected_subaccount_code: hotel.paystack_subaccount_code,
        metadata: {
          booking_id: booking.id,
          hotel_id: hotel.id,
          booking_reference: booking.reference,
        },
        status: "initialized",
        initialized_at: new Date().toISOString(),
      });

    if (attemptErr) {
      throw new Error(`payment_attempts insert failed: ${attemptErr.message}`);
    }

    const txn = await initializeTransaction({
      email: guest?.email ?? `${booking.reference}@bookings.local`,
      // Convert with the currency the booking was created in, not a fixed ×100.
      amount: amountMinor,
      currency: attemptCurrency,
      reference: payRef,
      callback_url: callbackUrl,
      subaccount: hotel.paystack_subaccount_code,
      metadata: {
        booking_id: booking.id,
        hotel_id: hotel.id,
        booking_reference: booking.reference,
      },
    });

    // Track the new reference for the reconciliation sweep (cap 10 so repeated
    // retries on a stale hold can't grow the array unbounded).
    const nextRefs = [...(booking.initiated_payment_refs ?? []), payRef].slice(-10);
    const { error: refsErr } = await supabaseAdmin
      .from("bookings")
      .update({ initiated_payment_refs: nextRefs })
      .eq("id", booking.id);

    if (refsErr) {
      // The guest is on their way to Paystack with a reference the sweep cannot
      // see, so a lost webhook means a paid hold expires unconfirmed.
      captureSupabaseError(refsErr, "bookings.update.initiated_payment_refs", {
        scope: "booking-funnel",
        step: "payment_init",
        level: "error",
        hotelId: hotel.id,
        bookingId: booking.id,
        reference: payRef,
        tags: { "hotel.slug": slug, "payment.retry": true },
      });
    }

    return NextResponse.json({ authorizationUrl: txn.authorization_url });
  } catch (err) {
    console.error("[booking/retry-payment]", err);
    // lib/paystack.ts reports the API failure; this records that a guest with an
    // outstanding balance could not be given a way to pay it.
    captureError(err, {
      scope: "booking-funnel",
      step: "payment_init",
      level: "error",
      hotelId: hotel.id,
      bookingId: booking.id,
      reference: payRef,
      tags: {
        "hotel.slug": slug,
        "payment.retry": true,
        "payment.currency": booking.currency ?? hotel.currency ?? "GHS",
      },
      contexts: { payment: { remaining, total: Number(booking.total_amount) } },
      fingerprint: ["booking-funnel", "retry-payment-failed"],
    });
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 }
    );
  }
}
