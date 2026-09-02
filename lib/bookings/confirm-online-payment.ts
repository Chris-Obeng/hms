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
import { kickDeliveryWorker } from "@/lib/notifications/kick-delivery";
import {
  captureError,
  captureIssue,
  captureSupabaseError,
} from "@/lib/observability/sentry";

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
  | {
      outcome: "failed";
      error: string;
      /**
       * Whether re-delivering the same event could succeed.
       *
       * The Paystack webhook maps this to its status code, and the mapping is the
       * whole point: a 500 makes Paystack retry with an identical payload. For a
       * transient fault (Supabase down mid-insert) that is exactly right. For a
       * permanent one — wrong currency, unparseable amount, unknown booking — the
       * retry can never succeed, so a 500 buys a retry loop that runs until
       * Paystack gives up, with every attempt re-reporting to Sentry. Those
       * branches already alert the hotel for manual review, so they answer 200:
       * "received, and a human is on it".
       */
      retryable: boolean;
    };

interface RecordOnlinePaymentInput {
  bookingId: string;
  paystackReference: string;
  paystackId?: string | null;
  /** Major units (e.g. GHS), not pesewas. */
  amountPaid: number;
  currency?: string | null;
  subaccountCode?: string | null;
}

/**
 * Slack, in major units, when comparing what Paystack captured against what the
 * booking expects.
 *
 * It exists because both sides of the comparison were floats derived from
 * `amount / 100`, so an exact match could not be relied on. The conversion now
 * goes through `lib/money`, which makes the comparison exact for any amount that
 * was computed on this side — but a real charge can still differ by a minor unit
 * for reasons outside this codebase (a gateway-side fee split, a currency whose
 * exponent Paystack and RoomLine disagree on, an amount edited in the Paystack
 * dashboard).
 *
 * So the branch stays for one release and reports whenever it actually absorbs a
 * difference. If the reports stay empty, the tolerance can be dropped and the
 * comparison made exact; tightening a live payment path before that evidence
 * exists risks rejecting real money.
 */
const AMOUNT_TOLERANCE = 0.01;

/**
 * Insert a manual-review alert at most once per booking and dedupe key.
 *
 * Insert-first, not check-then-insert. The webhook and the verify fallback are
 * designed to race, so a SELECT that finds nothing proves nothing — both callers
 * can read "no alert yet" and both write. The guarantee lives in the partial
 * unique index on `(booking_id, dedupe_key)` added by
 * `supabase/migrations/20260830152038_notification_alert_dedupe_key.sql`; 23505
 * here means another writer got there first, which is the desired end state.
 *
 * `dedupeKey` is what uniqueness is keyed on, so it must stay machine-stable —
 * never the title, which is display text and gets reworded.
 *
 * Never throws: this runs on paths where the money is already captured, and
 * failing to notify must not turn into failing to record.
 */
async function alertOncePerBooking(
  hotelId: string,
  bookingId: string,
  type: string,
  dedupeKey: string,
  title: string,
  message: string
): Promise<void> {
  const { error } = await supabaseAdmin.from("notifications").insert({
    hotel_id: hotelId,
    type,
    title,
    message,
    booking_id: bookingId,
    dedupe_key: dedupeKey,
    is_read: false,
  });

  if (error) {
    // 23505 = the unique index did its job. Anything else means the hotel was not
    // told about a payment that needs a human, so it has to be visible.
    if (error.code !== "23505") {
      captureSupabaseError(error, "notifications.insert", {
        scope: "payments",
        level: "error",
        hotelId,
        bookingId,
        tags: { "notification.type": type },
        fingerprint: ["payments", "review-alert-insert-failed"],
      });
    }
    return;
  }

  kickDeliveryWorker();
}

