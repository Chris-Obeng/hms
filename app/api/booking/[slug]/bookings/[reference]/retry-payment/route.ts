import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction, isUsableSubaccount, verifyTransaction } from "@/lib/paystack";
import { sumMinor, toMinor } from "@/lib/money";
import {
  computePlatformFeeMinor,
  startPlatformFeeConfigRead,
  type PlatformFeeConfig,
} from "@/lib/platform/fees";
import { rateLimit } from "@/lib/rate-limit";
import {
  captureError,
  captureSupabaseError,
  flushSentry,
} from "@/lib/observability/sentry";
import { bookingReferenceParam, hotelSlugParam } from "@/lib/validation/params";

/**
 * Paystack statuses after which no more money can arrive on a transaction, so
 * starting another one cannot charge the guest twice. Paystack documents
 * `abandoned` as "the customer hasn't completed the transaction".
 */
const NO_CHARGE_STATUSES = new Set(["abandoned", "failed", "reversed"]);

/**
 * The reference of the booking's latest checkout if Paystack may still take
 * money on it (success, or a mobile money / transfer payment still being
 * processed), else null.
 *
 * Every retry creates a new Paystack transaction, so without this check a
 * guest who closed the form while a mobile money prompt was still on their
 * phone could approve that prompt and also pay the new transaction.
 *
 * Throws when the answer is unknown (database error, Paystack unreachable):
 * the caller then refuses to start a new charge rather than risk a second one.
 */
async function latestChargeStillOpen(
  hotelId: string,
  bookingId: string
): Promise<string | null> {
  const { data: attempt, error } = await supabaseAdmin
    .from("payment_attempts")
    .select("paystack_reference")
    .eq("hotel_id", hotelId)
    .eq("booking_id", bookingId)
    .eq("status", "initialized")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`payment_attempts lookup failed: ${error.message}`);
  if (!attempt) return null;

  try {
    const txn = await verifyTransaction(attempt.paystack_reference);
    return NO_CHARGE_STATUSES.has(txn.status) ? null : attempt.paystack_reference;
  } catch (err) {
    // 400/404 means Paystack has no such transaction: an earlier retry wrote
    // the attempt and then failed to initialize it, so nothing can be charged
    // on it. Anything else (429, 5xx, network) leaves the question open.
    if (err instanceof Error && /^Paystack (400|404) /.test(err.message)) return null;
    throw err;
  }
}

/** The guest's earlier checkout may still go through: verify it, don't pay again. */
function chargeStillOpenResponse(paymentReference: string) {
  return NextResponse.json(
    {
      error:
        "Your last payment attempt is still being processed. Please wait for it to finish before paying again.",
      paymentInProgress: true,
      paymentReference,
    },
    { status: 409 }
  );
}

