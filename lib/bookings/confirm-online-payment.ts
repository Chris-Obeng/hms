/**
 * lib/bookings/confirm-online-payment.ts
 *
 * Single idempotent path for recording a successful Paystack online payment
 * and confirming the linked booking. Used by BOTH the Paystack webhook and
 * the guest-facing verify fallback — whichever arrives first performs the
 * work; the other short-circuits.
 *
 * Guarantees:
 * - Idempotent on payments.paystack_reference (UNIQUE constraint). A concurrent
 *   duplicate insert fails with 23505 and is reported as `already_recorded`.
 * - Staff notifications + guest confirmation email fire only after the money
 *   is captured — never on booking creation for pay-online flows.
 * - Partial / over / mismatched amounts are recorded with audit notes; the
 *   hotel is alerted instead of the guest receiving a false confirmation.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendBookingConfirmation } from "@/lib/notifications/send-booking-confirmation";

export type PaymentRecording =
  | {
      outcome: "recorded" | "already_recorded";
      bookingId: string;
      hotelId: string;
      fullyPaid: boolean;
      partial: boolean;
      /** Money recorded but booking state left untouched (non-active booking). */
      bookingStateUnchanged?: boolean;
    }
  | { outcome: "failed"; error: string };

interface RecordOnlinePaymentInput {
  bookingId: string;
  paystackReference: string;
  paystackId?: string | null;
  /** Major units (e.g. GHS), not pesewas. */
  amountPaid: number;
  currency?: string | null;
  subaccountCode?: string | null;
}

const AMOUNT_TOLERANCE = 0.01;

/**
 * Insert a manual-review alert at most once per booking+type — webhook retries
 * must not spam the hotel's notification feed.
 */
async function alertOncePerBooking(
  hotelId: string,
  bookingId: string,
  type: string,
  title: string,
  message: string
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("type", type)
    .eq("title", title)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  await supabaseAdmin.from("notifications").insert({
    hotel_id: hotelId,
    type,
    title,
    message,
    booking_id: bookingId,
    is_read: false,
  });
}

