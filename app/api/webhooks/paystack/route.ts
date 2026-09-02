import { NextRequest, NextResponse } from "next/server";
import { recordOnlinePayment } from "@/lib/bookings/confirm-online-payment";
import { fromMinor } from "@/lib/money";
import { createHmac, timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import {
  captureError,
  captureIssue,
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

  // timingSafeEqual requires same-length buffers
  const sigBuf = Buffer.from(sig, "hex");
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

  // Only process charge.success
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const txn = event.data as Record<string, unknown>;
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

  const bookingId = typeof metadata.booking_id === "string" ? metadata.booking_id : null;

  if (!bookingId) {
    // Not a booking payment — not our concern
    return NextResponse.json({ received: true });
  }

  // ── 3. Shared, race-safe recording pipeline ──────────────────
  const subaccountData = txn.subaccount as Record<string, unknown> | null | undefined;

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
      bookingId,
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

  const result = await recordOnlinePayment({
    bookingId,
    paystackReference: paystackRef,
    paystackId: txn.id != null ? String(txn.id) : null,
    amountPaid,
    currency: txnCurrency,
    subaccountCode: (subaccountData?.account_code as string | null) ?? null,
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
          bookingId,
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
