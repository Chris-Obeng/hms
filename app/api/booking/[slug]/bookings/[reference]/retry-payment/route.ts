import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/booking/[slug]/bookings/[reference]/retry-payment
 *
 * Re-initializes a Paystack transaction for a booking that is still an unpaid
 * online-payment hold (guest closed the checkout tab, card declined, etc.).
 *
 * Only ever issues a NEW authorization URL — it never mutates booking state.
 * Confirmation still arrives exclusively through the webhook / verify path.
 */
export async function POST(
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

  if (!/^[a-z0-9.-]{1,253}$/i.test(slug)) {
    return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
  }
  if (!/^[A-Z0-9-]{3,30}$/.test(reference)) {
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

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, status, payment_status, payment_preference, source, total_amount, amount_paid, currency, initiated_payment_refs, guests(email)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .maybeSingle();

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

  try {
    const txn = await initializeTransaction({
      email: guest?.email ?? `${booking.reference}@bookings.local`,
      amount: Math.round(remaining * 100),
      currency: booking.currency ?? hotel.currency ?? "GHS",
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
    await supabaseAdmin
      .from("bookings")
      .update({ initiated_payment_refs: nextRefs })
      .eq("id", booking.id);

    return NextResponse.json({ authorizationUrl: txn.authorization_url });
  } catch (err) {
    console.error("[booking/retry-payment]", err);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 }
    );
  }
}
