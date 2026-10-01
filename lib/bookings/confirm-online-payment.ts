/**
 * lib/bookings/confirm-online-payment.ts
 *
 * Single idempotent path for recording a successful Paystack online payment
 * and confirming the linked booking. Used by BOTH the Paystack webhook and
 * the guest-facing verify fallback — whichever arrives first performs the
 * work; the other short-circuits.
 *
 * Guarantees:
 * - Settlement is one locking RPC, `settle_online_payment_atomic`
 *   (supabase/migrations/20260911041418_atomic_online_payment_settlement.sql):
 *   it locks the booking, validates the durable payment attempt and the
 *   Paystack identity against it, inserts or loads the payment row,
 *   reconciles the balance from the successful-payment ledger, and
 *   transitions statuses — atomically, with no split writes on this side.
 * - Replay-safe: a duplicate delivery re-enters the RPC (so a stale booking
 *   projection is repaired rather than skipped) and is reported as
 *   `already_recorded` without re-notifying anyone.
 * - Staff notifications + guest confirmation email fire only when the RPC
 *   reports a durable confirmed transition — never on booking creation for
 *   pay-online flows, and never on replay.
 * - Currency mismatches fail closed before any write; the hotel is alerted
 *   instead of the guest receiving a false confirmation.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fromMinor, toMinor } from "@/lib/money";
import { fetchGroupRoomLines } from "@/lib/bookings/group-room-lines";
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
 * Substrings of the SQL exception messages `settle_online_payment_atomic`
 * raises when the captured money contradicts the durable record — identity,
 * currency, amount, subaccount, or a colliding Paystack reference/transaction
 * id. Redelivering the identical payload can never change those answers, so
 * they are permanent: the hotel is alerted for manual review and the webhook
 * stops the retry loop. Anything not on this list (the attempt not being
 * initialized yet, a lock timeout, a connection drop) is treated as transient
 * and answered with a 500 so Paystack redelivers.
 */
const PERMANENT_SETTLEMENT_FAILURES = [
  "invalid settlement identity",
  "booking not found or hotel mismatch",
  "payment attempt identity mismatch",
  "currency mismatch",
  "amount mismatch",
  "subaccount mismatch",
  "Paystack reference collision",
  "Paystack transaction ID collision",
] as const;

/**
 * Row shape of `settle_online_payment_atomic` (RETURNS TABLE arrives as an
 * array over PostgREST). `amount_paid_minor` is a Postgres bigint, so it is
 * accepted as number or string and narrowed with `Number(...)` at the boundary.
 */
interface SettlementRow {
  result: "recorded" | "already_recorded";
  booking_id: string;
  amount_paid_minor: number | string;
  payment_status: string;
  booking_status: string;
  partial_payment: boolean;
  already_recorded: boolean;
}

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

/**
 * Best-effort mirror of RoomLine's platform fee onto the settled payment row.
 *
 * The fee was computed at initialize and stashed in the attempt metadata as
 * `platform_fee_minor` (charge-currency subunits). Paystack realises it at
 * settlement through the split, so this only records it on `payments.platform_fee`
 * for reporting. Idempotent and self-healing: fills the column only while NULL,
 * so a replay repairs a prior miss and never double-writes. A zero/absent fee is
 * left NULL — the column was never written before the fee feature. Never throws:
 * the money is already recorded and this must not fail settlement.
 *
 * `attemptReference` is the raw reference the single `payment_attempts` row is
 * keyed by; `paymentReference` is the `payments` row to stamp — the raw reference
 * for a single room, the anchor's derived `<raw>::<groupId>` for a group.
 */