/**
 * POST /api/booking/[slug]/bookings/[reference]/retry-payment
 *
 * Re-initializes a Paystack transaction for a booking that is still an unpaid
 * online-payment hold (guest closed the checkout tab, card declined, etc.).
 *
 * Only ever issues a NEW authorization URL — it never mutates booking state.
 * Refuses (409, `paymentInProgress`) while the previous checkout can still
 * take money; see latestChargeStillOpen.
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
    .select("id, name, currency, paystack_subaccount_code, paystack_domain")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (!hotelQuery.data) {
    hotelQuery = await supabaseAdmin
      .from("hotels")
      .select("id, name, currency, paystack_subaccount_code, paystack_domain")
      .eq("custom_domain", slug)
      .eq("status", "active")
      .maybeSingle();
  }

  const hotel = hotelQuery.data;
  if (!hotel || !hotel.paystack_subaccount_code || !isUsableSubaccount(hotel)) {
    return NextResponse.json({ error: "Online payment is not available." }, { status: 400 });
  }

  // Read the platform fee while the booking is looked up, not after: one
  // database round trip less before the guest reaches Paystack. Awaited where
  // the fee is used, so a failure is still handled there.
  const feeConfigPromise = startPlatformFeeConfigRead();

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, group_id, status, payment_status, payment_preference, source, total_amount, amount_paid, currency, initiated_payment_refs, guests(email)"
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

  // Multi-room group hold: retry re-inits ONE Paystack charge for the whole group
  // total, keyed on the anchor with metadata.group_id, so the webhook / verify
  // path settles every sibling via settle_online_group_payment_atomic. Single-room
  // holds (group_id NULL) fall through to the unchanged path below.
  if (booking.group_id) {
    return await handleGroupRetryPayment(req, slug, hotel, booking.group_id, feeConfigPromise);
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
  const callbackUrl = `${req.nextUrl.origin}/${slug}/confirmation?bref=${booking.reference}`;
  const payRef = `${booking.reference}-r${Date.now()}`;

  const attemptCurrency = booking.currency ?? hotel.currency ?? "GHS";
  const amountMinor = toMinor(remaining, attemptCurrency);

  try {
    const openReference = await latestChargeStillOpen(hotel.id, booking.id);
    if (openReference) return chargeStillOpenResponse(openReference);

    // Platform fee on the amount actually charged this retry (the remaining
    // balance, not the original total). Stored on the attempt and sent to
    // Paystack as transaction_charge; zero fee omits it.
    const feeConfig = await feeConfigPromise;
    const platformFeeMinor = computePlatformFeeMinor(feeConfig, amountMinor, attemptCurrency);

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
          platform_fee_minor: platformFeeMinor,
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
      ...(platformFeeMinor > 0
        ? { transaction_charge: platformFeeMinor, bearer: "account" as const }
        : {}),
      metadata: {
        booking_id: booking.id,
        hotel_id: hotel.id,
        booking_reference: booking.reference,
      },
    });

    // Audit list of references handed to Paystack (cap 10 so repeated retries
    // on a stale hold can't grow the array unbounded). Settlement and the
    // reconciliation sweep work from payment_attempts, not this column.
    const nextRefs = [...(booking.initiated_payment_refs ?? []), payRef].slice(-10);
    const { error: refsErr } = await supabaseAdmin
      .from("bookings")
      .update({ initiated_payment_refs: nextRefs })
      .eq("id", booking.id);

    if (refsErr) {
      // Audit gap only: the payment_attempts row written above is what
      // settlement and the sweep use.
      captureSupabaseError(refsErr, "bookings.update.initiated_payment_refs", {
        scope: "booking-funnel",
        step: "payment_init",
        level: "warning",
        hotelId: hotel.id,
        bookingId: booking.id,
        reference: payRef,
        tags: { "hotel.slug": slug, "payment.retry": true },
      });
    }

    return NextResponse.json({
      authorizationUrl: txn.authorization_url,
      // Completed in Paystack Popup on the confirmation page; the URL is the fallback.
      accessCode: txn.access_code,
      paymentReference: payRef,
    });
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

/**
 * Group hold retry: one Paystack charge for the whole reservation total, keyed on
 * the anchor with metadata.group_id, so the webhook / verify path settles every
 * sibling at once via settle_online_group_payment_atomic. Mirrors the group branch
 * of the create route; never mutates booking state.
 */
