import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * POST /api/webhooks/paystack
 *
 * Receives Paystack charge.success events. Primary payment confirmation path.
 * The verify route is an idempotent fallback.
 *
 * Security:
 * - HMAC-SHA512 signature verified with timingSafeEqual (prevents timing attacks)
 * - Amount validated against booking.total_amount (prevents under-payment exploits)
 * - Idempotent on paystack_reference (safe to retry)
 * - Cross-tenant: hotel_id comes from booking row, not from client metadata
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // ── 1. Signature verification ────────────────────────────────
  const sig = req.headers.get("x-paystack-signature") ?? "";
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    console.error("[paystack-webhook] PAYSTACK_SECRET_KEY not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");

  // timingSafeEqual requires same-length buffers
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 2. Parse event ───────────────────────────────────────────
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only process charge.success
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const txn = event.data as Record<string, unknown>;
  const paystackRef = typeof txn.reference === "string" ? txn.reference : null;

  if (!paystackRef) {
    return NextResponse.json({ received: true });
  }

  // Parse metadata — Paystack sends it as stringified JSON or plain object.
  // A malformed metadata string must not throw an unhandled 500; treat it as
  // "no booking metadata" and acknowledge the event instead.
  const rawMeta = txn.metadata;
  let metadata: Record<string, unknown> = {};
  if (typeof rawMeta === "string") {
    try {
      metadata = JSON.parse(rawMeta) as Record<string, unknown>;
    } catch {
      console.warn("[paystack-webhook] Failed to parse metadata JSON", { paystackRef });
    }
  } else if (rawMeta && typeof rawMeta === "object") {
    metadata = rawMeta as Record<string, unknown>;
  }

  const bookingId = typeof metadata.booking_id === "string" ? metadata.booking_id : null;

  if (!bookingId) {
    // Not a booking payment — not our concern
    return NextResponse.json({ received: true });
  }

  // ── 3. Idempotency check ─────────────────────────────────────
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("paystack_reference", paystackRef)
    .maybeSingle();

  if (existingError) {
    // Don't risk a double-charge on a transient read failure — ask Paystack to retry.
    console.error("[paystack-webhook] Idempotency lookup failed", {
      paystackRef,
      error: existingError.message,
    });
    return NextResponse.json({ error: "Idempotency lookup failed" }, { status: 500 });
  }

  if (existing) {
    // Already processed — Paystack retried the webhook
    return NextResponse.json({ received: true });
  }

  // ── 4. Fetch booking ─────────────────────────────────────────
  const { data: booking, error: bookingFetchError } = await supabaseAdmin
    .from("bookings")
    .select("id, hotel_id, total_amount, currency, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError) {
    // Distinguish a DB failure from a genuine "not found" — retry on failure.
    console.error("[paystack-webhook] Booking lookup failed", {
      bookingId,
      error: bookingFetchError.message,
    });
    return NextResponse.json({ error: "Booking lookup failed" }, { status: 500 });
  }

  if (!booking) {
    console.warn("[paystack-webhook] Booking not found for booking_id in metadata", { bookingId });
    return NextResponse.json({ received: true });
  }

  const amountPaid = (txn.amount as number) / 100; // pesewas → GHS
  const expectedAmount = Number(booking.total_amount);
  const txnCurrency = typeof txn.currency === "string" ? txn.currency : booking.currency;

  // ── 5. Currency check ────────────────────────────────────────
  if (txnCurrency !== booking.currency) {
    console.error("[paystack-webhook] Currency mismatch", {
      bookingId,
      txnCurrency,
      bookingCurrency: booking.currency,
      paystackRef,
    });

    const { error: mismatchNotifyError } = await supabaseAdmin.from("notifications").insert({
      hotel_id: booking.hotel_id,
      type: "payment_failed",
      title: "⚠️ Payment Currency Mismatch",
      message: `Payment ${paystackRef} used currency ${txnCurrency} but booking expects ${booking.currency}. Manual review required.`,
      booking_id: bookingId,
      is_read: false,
    });

    if (mismatchNotifyError) {
      // This notification is the only manual-review signal — losing it silently
      // would hide the mismatch. Retry via 500 so the alert is not dropped.
      console.error("[paystack-webhook] Failed to write currency-mismatch alert", {
        bookingId,
        paystackRef,
        error: mismatchNotifyError.message,
      });
      return NextResponse.json({ error: "Failed to write review alert" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  }

  // ── 6. Amount validation ─────────────────────────────────────
  // Allow 1-kobo rounding tolerance. Any larger discrepancy is flagged.
  const amountDelta = Math.abs(amountPaid - expectedAmount);
  const isFullPayment = amountDelta <= 0.01;
  const isPartialPayment = !isFullPayment && amountPaid > 0 && amountPaid < expectedAmount;
  const isOverPayment = amountPaid > expectedAmount + 0.01;

  if (isOverPayment) {
    console.warn("[paystack-webhook] Overpayment detected", {
      bookingId,
      expectedAmount,
      amountPaid,
      delta: amountDelta,
      paystackRef,
    });
  }

  if (!isFullPayment && !isPartialPayment) {
    // Truly unexpected (e.g. 0 amount or malformed) — log and bail
    console.error("[paystack-webhook] Unexpected amount", {
      bookingId,
      expectedAmount,
      amountPaid,
      paystackRef,
    });

    const { error: invalidNotifyError } = await supabaseAdmin.from("notifications").insert({
      hotel_id: booking.hotel_id,
      type: "payment_failed",
      title: "⚠️ Payment Amount Invalid",
      message: `Payment ${paystackRef}: received ${amountPaid.toFixed(2)}, expected ${expectedAmount.toFixed(2)}. Manual review required.`,
      booking_id: bookingId,
      is_read: false,
    });

    if (invalidNotifyError) {
      console.error("[paystack-webhook] Failed to write invalid-amount alert", {
        bookingId,
        paystackRef,
        error: invalidNotifyError.message,
      });
      return NextResponse.json({ error: "Failed to write review alert" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  }

  // ── 7. Record payment ────────────────────────────────────────
  const subaccountData = txn.subaccount as Record<string, unknown> | null | undefined;

  const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert({
    hotel_id: booking.hotel_id,
    booking_id: bookingId,
    amount: amountPaid,
    currency: booking.currency ?? "GHS",
    method: "card",
    status: "success",
    paystack_reference: paystackRef,
    paystack_id: String(txn.id ?? ""),
    paystack_subaccount: (subaccountData?.account_code as string | null) ?? null,
    paid_at: new Date().toISOString(),
    notes: isPartialPayment
      ? `Partial payment: received ${amountPaid.toFixed(2)}, expected ${expectedAmount.toFixed(2)}`
      : isOverPayment
      ? `Overpayment: received ${amountPaid.toFixed(2)}, expected ${expectedAmount.toFixed(2)}`
      : null,
  });

  if (paymentInsertError) {
    // The money was captured by Paystack — if we fail to persist it, return 500
    // so Paystack retries the webhook rather than silently dropping the payment.
    // The idempotency check above prevents a duplicate on the retry.
    console.error("[paystack-webhook] Failed to record payment", {
      bookingId,
      paystackRef,
      error: paymentInsertError.message,
    });
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }

  // ── 8. Update booking status ─────────────────────────────────
  const newStatus = isFullPayment || isOverPayment ? "confirmed" : "pending";
  const newPaymentStatus = isFullPayment || isOverPayment ? "paid" : "partial";

  const { error: bookingUpdateError } = await supabaseAdmin
    .from("bookings")
    .update({
      status: newStatus,
      payment_status: newPaymentStatus,
      amount_paid: amountPaid,
    })
    .eq("id", bookingId)
    .eq("hotel_id", booking.hotel_id);

  if (bookingUpdateError) {
    // Log but continue — do NOT return 500 here. The payment row is already
    // persisted, so a Paystack retry would short-circuit at the idempotency
    // check above and never reach this update or the guest confirmation below.
    // Falling through keeps the pre-existing behaviour of still sending the
    // staff notification and guest confirmation for a captured payment.
    console.error("[paystack-webhook] Payment recorded but booking update failed", {
      bookingId,
      paystackRef,
      error: bookingUpdateError.message,
    });
  }

  // ── 9. In-app notification ───────────────────────────────────
  const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
    hotel_id: booking.hotel_id,
    type: "payment_received",
    title: isPartialPayment ? "Partial Payment Received" : "Payment Received",
    message: `Online payment of ${booking.currency ?? "GHS"} ${amountPaid.toFixed(2)} ${
      isPartialPayment ? `(partial — balance: ${(expectedAmount - amountPaid).toFixed(2)})` : "confirmed"
    }`,
    booking_id: bookingId,
    is_read: false,
  });

  if (notifyError) {
    // Non-fatal: the payment is safely recorded. Log so a missing staff
    // notification is diagnosable rather than invisible.
    console.error("[paystack-webhook] Failed to write staff notification", {
      bookingId,
      paystackRef,
      error: notifyError.message,
    });
  }

  // ── 10. Guest confirmation notification ──────────────────────
  if (isFullPayment || isOverPayment) {
    const [fullBookingResult, hotelResult] = await Promise.all([
      supabaseAdmin
        .from("bookings")
        .select(
          "id, reference, check_in, check_out, nights, total_amount, room_types(name), guests(full_name, email, phone)"
        )
        .eq("id", bookingId)
        .single(),
      supabaseAdmin
        .from("hotels")
        .select("name, currency, settings, check_in_time, check_out_time, phone, address")
        .eq("id", booking.hotel_id)
        .single(),
    ]);

    if (fullBookingResult.data && hotelResult.data) {
      const fullBooking = fullBookingResult.data;
      const hotel = hotelResult.data;

      const { sendBookingConfirmation } = await import(
        "@/lib/notifications/send-booking-confirmation"
      );

      const guest = fullBooking.guests as
        | { full_name?: string; email?: string; phone?: string }
        | null;
      const roomType = fullBooking.room_types as { name?: string } | null;
      const hotelSettings = (hotel.settings as Record<string, unknown>) ?? {};

      const result = await sendBookingConfirmation({
        hotelId: booking.hotel_id,
        bookingId: fullBooking.id,
        config: {
          hotelName: hotel.name,
          currency: hotel.currency ?? "GHS",
          notificationsEnabled: hotelSettings.sms_notifications_enabled !== false,
        },
        booking: {
          guestName: guest?.full_name ?? "Guest",
          guestEmail: guest?.email,
          guestPhone: guest?.phone,
          reference: fullBooking.reference,
          roomName: roomType?.name ?? "Room",
          checkIn: fullBooking.check_in,
          checkOut: fullBooking.check_out,
          nights: fullBooking.nights ?? 1,
          totalAmount: Number(fullBooking.total_amount),
          checkInTime: hotel.check_in_time,
          checkOutTime: hotel.check_out_time,
          hotelPhone: hotel.phone,
          hotelAddress: hotel.address,
        },
      });

      if (!result.success) {
        console.error("[paystack-webhook] Notification send failed", {
          bookingId: fullBooking.id,
          channel: result.channel,
          error: result.error,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
