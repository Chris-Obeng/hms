import { NextRequest, NextResponse } from "next/server";
import { recordOnlinePayment } from "@/lib/bookings/confirm-online-payment";
import { createHmac, timingSafeEqual } from "crypto";

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

  // ── 3. Shared, race-safe recording pipeline ──────────────────
  const subaccountData = txn.subaccount as Record<string, unknown> | null | undefined;

  const result = await recordOnlinePayment({
    bookingId,
    paystackReference: paystackRef,
    paystackId: txn.id != null ? String(txn.id) : null,
    amountPaid: (txn.amount as number) / 100, // pesewas → major units
    currency: typeof txn.currency === "string" ? txn.currency : null,
    subaccountCode: (subaccountData?.account_code as string | null) ?? null,
  });

  switch (result.outcome) {
    case "already_recorded":
      // Paystack retried, or the verify fallback beat us here.
      return NextResponse.json({ received: true });
    case "failed":
      // Money may be captured — ask Paystack to retry rather than dropping it.
      // Currency/amount mismatches also land here but are already alerted.
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "Booking not found" ? 200 : 500 }
      );
    case "recorded":
      return NextResponse.json({
        received: true,
        fullyPaid: result.fullyPaid,
        partial: result.partial,
      });
  }
}
