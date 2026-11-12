import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import {
  alertOncePerBooking,
  recordOnlinePayment,
  recordOnlineGroupPayment,
} from "@/lib/bookings/confirm-online-payment";
import { extractSubaccountCode, getPaystackMode } from "@/lib/paystack";
import { formatMoney, fromMinor } from "@/lib/money";
import { createHmac, timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import {
  captureError,
  captureIssue,
  captureSupabaseError,
  flushSentry,
} from "@/lib/observability/sentry";

/**
 * Throttle for the signature-mismatch report.
 *
 * The report is triggered by an unauthenticated caller: anyone who can reach this
 * URL can send a junk `x-paystack-signature` header, and before this throttle each
 * attempt minted a Sentry `error` event. That is a free lever on the project's
 * event quota — and the quota is shared with the payment failures that actually
 * need to page someone.
 *
 * One report per interval per instance is enough, because the fingerprint is fixed:
 * the useful signal is "mismatches are happening" (usually a rotated secret on one
 * side), never the individual count.
 */
const MISMATCH_REPORT_INTERVAL_MS = 5 * 60 * 1000;
let lastMismatchReport = 0;

/**
 * POST /api/webhooks/paystack
 *
 * Receives Paystack charge.success events. Primary payment confirmation path.
 * The verify route is an idempotent fallback — both share the same
 * recordOnlinePayment() pipeline, so whichever arrives first performs the
 * work and the other is a no-op (UNIQUE paystack_reference).
 *
 * Security:
 * - HMAC-SHA512 signature verified with timingSafeEqual (prevents timing attacks)
 * - Amount validated against booking.total_amount (prevents under-payment exploits)
 * - Idempotent on paystack_reference (safe to retry)
 * - Cross-tenant: hotel_id comes from booking row, not from client metadata
 * - Rate limited per IP. The limit is set well above Paystack's own retry
 *   behaviour, so it only ever bites on a flood; unauthenticated callers cannot
 *   make this route do unbounded HMAC and Sentry work.
 *
 * Observability:
 * - Every branch that acknowledges an event without recording money reports to
 *   Sentry. Nothing here changes status codes or control flow — a webhook that
 *   answered 200 yesterday still answers 200.
 * - The raw body is never sent to Sentry: Paystack payloads carry customer email
 *   and card metadata. Only the reference, booking id and sizes travel.
 * - Sentry is flushed in a `finally`, because a serverless isolate can freeze the
 *   instant the response resolves and drop in-flight events.
 */
export async function POST(req: NextRequest) {
  try {
    return await handleWebhook(req);
  } catch (error) {
    captureError(error, {
      scope: "paystack-webhook",
      step: "payment_webhook",
      level: "fatal",
      fingerprint: ["paystack-webhook", "unhandled"],
    });
    // 500, not 200: an unhandled throw means money may be captured with nothing
    // recorded, so Paystack must retry.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  } finally {
    await flushSentry();
  }
}

async function handleWebhook(req: NextRequest) {
  // Ahead of the body read and the HMAC, so a flood costs one Redis call. 120/min
  // leaves ample headroom: Paystack retries an individual event on a backoff, and
  // a busy hotel group's real peak is a few events per minute.
  const rl = await rateLimit(req, { name: "paystack-webhook", limit: 120, windowSeconds: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const rawBody = await req.text();

  // ── 1. Signature verification ────────────────────────────────
  const sig = req.headers.get("x-paystack-signature") ?? "";
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    console.error("[paystack-webhook] PAYSTACK_SECRET_KEY not configured");
    // Every payment confirmation for every hotel is down until this is fixed.
    captureIssue("PAYSTACK_SECRET_KEY not configured", {
      scope: "paystack-webhook",
      step: "payment_webhook",
      level: "fatal",
      fingerprint: ["paystack-webhook", "missing-secret"],
    });
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");

  // timingSafeEqual requires same-length buffers; pre-check strict 128-char hex
  const validHexSig = /^[0-9a-f]{128}$/i.test(sig);
  const sigBuf = validHexSig ? Buffer.from(sig, "hex") : Buffer.alloc(0);
  const expBuf = Buffer.from(expected, "hex");

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    // Only signed-but-wrong requests are reported, and only once per interval —
    // both halves matter. An unsigned request is a port scanner, and a signed-but
    // -wrong one is still attacker-controlled, so the report has to be throttled
    // as well as filtered. A real mismatch usually means the Paystack secret was
    // rotated on one side, and one event says that as well as ten thousand.
    const now = Date.now();
    if (sig && now - lastMismatchReport >= MISMATCH_REPORT_INTERVAL_MS) {
      lastMismatchReport = now;
      captureIssue("Paystack webhook signature mismatch", {
        scope: "paystack-webhook",
        step: "payment_webhook",
        level: "error",
        contexts: {
          signature: {
            received_bytes: sigBuf.length,
            expected_bytes: expBuf.length,
            body_bytes: rawBody.length,
          },
        },
        fingerprint: ["paystack-webhook", "signature-mismatch"],
      });
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 2. Parse event ───────────────────────────────────────────
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    // The signature already proved Paystack sent this, so unparseable JSON is a
    // payload change or a truncated body, not an attack.
    captureIssue("Paystack webhook body is not JSON", {
      scope: "paystack-webhook",
      step: "payment_webhook",
      level: "error",
      contexts: { request: { body_bytes: rawBody.length } },
      fingerprint: ["paystack-webhook", "invalid-json"],
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = typeof event.event === "string" ? event.event : "";
  const eventData =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : {};

  // Mode isolation (`BLK-04`): reject payloads whose domain contradicts active runtime mode.
  const nestedTxn =
    eventData.transaction && typeof eventData.transaction === "object"
      ? (eventData.transaction as Record<string, unknown>)
      : null;
  const payloadDomain =
    typeof eventData.domain === "string"
      ? eventData.domain
      : typeof nestedTxn?.domain === "string"
        ? nestedTxn.domain
        : null;
  const activeMode = getPaystackMode();
  if (payloadDomain && payloadDomain !== activeMode) {
    captureIssue("Paystack webhook domain mismatch", {
      scope: "paystack-webhook",
      step: "payment_webhook",
      level: "error",
      tags: {
        "paystack.event": eventType || "unknown",
        "paystack.domain": payloadDomain,
        "paystack.expected_domain": activeMode,
      },
      fingerprint: ["paystack", "domain-mismatch"],
    });
    return NextResponse.json({ error: "Payment mode mismatch" }, { status: 400 });
  }

  if (
    eventType === "charge.dispute.create" ||
    eventType === "charge.dispute.remind" ||
    eventType === "charge.dispute.resolve"
  ) {
    return await handleDisputeEvent(eventType, eventData, nestedTxn);
  }

  if (
    eventType === "refund.pending" ||
    eventType === "refund.processing" ||
    eventType === "refund.needs-attention" ||
    eventType === "refund.processed" ||
    eventType === "refund.failed"
  ) {
    return await handleRefundEvent(eventType, eventData, nestedTxn);
  }

  if (eventType !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const txn = eventData;
  const paystackRef = typeof txn.reference === "string" ? txn.reference : null;

  if (!paystackRef) {
    // charge.success with no reference: nothing can be recorded or reconciled.
    captureIssue("charge.success without a reference", {
      scope: "paystack-webhook",
      step: "payment_webhook",
      level: "error",
      fingerprint: ["paystack-webhook", "missing-reference"],
    });
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
      // Acknowledged as "not a booking payment" below, which is indistinguishable
      // from a real booking whose metadata got mangled in transit.
      captureIssue("Paystack metadata is not JSON", {
        scope: "paystack-webhook",
        step: "payment_webhook",
        level: "warning",
        reference: paystackRef,
        fingerprint: ["paystack-webhook", "invalid-metadata"],
      });
    }
  } else if (rawMeta && typeof rawMeta === "object") {
    metadata = rawMeta as Record<string, unknown>;
  }

  // A grouped reservation charges once on the anchor and carries metadata.group_id;
  // a single-room booking carries metadata.booking_id. Group takes precedence.
  const groupId = typeof metadata.group_id === "string" ? metadata.group_id : null;
  const bookingId = typeof metadata.booking_id === "string" ? metadata.booking_id : null;

  if (!groupId && !bookingId) {
    // Not a booking payment — not our concern
    return NextResponse.json({ received: true });
  }

  // Entity id for observability contexts below (anchor id for a group).
  const logId = groupId ?? bookingId!;

  // ── 3. Shared, race-safe recording pipeline ──────────────────

  // Paystack sends the charged amount as an integer in the transaction currency's
  // smallest unit. Validate it before converting: `fromMinor` throws on a
  // non-integer, and a throw here becomes a 500, which makes Paystack redeliver a
  // payload that will be exactly as unparseable next time.
  const txnCurrency = typeof txn.currency === "string" ? txn.currency : null;
  const rawAmount = txn.amount;

  if (typeof rawAmount !== "number" || !Number.isSafeInteger(rawAmount)) {
    // Report here, where the raw field is still visible, then stop. Passing a NaN
    // down the pipeline only produced a 500, and a 500 makes Paystack redeliver a
    // payload whose amount will be just as unparseable next time. There is money
    // captured with no usable amount, which needs a human, not a retry.
    captureIssue("charge.success amount is not a number", {
      scope: "paystack-webhook",
      step: "payment_webhook",
      level: "error",
      bookingId: logId,
      reference: paystackRef,
      tags: { "webhook.acknowledged": true },
      contexts: { payment: { raw_amount_type: typeof rawAmount } },
      fingerprint: ["paystack-webhook", "non-numeric-amount"],
    });
    return NextResponse.json({ received: true, recorded: false });
  }

  // Minor units → major units using the transaction's own currency, so a
  // zero-decimal charge is not divided by 100 into a hundredth of itself.
  const amountPaid = fromMinor(rawAmount, txnCurrency);

  // A successful split charge must name its subaccount. If none is readable,
  // the RPC below will refuse settlement as unverifiable (permanent) — capture
  // the payload anomaly here so the *cause* is searchable, not only the
  // downstream "settlement rejected" effect. Shape only, never field values.
  const subaccountCode = extractSubaccountCode(txn);
  if (!subaccountCode) {
    captureIssue("Paystack charge has no readable subaccount_code", {
      scope: "paystack-webhook",
      step: "payment_webhook",
      bookingId: logId,
      reference: paystackRef,
      contexts: {
        paystack: {
          subaccount_key_present: "subaccount" in txn,
          subaccount_type: txn.subaccount === null ? "null" : typeof txn.subaccount,
          txn_id_present: txn.id != null,
        },
      },
      fingerprint: ["paystack", "subaccount-unverifiable"],
    });
  }

  const result = groupId
    ? await recordOnlineGroupPayment({
        groupId,
        paystackReference: paystackRef,
        paystackId: txn.id != null ? String(txn.id) : null,
        amountPaid,
        currency: txnCurrency,
        subaccountCode,
      })
    : await recordOnlinePayment({
        bookingId: bookingId!,
        paystackReference: paystackRef,
        paystackId: txn.id != null ? String(txn.id) : null,
        amountPaid,
        currency: txnCurrency,
        subaccountCode,
      });

  switch (result.outcome) {
    case "already_recorded":
      // Paystack retried, or the verify fallback beat us here. Not reported:
      // this is idempotency working as designed, and it happens on every retry.
      return NextResponse.json({ received: true });
    case "failed":
      if (!result.retryable) {
        // Permanent: redelivering the identical payload cannot change the answer.
        // recordOnlinePayment has already alerted the hotel for manual review, so
        // 200 stops the retry loop rather than losing information. This capture
        // records the decision itself, because after this response Paystack
        // considers the event delivered and it is gone for good.
        captureIssue("Payment acknowledged without recording (no retry)", {
          scope: "paystack-webhook",
          step: "payment_webhook",
          level: "fatal",
          bookingId: logId,
          reference: paystackRef,
          tags: { "webhook.acknowledged": true, "webhook.reason": result.error },
          contexts: {
            payment: {
              amountPaid,
              currency: txnCurrency,
              reason: result.error,
            },
          },
          fingerprint: ["paystack-webhook", "acknowledged-unrecorded"],
        });
        return NextResponse.json({ error: result.error }, { status: 200 });
      }
      // Transient: money may be captured and the failure could clear on its own,
      // so ask Paystack to redeliver.
      return NextResponse.json({ error: result.error }, { status: 500 });
    case "recorded":
      return NextResponse.json({
        received: true,
        fullyPaid: result.fullyPaid,
        partial: result.partial,
      });
  }
}

function escapeLikePrefix(raw: string): string {
  return raw.replace(/[\\%_]/g, "\\$&");
}

async function resolveBookingFromTransactionReference(reference: string): Promise<{
  hotelId: string;
  bookingId: string;
  bookingRef: string | null;
} | null> {
  // Single-room payments store `paystack_reference = reference`; group payments
  // store `<reference>::<line_booking_id>` (anchor first).
  const { data: exact } = await supabaseAdmin
    .from("payments")
    .select("hotel_id, booking_id, bookings(reference, group_id)")
    .eq("paystack_reference", reference)
    .limit(1)
    .maybeSingle();

  const row =
    exact ??
    (
      await supabaseAdmin
        .from("payments")
        .select("hotel_id, booking_id, bookings(reference, group_id)")
        .like("paystack_reference", `${escapeLikePrefix(reference)}::%`)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    ).data;

  if (!row) return null;
  const bookingJoin = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
  const bookingMeta = bookingJoin as { reference?: string | null; group_id?: string | null } | null;
  return {
    hotelId: row.hotel_id,
    bookingId: bookingMeta?.group_id ?? row.booking_id,
    bookingRef: bookingMeta?.reference ?? null,
  };
}

async function handleDisputeEvent(
  eventType: string,
  data: Record<string, unknown>,
  nestedTxn: Record<string, unknown> | null
): Promise<NextResponse> {
  const txRef =
    typeof nestedTxn?.reference === "string"
      ? nestedTxn.reference
      : typeof data.transaction_reference === "string"
        ? data.transaction_reference
        : null;
  const disputeId =
    data.id != null ? String(data.id) : txRef ?? "unknown";
  const resolution = typeof data.resolution === "string" ? data.resolution : null;

  const linked = txRef ? await resolveBookingFromTransactionReference(txRef) : null;

  captureIssue(`Paystack dispute event: ${eventType}`, {
    scope: "paystack-webhook",
    step: "payment_webhook",
    level: eventType === "charge.dispute.resolve" ? "warning" : "fatal",
    hotelId: linked?.hotelId,
    bookingId: linked?.bookingId,
    reference: txRef ?? undefined,
    tags: {
      "paystack.event": eventType,
      ...(resolution ? { "paystack.dispute_resolution": resolution } : {}),
    },
    contexts: {
      dispute: {
        dispute_id: disputeId,
        status: typeof data.status === "string" ? data.status : null,
        resolution,
      },
    },
    fingerprint: ["paystack-webhook", "dispute", eventType],
  });

  if (linked) {
    const refLabel = linked.bookingRef ? ` (${linked.bookingRef})` : "";
    const title =
      eventType === "charge.dispute.resolve"
        ? `Chargeback resolved${refLabel}`
        : `Urgent: Chargeback opened${refLabel}`;
    const message =
      eventType === "charge.dispute.resolve"
        ? `Paystack updated dispute #${disputeId}${resolution ? ` (${resolution})` : ""} for reference ${txRef}. Review Payouts and your Paystack Dashboard.`
        : `A guest payment dispute (#${disputeId}) was filed on Paystack for ${txRef}. Unanswered chargebacks auto-accept after 16 hours — upload booking evidence in your Paystack Dashboard immediately.`;

    await alertOncePerBooking(
      linked.hotelId,
      linked.bookingId,
      "payment_failed",
      `dispute:${eventType}:${disputeId}`,
      title,
      message
    );
  }

  return NextResponse.json({ received: true });
}

async function handleRefundEvent(
  eventType: string,
  data: Record<string, unknown>,
  nestedTxn: Record<string, unknown> | null
): Promise<NextResponse> {
  const txRef =
    typeof data.transaction_reference === "string"
      ? data.transaction_reference
      : typeof nestedTxn?.reference === "string"
        ? nestedTxn.reference
        : null;
  const refundId =
    data.id != null
      ? String(data.id)
      : `${txRef ?? "unknown"}:${typeof data.amount === "number" ? data.amount : "0"}`;
  const currency =
    typeof data.currency === "string" ? data.currency.toUpperCase() : "GHS";
  const amountMinor =
    typeof data.amount === "number" && Number.isSafeInteger(data.amount) && data.amount > 0
      ? data.amount
      : null;

  if (!txRef) {
    captureIssue(`Paystack ${eventType} missing transaction_reference`, {
      scope: "paystack-webhook",
      step: "payment_webhook",
      level: "warning",
      tags: { "paystack.event": eventType },
      fingerprint: ["paystack-webhook", "refund-missing-ref"],
    });
    return NextResponse.json({ received: true });
  }

  if (eventType === "refund.needs-attention" || eventType === "refund.failed") {
    const linked = await resolveBookingFromTransactionReference(txRef);
    captureIssue(`Paystack refund requires action: ${eventType}`, {
      scope: "paystack-webhook",
      step: "payment_webhook",
      level: "error",
      hotelId: linked?.hotelId,
      bookingId: linked?.bookingId,
      reference: txRef,
      tags: { "paystack.event": eventType },
      contexts: { refund: { refund_id: refundId, amount_minor: amountMinor, currency } },
      fingerprint: ["paystack-webhook", "refund-attention", eventType],
    });

    if (linked) {
      const amountLabel = amountMinor ? formatMoney(amountMinor, currency) : currency;
      await alertOncePerBooking(
        linked.hotelId,
        linked.bookingId,
        "payment_failed",
        `refund:${eventType}:${refundId}`,
        `Refund requires attention${linked.bookingRef ? ` (${linked.bookingRef})` : ""}`,
        `Paystack reported ${eventType} for ${amountLabel} on reference ${txRef}. Complete manual follow-up in your Paystack Dashboard.`
      );
    }
    return NextResponse.json({ received: true });
  }

  if (eventType === "refund.processed") {
    if (!amountMinor) {
      captureIssue("Paystack refund.processed missing positive integer amount", {
        scope: "paystack-webhook",
        step: "payment_webhook",
        level: "error",
        reference: txRef,
        fingerprint: ["paystack-webhook", "refund-invalid-amount"],
      });
      return NextResponse.json({ received: true });
    }

    const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc(
      "record_paystack_refund_atomic",
      {
        p_transaction_reference: txRef,
        p_refund_id: refundId,
        p_refund_amount_minor: amountMinor,
        p_currency: currency,
      }
    );

    if (rpcError) {
      captureSupabaseError(rpcError, "rpc.record_paystack_refund_atomic", {
        scope: "paystack-webhook",
        step: "payment_webhook",
        level: "error",
        reference: txRef,
      });
      // Transient DB error — return 500 so Paystack retries delivery.
      return NextResponse.json({ error: "Refund reconciliation failed" }, { status: 500 });
    }

    const row = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as {
      result?: string;
      hotel_id?: string | null;
      booking_id?: string | null;
      payment_status?: string | null;
    } | null;

    if (row?.result === "recorded" && row.hotel_id && row.booking_id) {
      await writeAuditLog(supabaseAdmin, {
        hotelId: row.hotel_id,
        action: "payment.refunded",
        entityType: "booking",
        entityId: row.booking_id,
        afterState: {
          paystack_reference: txRef,
          refund_id: refundId,
          amount_refunded: fromMinor(amountMinor, currency),
          currency,
          payment_status: row.payment_status,
        },
      });

      await alertOncePerBooking(
        row.hotel_id,
        row.booking_id,
        "payment_failed",
        `refund:processed:${refundId}`,
        "Paystack refund processed",
        `Refund of ${formatMoney(amountMinor, currency)} for reference ${txRef} has been processed and booking payment status is now '${row.payment_status ?? "refunded"}'.`
      );
    }

    return NextResponse.json({ received: true, refundResult: row?.result ?? "ignored" });
  }

  // refund.pending / refund.processing — informational, acknowledge cleanly.
  return NextResponse.json({ received: true });
}