async function handleGroupRetryPayment(
  req: NextRequest,
  slug: string,
  hotel: {
    id: string;
    name: string;
    currency: string | null;
    paystack_subaccount_code: string | null;
  },
  groupId: string,
  feeConfigPromise: Promise<PlatformFeeConfig>
) {
  const { data: lines, error: linesErr } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, group_id, status, payment_status, payment_preference, source, total_amount, currency, initiated_payment_refs, guests(email)"
    )
    .eq("hotel_id", hotel.id)
    .eq("group_id", groupId);

  if (linesErr) {
    captureSupabaseError(linesErr, "bookings.select.retry_payment_group", {
      scope: "booking-funnel",
      step: "payment_init",
      level: "error",
      hotelId: hotel.id,
      reference: groupId,
      tags: { "hotel.slug": slug, "payment.retry": true },
    });
  }

  const anchor = lines?.find((l) => l.id === groupId);
  if (!lines || lines.length === 0 || !anchor) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  // Any released line means the whole group hold expired (abort is all-or-nothing).
  if (lines.some((l) => l.status === "cancelled")) {
    return NextResponse.json(
      { error: "This reservation has expired. Please start a new booking.", expired: true },
      { status: 410 }
    );
  }

  // The group is charged once for its full total, so every line must still be an
  // unpaid pay_now direct hold — a settled group has already flipped all lines.
  const payable = lines.every(
    (l) =>
      l.status === "pending" &&
      l.payment_status === "unpaid" &&
      l.payment_preference === "pay_now" &&
      l.source === "direct"
  );
  if (!payable) {
    return NextResponse.json(
      { error: "No payment is due for this reservation." },
      { status: 409 }
    );
  }

  const currency = anchor.currency ?? hotel.currency ?? "GHS";
  // Sum per line exactly as settle_online_group_payment_atomic does, so the
  // charge, the attempt and the RPC's recomputed total agree to the pesewa.
  const amountMinor = sumMinor(lines.map((l) => toMinor(l.total_amount, currency)));
  if (!(amountMinor > 0)) {
    return NextResponse.json(
      { error: "No payment is due for this reservation." },
      { status: 409 }
    );
  }

  const guest = anchor.guests as { email?: string | null } | null;
  const callbackUrl = `${req.nextUrl.origin}/${slug}/confirmation?bref=${anchor.reference}`;
  const payRef = `${anchor.reference}-r${Date.now()}`;

  try {
    // The group's checkouts are all keyed on the anchor.
    const openReference = await latestChargeStillOpen(hotel.id, groupId);
    if (openReference) return chargeStillOpenResponse(openReference);

    const feeConfig = await feeConfigPromise;
    const platformFeeMinor = computePlatformFeeMinor(feeConfig, amountMinor, currency);

    // One attempt on the anchor, keyed by the group reference — the settle RPC
    // validates the charge against exactly this row (amount + metadata).
    const { error: attemptErr } = await supabaseAdmin
      .from("payment_attempts")
      .insert({
        hotel_id: hotel.id,
        booking_id: groupId,
        paystack_reference: payRef,
        amount_minor: amountMinor,
        currency,
        expected_subaccount_code: hotel.paystack_subaccount_code!,
        metadata: {
          group_id: groupId,
          hotel_id: hotel.id,
          group_reference: anchor.reference,
          platform_fee_minor: platformFeeMinor,
        },
        status: "initialized",
        initialized_at: new Date().toISOString(),
      });

    if (attemptErr) {
      throw new Error(`payment_attempts insert failed: ${attemptErr.message}`);
    }

    const txn = await initializeTransaction({
      email: guest?.email ?? `${anchor.reference}@bookings.local`,
      amount: amountMinor,
      currency,
      reference: payRef,
      callback_url: callbackUrl,
      subaccount: hotel.paystack_subaccount_code!,
      ...(platformFeeMinor > 0
        ? { transaction_charge: platformFeeMinor, bearer: "account" as const }
        : {}),
      metadata: {
        group_id: groupId,
        hotel_id: hotel.id,
        group_reference: anchor.reference,
      },
    });

    // Audit list on the anchor only, one entry for the group. Settlement and
    // the reconciliation sweep work from payment_attempts.
    const nextRefs = [...(anchor.initiated_payment_refs ?? []), payRef].slice(-10);
    const { error: refsErr } = await supabaseAdmin
      .from("bookings")
      .update({ initiated_payment_refs: nextRefs })
      .eq("id", groupId);

    if (refsErr) {
      captureSupabaseError(refsErr, "bookings.update.initiated_payment_refs", {
        scope: "booking-funnel",
        step: "payment_init",
        level: "warning",
        hotelId: hotel.id,
        bookingId: groupId,
        reference: payRef,
        tags: { "hotel.slug": slug, "payment.retry": true },
      });
    }

    return NextResponse.json({
      authorizationUrl: txn.authorization_url,
      // Completed in Paystack Popup on the confirmation page; the URL is the fallback.
      accessCode: txn.access_code,
      paymentReference: payRef,
    });
  } catch (err) {
    console.error("[booking/retry-payment]", err);
    captureError(err, {
      scope: "booking-funnel",
      step: "payment_init",
      level: "error",
      hotelId: hotel.id,
      bookingId: groupId,
      reference: payRef,
      tags: {
        "hotel.slug": slug,
        "payment.retry": true,
        "payment.currency": currency,
      },
      contexts: { payment: { amount: amountMinor, line_count: lines.length } },
      fingerprint: ["booking-funnel", "retry-payment-failed"],
    });
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 }
    );
  }
}