async function recordPlatformFee(
  attemptReference: string,
  paymentReference: string,
  currency: string,
  hotelId: string,
  bookingId: string
): Promise<void> {
  try {
    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from("payment_attempts")
      .select("metadata")
      .eq("paystack_reference", attemptReference)
      .maybeSingle();

    if (attemptError || !attempt) return;

    const metadata = attempt.metadata as { platform_fee_minor?: number | string } | null;
    const feeMinor = Number(metadata?.platform_fee_minor ?? 0);
    if (!Number.isFinite(feeMinor) || feeMinor <= 0) return;

    const feeMajor = fromMinor(feeMinor, currency);

    // Only ever fills a NULL, so a replay heals a prior miss without double-writing.
    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({ platform_fee: feeMajor })
      .eq("paystack_reference", paymentReference)
      .is("platform_fee", null);

    if (updateError) {
      captureSupabaseError(updateError, "payments.update.platform_fee", {
        scope: "payments",
        level: "warning",
        hotelId,
        bookingId,
        reference: paymentReference,
        fingerprint: ["payments", "platform-fee-record-failed"],
      });
    }
  } catch (err) {
    captureError(err, {
      scope: "payments",
      hotelId,
      bookingId,
      reference: paymentReference,
      fingerprint: ["payments", "platform-fee-record-threw"],
    });
  }
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
    .select("id, hotel_id, reference, total_amount, currency, status, payment_status, cancellation_reason")
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

  // ── 2. Settle in one locking RPC ─────────────────────────────
  // The RPC locks the booking, validates the durable payment attempt and the
  // Paystack identity against it, writes or loads the payment row, reconciles
  // the balance from the successful-payment ledger, and transitions statuses —
  // atomically. A duplicate delivery re-enters it on purpose: a stale booking
  // projection gets repaired rather than skipped.
  const { data: settleData, error: settleError } = await supabaseAdmin.rpc(
    "settle_online_payment_atomic",
    {
      p_booking_id: bookingId,
      p_hotel_id: booking.hotel_id,
      p_paystack_reference: paystackReference,
      p_paystack_id: input.paystackId ?? "",
      p_amount_minor: toMinor(amountPaid, bookingCurrency),
      p_currency: bookingCurrency,
      p_subaccount_code: input.subaccountCode ?? "",
      p_metadata: {
        booking_id: bookingId,
        hotel_id: booking.hotel_id,
        booking_reference: booking.reference,
      },
    }
  );

  if (settleError) {
    const permanent = PERMANENT_SETTLEMENT_FAILURES.some((m) =>
      settleError.message.includes(m)
    );
    if (permanent) {
      // The captured money contradicts the durable record — redelivery can never
      // change that answer, so the hotel is alerted for manual review and the
      // caller (webhook) stops the retry loop by answering 200.
      captureIssue("Online payment settlement rejected", {
        scope: "payments",
        level: "fatal",
        hotelId: booking.hotel_id,
        bookingId,
        reference: paystackReference,
        contexts: {
          payment: { amountPaid, expectedAmount, currency: bookingCurrency },
          settlement: { reason: settleError.message },
        },
        fingerprint: ["payments", "settlement-rejected"],
      });
      await alertOncePerBooking(
        booking.hotel_id,
        bookingId,
        "payment_failed",
        "payment-review:settlement-rejected",
        "⚠️ Payment Needs Manual Review",
        `Payment ${paystackReference} could not be settled automatically: ${settleError.message}. Money may be captured — review manually.`
      );
    } else {
      // Transient (attempt not initialized yet, lock timeout, connection drop):
      // a 500 asks Paystack to redeliver the identical payload.
      captureSupabaseError(settleError, "rpc.settle_online_payment_atomic", {
        scope: "payments",
        level: "fatal",
        hotelId: booking.hotel_id,
        bookingId,
        reference: paystackReference,
        contexts: {
          payment: { amountPaid, expectedAmount, currency: bookingCurrency },
        },
      });
    }
    return {
      outcome: "failed",
      error: `Settlement failed: ${settleError.message}`,
      retryable: !permanent,
    };
  }

  // RETURNS TABLE arrives as an array over PostgREST.
  const row = (Array.isArray(settleData) ? settleData[0] : settleData) as
    | SettlementRow
    | undefined;

  if (!row) {
    captureIssue("Settlement RPC returned no row", {
      scope: "payments",
      level: "fatal",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      fingerprint: ["payments", "settlement-empty"],
    });
    return { outcome: "failed", error: "Settlement returned no row", retryable: true };
  }

  const totalPaid = fromMinor(Number(row.amount_paid_minor), bookingCurrency);
  const fullyPaid = row.payment_status === "paid";
  const partial = !fullyPaid && row.partial_payment;

  // Mirror the platform fee onto the settled payments row (reporting only —
  // Paystack already split the money). Runs before every return below, so a
  // replay that lands on already_recorded still heals a prior miss.
  await recordPlatformFee(
    paystackReference,
    paystackReference,
    bookingCurrency,
    booking.hotel_id,
    bookingId
  );

  if (row.already_recorded || row.result === "already_recorded") {
    // Retry or the other path beat us here. Idempotency working as designed —
    // never re-notify.
    return {
      outcome: "already_recorded",
      bookingId,
      hotelId: booking.hotel_id,
      fullyPaid,
      partial,
    };
  }

  // Money is recorded. A booking that is no longer active (staff-cancelled,
  // no-show) keeps its state by RPC design — the payment lands, a human decides
  // what it means, and nobody is notified as if the booking came back.
  if (row.booking_status !== "pending" && row.booking_status !== "confirmed") {
    captureIssue("Payment on non-active booking", {
      scope: "payments",
      level: "error",
      hotelId: booking.hotel_id,
      bookingId,
      reference: paystackReference,
      tags: {
        "booking.status": row.booking_status,
        "booking.payment_status": row.payment_status,
      },
      contexts: {
        payment: { amountPaid, expectedAmount, currency: bookingCurrency },
        booking: {
          status: row.booking_status,
          payment_status: row.payment_status,
          cancellation_reason: booking.cancellation_reason,
        },
      },
      fingerprint: ["payments", "non-active-booking", row.booking_status ?? "unknown"],
    });
    await alertOncePerBooking(
      booking.hotel_id,
      bookingId,
      "payment_failed",
      "payment-review:non-active-booking",
      "⚠️ Payment on Non-Active Booking",
      `Payment ${paystackReference} succeeded but booking status is "${row.booking_status}". Money recorded — review manually.`
    );
    return {
      outcome: "recorded",
      bookingId,
      hotelId: booking.hotel_id,
      fullyPaid,
      partial,
      bookingStateUnchanged: true,
    };
  }

  // ── 3. Staff payment notification ────────────────────────────
  const balance = Math.max(0, expectedAmount - totalPaid);
  const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
    hotel_id: booking.hotel_id,
    type: "payment_received",
    title: partial ? "Partial Payment Received" : "Payment Received",
    message: `Online payment of ${bookingCurrency} ${amountPaid.toFixed(2)} ${
      fullyPaid ? "confirmed" : `(balance: ${balance.toFixed(2)})`
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

  if (!(fullyPaid && row.booking_status === "confirmed")) {
    return {
      outcome: "recorded",
      bookingId,
      hotelId: booking.hotel_id,
      fullyPaid,
      partial,
    };
  }

  // Fully paid → this is the moment the booking becomes real for the hotel.
  // Fan out the same "new online booking" alert used by pay-at-check-in.
  await notifyStaffNewBooking(booking.hotel_id, bookingId);

  // ── 4. Guest confirmation email/push ─────────────────────────
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

interface RecordOnlineGroupPaymentInput {
  /** Anchor booking id; equals `bookings.group_id` for every line. */
  groupId: string;
  /** Raw group reference the single attempt is keyed by (no `::` suffix). */
  paystackReference: string;
  paystackId?: string | null;
  /** Major units. The one charge covers the whole group total. */
  amountPaid: number;
  currency?: string | null;
  subaccountCode?: string | null;
}

/**
 * Permanent-failure substrings for `settle_online_group_payment_atomic`. Same
 * contradictions as the single settler plus the group's own "reservation group
 * not found" wording; "payment attempt is not initialized" is deliberately
 * absent so a webhook that races ahead of the attempt commit still retries.
 */
const GROUP_PERMANENT_SETTLEMENT_FAILURES = [
  "invalid settlement identity",
  "reservation group not found or hotel mismatch",
  "payment attempt identity mismatch",
  "currency mismatch",
  "amount mismatch",
  "subaccount mismatch",
  "Paystack reference collision",
  "Paystack transaction ID collision",
] as const;

/**
 * Group sibling of `recordOnlinePayment`: records ONE verified Paystack charge
 * against a whole reservation group by delegating to
 * `settle_online_group_payment_atomic`, which splits it into one payments row
 * per line (real `paystack_id` on the anchor only, derived per-line references)
 * and flips every line pending → confirmed. Same idempotency, currency guard and
 * permanent-vs-transient mapping as the single path; the charge equals the sum
 * of the lines' totals (validated inside the RPC), never the anchor's own total.
 */
export async function recordOnlineGroupPayment(
  input: RecordOnlineGroupPaymentInput
): Promise<PaymentRecording> {
  const { groupId, paystackReference, amountPaid } = input;

  if (!(amountPaid > 0)) {
    captureIssue("Group payment with non-positive amount", {
      scope: "payments",
      level: "error",
      bookingId: groupId,
      reference: paystackReference,
      contexts: { payment: { amountPaid, currency: input.currency ?? null } },
      fingerprint: ["payments", "group-non-positive-amount"],
    });
    return { outcome: "failed", error: "Non-positive amount", retryable: false };
  }

  // ── 1. Load the anchor row (id = group_id) ───────────────────
  // group_id itself is not selected: it is unread here — the RPC validates the
  // group — so there is nothing to gain from loading it.
  const { data: anchor, error: anchorError } = await supabaseAdmin
    .from("bookings")
    .select("id, hotel_id, reference, currency")
    .eq("id", groupId)
    .maybeSingle();

  if (anchorError) {
    captureSupabaseError(anchorError, "bookings.select.group_anchor", {
      scope: "payments",
      bookingId: groupId,
      reference: paystackReference,
    });
    return {
      outcome: "failed",
      error: `Group anchor lookup failed: ${anchorError.message}`,
      retryable: true,
    };
  }
  if (!anchor) {
    captureIssue("Group payment for unknown anchor", {
      scope: "payments",
      level: "error",
      bookingId: groupId,
      reference: paystackReference,
      contexts: { payment: { amountPaid, currency: input.currency ?? null } },
      fingerprint: ["payments", "group-anchor-not-found"],
    });
    return { outcome: "failed", error: "Reservation group not found", retryable: false };
  }

  const hotelId = anchor.hotel_id;
  const groupCurrency = anchor.currency ?? "GHS";

  // Currency guard — mirror the single path; a mismatch is manual review.
  if (input.currency && input.currency !== groupCurrency) {
    captureIssue("Group payment currency mismatch", {
      scope: "payments",
      level: "error",
      hotelId,
      bookingId: groupId,
      reference: paystackReference,
      tags: { "payment.currency": input.currency },
      contexts: {
        payment: { amountPaid, received: input.currency, expected: groupCurrency },
      },
      fingerprint: ["payments", "group-currency-mismatch"],
    });
    await alertOncePerBooking(
      hotelId,
      groupId,
      "payment_failed",
      "payment-review:group-currency-mismatch",
      "⚠️ Payment Currency Mismatch",
      `Group payment ${paystackReference} used currency ${input.currency} but reservation expects ${groupCurrency}. Manual review required.`
    );
    return { outcome: "failed", error: "Currency mismatch", retryable: false };
  }

  // ── 2. Split-settle the whole group in one locking RPC ───────
  const { data: settleData, error: settleError } = await supabaseAdmin.rpc(
    "settle_online_group_payment_atomic",
    {
      p_group_id: groupId,
      p_hotel_id: hotelId,
      p_paystack_reference: paystackReference,
      p_paystack_id: input.paystackId ?? "",
      p_amount_minor: toMinor(amountPaid, groupCurrency),
      p_currency: groupCurrency,
      p_subaccount_code: input.subaccountCode ?? "",
      p_metadata: {
        group_id: groupId,
        hotel_id: hotelId,
        group_reference: anchor.reference,
      },
    }
  );

  if (settleError) {
    const permanent = GROUP_PERMANENT_SETTLEMENT_FAILURES.some((m) =>
      settleError.message.includes(m)
    );
    if (permanent) {
      captureIssue("Online group settlement rejected", {
        scope: "payments",
        level: "fatal",
        hotelId,
        bookingId: groupId,
        reference: paystackReference,
        contexts: {
          payment: { amountPaid, currency: groupCurrency },
          settlement: { reason: settleError.message },
        },
        fingerprint: ["payments", "group-settlement-rejected"],
      });
      await alertOncePerBooking(
        hotelId,
        groupId,
        "payment_failed",
        "payment-review:group-settlement-rejected",
        "⚠️ Payment Needs Manual Review",
        `Group payment ${paystackReference} could not be settled automatically: ${settleError.message}. Money may be captured — review manually.`
      );
    } else {
      captureSupabaseError(settleError, "rpc.settle_online_group_payment_atomic", {
        scope: "payments",
        level: "fatal",
        hotelId,
        bookingId: groupId,
        reference: paystackReference,
        contexts: { payment: { amountPaid, currency: groupCurrency } },
      });
    }
    return {
      outcome: "failed",
      error: `Group settlement failed: ${settleError.message}`,
      retryable: !permanent,
    };
  }

  const row = settleData?.[0];

  if (!row) {
    captureIssue("Group settlement RPC returned no row", {
      scope: "payments",
      level: "fatal",
      hotelId,
      bookingId: groupId,
      reference: paystackReference,
      fingerprint: ["payments", "group-settlement-empty"],
    });
    return { outcome: "failed", error: "Settlement returned no row", retryable: true };
  }

  const allConfirmed = row.all_confirmed === true;

  // Group fee lives on the anchor's payments row only (derived `<raw>::<groupId>`
  // reference); the single attempt is keyed by the raw group reference. Runs
  // before every return, so a replay on already_recorded still self-heals.
  await recordPlatformFee(
    paystackReference,
    `${paystackReference}::${groupId}`,
    groupCurrency,
    hotelId,
    groupId
  );

  if (row.already_recorded || row.result === "already_recorded") {
    // Retry, or the other path won the race. Never re-notify.
    return {
      outcome: "already_recorded",
      bookingId: groupId,
      hotelId,
      fullyPaid: allConfirmed,
      partial: false,
    };
  }

  // ── 3. Staff payment notification (one per group) ────────────
  const totalPaid = fromMinor(Number(row.amount_paid_minor), groupCurrency);

  // Rooms label = SUM(max(1, rooms_count)) across the group, not the line count.
  const { data: roomCountRows } = await supabaseAdmin
    .from("bookings")
    .select("rooms_count")
    .eq("group_id", groupId)
    .eq("hotel_id", hotelId);
  const roomsTotal = (roomCountRows ?? []).reduce(
    (sum, r) => sum + Math.max(1, r.rooms_count ?? 1),
    0
  );
  const roomsLabel =
    roomsTotal > 0
      ? `${roomsTotal} ${roomsTotal === 1 ? "room" : "rooms"}`
      : `${row.line_count} rooms`;

  const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
    hotel_id: hotelId,
    type: "payment_received",
    title: "Payment Received",
    message: `Online payment of ${groupCurrency} ${totalPaid.toFixed(2)} for ${roomsLabel} ${allConfirmed ? "confirmed" : "recorded"}`,
    booking_id: groupId,
    is_read: false,
  });
  kickDeliveryWorker();
  if (notifyError) {
    captureSupabaseError(notifyError, "notifications.insert.group", {
      scope: "notifications",
      level: "warning",
      hotelId,
      bookingId: groupId,
      reference: paystackReference,
      tags: { "notification.type": "payment_received" },
    });
  }

  // A line that was no longer active keeps its state by RPC design, so the group
  // did not fully confirm. Money is recorded; a human decides what it means.
  if (!allConfirmed) {
    captureIssue("Group payment did not fully confirm", {
      scope: "payments",
      level: "error",
      hotelId,
      bookingId: groupId,
      reference: paystackReference,
      contexts: { settlement: { line_count: row.line_count, all_confirmed: false } },
      fingerprint: ["payments", "group-not-all-confirmed"],
    });
    await alertOncePerBooking(
      hotelId,
      groupId,
      "payment_failed",
      "payment-review:group-not-all-confirmed",
      "⚠️ Group Payment Needs Review",
      `Group payment ${paystackReference} recorded but not every room confirmed. Money recorded — review manually.`
    );
    return {
      outcome: "recorded",
      bookingId: groupId,
      hotelId,
      fullyPaid: false,
      partial: false,
      bookingStateUnchanged: true,
    };
  }

  // Fully confirmed → the reservation is real. One staff fan-out (rooms summary
  // instead of a single room type) and one guest confirmation for the group.
  await notifyStaffNewBooking(hotelId, groupId, roomsLabel);

  // ── 4. Guest confirmation (one email, group summary) ─────────
  try {
    const [anchorFullResult, hotelResult] = await Promise.all([
      supabaseAdmin
        .from("bookings")
        .select("id, reference, check_in, check_out, nights, guests(full_name, email, phone)")
        .eq("id", groupId)
        .single(),
      supabaseAdmin
        .from("hotels")
        .select("name, currency, check_in_time, check_out_time, phone, address")
        .eq("id", hotelId)
        .single(),
    ]);

    const anchorFull = anchorFullResult.data;
    const hotel = hotelResult.data;

    if (anchorFull && hotel) {
      const guest = anchorFull.guests as
        | { full_name?: string; email?: string; phone?: string }
        | null;

      const result = await sendBookingConfirmation({
        hotelId,
        bookingId: anchorFull.id,
        config: { hotelName: hotel.name, currency: hotel.currency ?? "GHS" },
        booking: {
          guestName: guest?.full_name ?? "Guest",
          guestEmail: guest?.email,
          reference: anchorFull.reference,
          roomName: roomsLabel,
          rooms: await fetchGroupRoomLines(groupId),
          checkIn: anchorFull.check_in,
          checkOut: anchorFull.check_out,
          nights: anchorFull.nights ?? 1,
          totalAmount: totalPaid,
          checkInTime: hotel.check_in_time,
          checkOutTime: hotel.check_out_time,
          hotelPhone: hotel.phone,
          hotelAddress: hotel.address,
        },
      });

      if (!result.success) {
        captureIssue("Group guest confirmation send failed", {
          scope: "notifications",
          level: "error",
          hotelId,
          bookingId: groupId,
          reference: anchorFull.reference,
          tags: { "notification.channel": result.channel },
          contexts: { notification: { channel: result.channel, error: result.error } },
          fingerprint: ["notifications", "group-guest-confirmation-failed"],
        });
      }
    } else {
      captureSupabaseError(anchorFullResult.error, "bookings.select.group_confirmation", {
        scope: "notifications",
        hotelId,
        bookingId: groupId,
        reference: paystackReference,
      });
      captureSupabaseError(hotelResult.error, "hotels.select.group_confirmation", {
        scope: "notifications",
        hotelId,
        bookingId: groupId,
        reference: paystackReference,
      });
    }
  } catch (err) {
    // Swallowed: the payment is recorded and the group confirmed; a notification
    // fault must not fail the webhook. Reported instead.
    captureError(err, {
      scope: "notifications",
      hotelId,
      bookingId: groupId,
      reference: paystackReference,
      fingerprint: ["notifications", "group-guest-confirmation-threw"],
    });
  }

  return {
    outcome: "recorded",
    bookingId: groupId,
    hotelId,
    fullyPaid: true,
    partial: false,
  };
}


/**
 * Fan out an in-app (+ push via existing triggers) "new online booking"
 * notification to every eligible active staff member of the hotel.
 *
 * `roomsSummary` overrides the single room-type label for a multi-room
 * reservation (e.g. "3 rooms"); omitted, the single-room path is unchanged.
 */
export async function notifyStaffNewBooking(
  hotelId: string,
  bookingId: string,
  roomsSummary?: string
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
      message: `${booking.reference} · ${guest?.full_name ?? "Guest"} · ${roomsSummary ?? roomType?.name ?? "Room"} · ${booking.check_in} → ${booking.check_out}`,
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