export async function recordOnlinePayment(
  input: RecordOnlinePaymentInput
): Promise<PaymentRecording> {
  const { bookingId, paystackReference, amountPaid } = input;

  if (!(amountPaid > 0)) {
    return { outcome: "failed", error: "Non-positive amount" };
  }

  // ── 1. Load the booking ──────────────────────────────────────
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, hotel_id, total_amount, currency, status, payment_status, cancellation_reason")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    return { outcome: "failed", error: `Booking lookup failed: ${bookingError.message}` };
  }
  if (!booking) {
    return { outcome: "failed", error: "Booking not found" };
  }

  const expectedAmount = Number(booking.total_amount);
  const bookingCurrency = booking.currency ?? "GHS";

  // Currency guard — a mismatch means manual review, never auto-confirm.
  if (input.currency && input.currency !== bookingCurrency) {
    console.error("[payments/record] Currency mismatch", {
      bookingId,
      received: input.currency,
      expected: bookingCurrency,
      paystackReference,
    });
    await alertOncePerBooking(
      booking.hotel_id,
      bookingId,
      "payment_failed",
      "⚠️ Payment Currency Mismatch",
      `Payment ${paystackReference} used currency ${input.currency} but booking expects ${bookingCurrency}. Manual review required.`
    );
    return { outcome: "failed", error: "Currency mismatch" };
  }

  // ── 2. Classify the amount ───────────────────────────────────
  const delta = Math.abs(amountPaid - expectedAmount);
  const isFull = delta <= AMOUNT_TOLERANCE;
  const isOver = amountPaid > expectedAmount + AMOUNT_TOLERANCE;
  const isPartial = !isFull && !isOver && amountPaid < expectedAmount;

  if (!isFull && !isPartial && !isOver) {
    console.error("[payments/record] Unexpected amount", {
      bookingId,
      amountPaid,
      expectedAmount,
      paystackReference,
    });
    await alertOncePerBooking(
      booking.hotel_id,
      bookingId,
      "payment_failed",
      "⚠️ Payment Amount Invalid",
      `Payment ${paystackReference}: received ${amountPaid.toFixed(2)}, expected ${expectedAmount.toFixed(2)}. Manual review required.`
    );
    return { outcome: "failed", error: "Unexpected amount" };
  }

  // ── 3. Persist the payment (UNIQUE ref = race-safe idempotency) ──
  let notes: string | null = null;
  if (isPartial) {
    notes = `Partial payment: received ${amountPaid.toFixed(2)}, expected ${expectedAmount.toFixed(2)}`;
  } else if (isOver) {
    notes = `Overpayment: received ${amountPaid.toFixed(2)}, expected ${expectedAmount.toFixed(2)}`;
  }

  const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert({
    hotel_id: booking.hotel_id,
    booking_id: bookingId,
    amount: amountPaid,
    currency: bookingCurrency,
    method: "card",
    status: "success",
    paystack_reference: paystackReference,
    paystack_id: input.paystackId ? String(input.paystackId) : null,
    paystack_subaccount: input.subaccountCode ?? null,
    paid_at: new Date().toISOString(),
    notes,
  });

  if (paymentInsertError) {
    if (paymentInsertError.code === "23505") {
      // Webhook + verify raced; the winner already did everything below.
      return {
        outcome: "already_recorded",
        bookingId,
        hotelId: booking.hotel_id,
        fullyPaid: isFull || isOver,
        partial: isPartial,
      };
    }
    // Money captured but not persisted → caller should signal retry (500).
    return { outcome: "failed", error: `Failed to record payment: ${paymentInsertError.message}` };
  }

  // ── 4. Update booking state ──────────────────────────────────
  // Money is truth: a captured payment confirms a pending hold. A hold the
  // 30-min expiry cron cancelled while the payment was still in flight must
  // come back to life (guest closed the browser, webhook landed late). Any
  // other cancelled/terminal state keeps its state — we still record the
  // money above and alert the hotel instead of silently resurrecting.
  const wasTimeoutCancelled =
    booking.status === "cancelled" &&
    booking.cancellation_reason === "payment_timeout";

  if (booking.status !== "pending" && !wasTimeoutCancelled) {
    await alertOncePerBooking(
      booking.hotel_id,
      bookingId,
      "payment_failed",
      "⚠️ Payment on Non-Active Booking",
      `Payment ${paystackReference} succeeded but booking status is "${booking.status}". Money recorded — review manually.`
    );
    return {
      outcome: "recorded",
      bookingId,
      hotelId: booking.hotel_id,
      fullyPaid: isFull || isOver,
      partial: isPartial,
      bookingStateUnchanged: true,
    };
  }

  const newStatus = isFull || isOver ? "confirmed" : "pending";
  const newPaymentStatus = isFull || isOver ? "paid" : "partial";

  const { error: bookingUpdateError } = await supabaseAdmin
    .from("bookings")
    .update({
      status: newStatus,
      payment_status: newPaymentStatus,
      amount_paid: amountPaid,
      ...(wasTimeoutCancelled ? { cancelled_at: null, cancellation_reason: null } : {}),
    })
    .eq("id", bookingId)
    .eq("hotel_id", booking.hotel_id);

  if (bookingUpdateError) {
    // Payment row persisted — never 500 past this point or a Paystack retry
    // would short-circuit at the UNIQUE check and lose these side effects.
    console.error("[payments/record] Payment recorded but booking update failed", {
      bookingId,
      paystackReference,
      error: bookingUpdateError.message,
    });
  }

  // ── 5. Staff notifications ───────────────────────────────────
  const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
    hotel_id: booking.hotel_id,
    type: "payment_received",
    title: isPartial ? "Partial Payment Received" : isOver ? "Payment Received (overpaid)" : "Payment Received",
    message: `Online payment of ${bookingCurrency} ${amountPaid.toFixed(2)} ${
      isPartial ? `(partial — balance: ${(expectedAmount - amountPaid).toFixed(2)})` : "confirmed"
    }`,
    booking_id: bookingId,
    is_read: false,
  });
  if (notifyError) {
    console.error("[payments/record] Failed to write staff notification", {
      bookingId,
      paystackReference,
      error: notifyError.message,
    });
  }

  if (!isFull && !isOver) return {
    outcome: "recorded",
    bookingId,
    hotelId: booking.hotel_id,
    fullyPaid: false,
    partial: true,
  };

  // Fully paid → this is the moment the booking becomes real for the hotel.
  // Fan out the same "new online booking" alert used by pay-at-check-in.
  await notifyStaffNewBooking(booking.hotel_id, bookingId);

  // ── 6. Guest confirmation email/push ─────────────────────────
  try {
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
        .select("name, currency, check_in_time, check_out_time, phone, address")
        .eq("id", booking.hotel_id)
        .single(),
    ]);

    const fullBooking = fullBookingResult.data;
    const hotel = hotelResult.data;

    if (fullBooking && hotel) {
      const guest = fullBooking.guests as
        | { full_name?: string; email?: string; phone?: string }
        | null;
      const roomType = fullBooking.room_types as { name?: string } | null;

      const result = await sendBookingConfirmation({
        hotelId: booking.hotel_id,
        bookingId: fullBooking.id,
        config: { hotelName: hotel.name, currency: hotel.currency ?? "GHS" },
        booking: {
          guestName: guest?.full_name ?? "Guest",
          guestEmail: guest?.email,
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
        console.error("[payments/record] Guest notification send failed", {
          bookingId,
          channel: result.channel,
          error: result.error,
        });
      }
    }
  } catch (err) {
    console.error("[payments/record] Guest confirmation flow threw", {
      bookingId,
      err: err instanceof Error ? err.message : err,
    });
  }

  return {
    outcome: "recorded",
    bookingId,
    hotelId: booking.hotel_id,
    fullyPaid: true,
    partial: false,
  };
}