export async function recordOnlinePayment(
  input: RecordOnlinePaymentInput
): Promise<PaymentRecording> {
  const { bookingId, paystackReference, amountPaid } = input;

  if (!(amountPaid > 0)) {
    // Also catches NaN, which is what a missing `amount` on the Paystack payload
    // arrives as after the pesewas division.
    captureIssue("Payment with non-positive amount", {
      scope: "payments",
      level: "error",
      bookingId,
      reference: paystackReference,
      contexts: { payment: { amountPaid, currency: input.currency ?? null } },
      fingerprint: ["payments", "non-positive-amount"],
    });
    return { outcome: "failed", error: "Non-positive amount", retryable: false };
  }

  // ── 1. Load the booking ──────────────────────────────────────
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, hotel_id, total_amount, currency, status, payment_status, cancellation_reason")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    captureSupabaseError(bookingError, "bookings.select", {
      scope: "payments",
      bookingId,
      reference: paystackReference,
    });
    return {
      outcome: "failed",
      error: `Booking lookup failed: ${bookingError.message}`,
      // Supabase was unreachable or timed out — the same event can succeed later.
      retryable: true,
    };
  }
  if (!booking) {
    // Money captured against a booking id that does not exist. The webhook
    // deliberately answers 200 here so Paystack stops retrying, which makes this
    // capture the only record that it happened.
    captureIssue("Payment for unknown booking", {
      scope: "payments",
      level: "error",
      bookingId,
      reference: paystackReference,
      contexts: { payment: { amountPaid, currency: input.currency ?? null } },
      fingerprint: ["payments", "booking-not-found"],
    });
    return { outcome: "failed", error: "Booking not found", retryable: false };
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
    // Wrong-currency capture: the hotel is paid in a currency it did not price in.
    captureIssue("Payment currency mismatch", {
      scope: "payments",
      level: "error",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      tags: { "payment.currency": input.currency },
      contexts: {
        payment: { amountPaid, received: input.currency, expected: bookingCurrency },
      },
      fingerprint: ["payments", "currency-mismatch"],
    });
    await alertOncePerBooking(
      booking.hotel_id,
      bookingId,
      "payment_failed",
      "payment-review:currency-mismatch",
      "⚠️ Payment Currency Mismatch",
      `Payment ${paystackReference} used currency ${input.currency} but booking expects ${bookingCurrency}. Manual review required.`
    );
    return { outcome: "failed", error: "Currency mismatch", retryable: false };
  }

  // ── 2. Classify the amount ───────────────────────────────────
  const delta = Math.abs(amountPaid - expectedAmount);
  const isFull = delta <= AMOUNT_TOLERANCE;
  const isOver = amountPaid > expectedAmount + AMOUNT_TOLERANCE;

  if (delta > 0 && delta <= AMOUNT_TOLERANCE) {
    // The tolerance is doing real work: the two amounts differ and this payment is
    // being treated as full anyway. Recorded at `info` because the outcome is
    // correct and no one needs paging — it is the evidence for whether the
    // tolerance can be removed. See AMOUNT_TOLERANCE.
    captureIssue("Payment amount matched only within tolerance", {
      scope: "payments",
      level: "info",
      bookingId,
      reference: paystackReference,
      contexts: {
        payment: {
          amount_paid: amountPaid,
          expected_amount: expectedAmount,
          delta,
          currency: bookingCurrency,
        },
      },
      fingerprint: ["payments", "amount-within-tolerance"],
    });
  }
  const isPartial = !isFull && !isOver && amountPaid < expectedAmount;

  if (!isFull && !isPartial && !isOver) {
    console.error("[payments/record] Unexpected amount", {
      bookingId,
      amountPaid,
      expectedAmount,
      paystackReference,
    });
    // Unreachable by the arithmetic above — reaching it means the classification
    // rules drifted, so the amount is neither full, partial nor over.
    captureIssue("Payment amount unclassifiable", {
      scope: "payments",
      level: "error",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      contexts: { payment: { amountPaid, expectedAmount, currency: bookingCurrency } },
      fingerprint: ["payments", "amount-unclassifiable"],
    });
    await alertOncePerBooking(
      booking.hotel_id,
      bookingId,
      "payment_failed",
      "payment-review:amount-invalid",
      "⚠️ Payment Amount Invalid",
      `Payment ${paystackReference}: received ${amountPaid.toFixed(2)}, expected ${expectedAmount.toFixed(2)}. Manual review required.`
    );
    return { outcome: "failed", error: "Unexpected amount", retryable: false };
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
    // Highest-severity state in this module: the guest has been charged and
    // RoomLine holds no record of it.
    captureSupabaseError(paymentInsertError, "payments.insert", {
      scope: "payments",
      level: "fatal",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      contexts: {
        payment: { amountPaid, expectedAmount, currency: bookingCurrency, notes },
      },
    });
    return {
      outcome: "failed",
      error: `Failed to record payment: ${paymentInsertError.message}`,
      // The guest is charged and RoomLine holds no record — a retry is the only
      // automated chance of closing that gap.
      retryable: true,
    };
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
    // Recorded, but no state change and no guest confirmation — a human has to
    // decide whether this is a refund, a duplicate charge or a stale link.
    captureIssue("Payment on non-active booking", {
      scope: "payments",
      level: "error",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      tags: {
        "booking.status": booking.status,
        "booking.payment_status": booking.payment_status,
      },
      contexts: {
        payment: { amountPaid, expectedAmount, currency: bookingCurrency },
        booking: {
          status: booking.status,
          payment_status: booking.payment_status,
          cancellation_reason: booking.cancellation_reason,
        },
      },
      fingerprint: ["payments", "non-active-booking", booking.status ?? "unknown"],
    });
    await alertOncePerBooking(
      booking.hotel_id,
      bookingId,
      "payment_failed",
      "payment-review:non-active-booking",
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

  // Accumulate atomically server-side: overwriting amount_paid with this
  // transaction's value would drop earlier partial payments from the total.
  const { data: cumulativePaid, error: accumulateError } = await supabaseAdmin.rpc(
    "add_online_payment_to_booking",
    { p_booking_id: bookingId, p_hotel_id: booking.hotel_id, p_amount: amountPaid }
  );

  if (accumulateError) {
    console.error("[payments/record] Failed to accumulate amount_paid", {
      bookingId,
      paystackReference,
      error: accumulateError.message,
    });
    // Silent financial drift: the payment row exists but bookings.amount_paid
    // never moved, so the balance shown to staff is wrong from here on.
    captureSupabaseError(accumulateError, "rpc.add_online_payment_to_booking", {
      scope: "payments",
      level: "fatal",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      contexts: { payment: { amountPaid, expectedAmount, currency: bookingCurrency } },
    });
  }

  // Classify against money actually collected across all transactions, not
  // just this one — two partial payments can together confirm the booking.
  const effectiveCumulative =
    typeof cumulativePaid === "number"
      ? cumulativePaid
      : Number.isFinite(Number(cumulativePaid))
        ? Number(cumulativePaid)
        : amountPaid;
  const cumulativelyFull = effectiveCumulative >= expectedAmount - AMOUNT_TOLERANCE;

  const newStatus = cumulativelyFull ? "confirmed" : "pending";
  const newPaymentStatus = cumulativelyFull ? "paid" : "partial";

  const { error: bookingUpdateError } = await supabaseAdmin
    .from("bookings")
    .update({
      status: newStatus,
      payment_status: newPaymentStatus,
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
    // Guest paid; booking still reads pending/cancelled. Needs a human before the
    // arrival date, so it is reported at the same severity as a lost payment row.
    captureSupabaseError(bookingUpdateError, "bookings.update", {
      scope: "payments",
      level: "fatal",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      tags: { "booking.target_status": newStatus },
      contexts: {
        payment: { amountPaid, cumulative: effectiveCumulative, expectedAmount },
        booking: {
          from_status: booking.status,
          to_status: newStatus,
          to_payment_status: newPaymentStatus,
        },
      },
    });
  }

  // ── 5. Staff notifications ───────────────────────────────────
  const balance = Math.max(0, expectedAmount - effectiveCumulative);
  const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
    hotel_id: booking.hotel_id,
    type: "payment_received",
    title: isPartial ? "Partial Payment Received" : isOver ? "Payment Received (overpaid)" : "Payment Received",
    message: `Online payment of ${bookingCurrency} ${amountPaid.toFixed(2)} ${
      cumulativelyFull ? "confirmed" : `(balance: ${balance.toFixed(2)})`
    }`,
    booking_id: bookingId,
    is_read: false,
  });
  kickDeliveryWorker();
  if (notifyError) {
    console.error("[payments/record] Failed to write staff notification", {
      bookingId,
      paystackReference,
      error: notifyError.message,
    });
    // Money is safe; the front desk simply never hears about it.
    captureSupabaseError(notifyError, "notifications.insert", {
      scope: "notifications",
      level: "warning",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      tags: { "notification.type": "payment_received" },
    });
  }

  if (!cumulativelyFull) return {
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
        // The confirmation email is the guest's only proof of the reservation, so
        // a silent send failure turns into a front-desk dispute on arrival day.
        captureIssue("Guest confirmation send failed", {
          scope: "notifications",
          level: "error",
          hotelId: booking.hotel_id,
          bookingId,
          reference: fullBooking.reference,
          tags: { "notification.channel": result.channel },
          contexts: { notification: { channel: result.channel, error: result.error } },
          fingerprint: ["notifications", "guest-confirmation-failed"],
        });
      }
    } else {
      captureSupabaseError(fullBookingResult.error, "bookings.select.confirmation", {
        scope: "notifications",
        hotelId: booking.hotel_id,
        bookingId,
        reference: paystackReference,
      });
      captureSupabaseError(hotelResult.error, "hotels.select.confirmation", {
        scope: "notifications",
        hotelId: booking.hotel_id,
        bookingId,
        reference: paystackReference,
      });
      if (!fullBookingResult.error && !hotelResult.error) {
        captureIssue("Guest confirmation skipped: booking or hotel row missing", {
          scope: "notifications",
          level: "error",
          hotelId: booking.hotel_id,
          bookingId,
          reference: paystackReference,
          fingerprint: ["notifications", "guest-confirmation-missing-rows"],
        });
      }
    }
  } catch (err) {
    console.error("[payments/record] Guest confirmation flow threw", {
      bookingId,
      err: err instanceof Error ? err.message : err,
    });
    // Swallowed on purpose — the payment is already recorded and the booking
    // confirmed, so this must not fail the webhook. Reported instead.
    captureError(err, {
      scope: "notifications",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      fingerprint: ["notifications", "guest-confirmation-threw"],
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
    captureSupabaseError(bookingResult.error, "bookings.select.staff_fanout", {
      scope: "notifications",
      hotelId,
      bookingId,
    });
    if (!bookingResult.error) {
      captureIssue("Staff fan-out skipped: booking row missing", {
        scope: "notifications",
        level: "error",
        hotelId,
        bookingId,
        fingerprint: ["notifications", "staff-fanout-booking-missing"],
      });
    }
    return;
  }

  // staff_profiles rows are org-scoped (no hotel_id column).
  const clerkOrgId = hotelResult.data?.clerk_org_id as string | undefined;
  if (!clerkOrgId) {
    console.error("[notifyStaffNewBooking] Hotel has no clerk org", { hotelId });
    // No org link means no staff member can ever be notified for this hotel — a
    // configuration fault, not a transient failure.
    captureIssue("Hotel has no Clerk organisation", {
      scope: "notifications",
      level: "error",
      hotelId,
      bookingId,
      fingerprint: ["notifications", "hotel-missing-clerk-org"],
    });
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
    captureSupabaseError(recipientsResult.error, "staff_profiles.select", {
      scope: "notifications",
      hotelId,
      bookingId,
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
    captureSupabaseError(error, "notifications.insert.staff_fanout", {
      scope: "notifications",
      hotelId,
      bookingId,
      contexts: { notification: { recipients: notifications.length } },
    });
    return;
  }
  kickDeliveryWorker();
}