/**
 * Fan out an in-app (+ push via existing triggers) "new online booking"
 * notification to every eligible active staff member of the hotel.
 */
export async function notifyStaffNewBooking(
  hotelId: string,
  bookingId: string
): Promise<void> {
  const [bookingResult, hotelResult] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select(
        "reference, check_in, check_out, guests(full_name), room_types(name)"
      )
      .eq("id", bookingId)
      .maybeSingle(),
    supabaseAdmin
      .from("hotels")
      .select("clerk_org_id")
      .eq("id", hotelId)
      .single(),
  ]);

  const booking = bookingResult.data;
  if (!booking) {
    console.error("[notifyStaffNewBooking] Booking not found", { hotelId, bookingId });
    return;
  }

  // staff_profiles rows are org-scoped (no hotel_id column).
  const clerkOrgId = hotelResult.data?.clerk_org_id as string | undefined;
  if (!clerkOrgId) {
    console.error("[notifyStaffNewBooking] Hotel has no clerk org", { hotelId });
    return;
  }

  const recipientsResult = await supabaseAdmin
    .from("staff_profiles")
    .select("id, notification_prefs")
    .eq("clerk_org_id", clerkOrgId)
    .eq("is_active", true);

  if (recipientsResult.error) {
    console.error("[notifyStaffNewBooking] Recipients lookup failed", {
      hotelId,
      error: recipientsResult.error.message,
    });
    return;
  }

  const guest = booking.guests as { full_name?: string | null } | null;
  const roomType = booking.room_types as { name?: string | null } | null;

  const notifications = recipientsResult.data
    .filter((staff) => (staff.notification_prefs as Record<string, boolean> | null)?.new_booking !== false)
    .map((staff) => ({
      hotel_id: hotelId,
      recipient_staff_id: staff.id,
      created_by_staff_id: null,
      type: "new_booking",
      title: "New online booking",
      message: `${booking.reference} · ${guest?.full_name ?? "Guest"} · ${roomType?.name ?? "Room"} · ${booking.check_in} → ${booking.check_out}`,
      booking_id: bookingId,
      is_read: false,
    }));

  if (!notifications.length) return;

  const { error } = await supabaseAdmin.from("notifications").insert(notifications);
  if (error) {
    console.error("[notifyStaffNewBooking] Fan-out insert failed", {
      hotelId,
      bookingId,
      error: error.message,
    });
  }
}
