/**
 * app/api/webhooks/arkesel/route.ts
 *
 * Delivery status webhook for Arkesel SMS.
 *
 * Arkesel calls this URL (configured via ARKESEL_WEBHOOK_URL env) when the
 * delivery status of an SMS changes. We use it to update notification_logs
 * so staff can see whether SMS messages actually reached recipients.
 *
 * Arkesel webhook payload (documented format):
 *   sms_id     string   — The message ID we received in the send response
 *   status     string   — DELIVERED | SUBMITTED | PROHIBITED | NOT_DELIVERED | EXPIRED
 *   recipient  string   — The phone number
 *
 * Security: Arkesel does not sign webhook payloads. We validate the
 * ARKESEL_WEBHOOK_SECRET env against a shared secret query param. Configure
 * the webhook URL in Arkesel as:
 *   https://yourdomain.com/api/webhooks/arkesel?secret=YOUR_SECRET
 *
 * Required env:
 *   ARKESEL_WEBHOOK_SECRET  — a shared secret to validate inbound callbacks
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Arkesel delivery status → our internal status mapping
const STATUS_MAP: Record<string, string> = {
  DELIVERED: "delivered",
  SUBMITTED: "sent",       // Submitted to carrier, not yet delivered
  PROHIBITED: "undeliverable",
  NOT_DELIVERED: "failed",
  EXPIRED: "undeliverable",
};

export async function POST(req: NextRequest) {
  // Validate shared secret
  const secret = req.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.ARKESEL_WEBHOOK_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    console.warn("[arkesel-webhook] Invalid secret in delivery callback");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const smsId = typeof payload.sms_id === "string" ? payload.sms_id : null;
  const rawStatus = typeof payload.status === "string" ? payload.status : null;
  const recipient = typeof payload.recipient === "string" ? payload.recipient : null;

  if (!smsId || !rawStatus) {
    console.warn("[arkesel-webhook] Missing sms_id or status in payload", { payload });
    // Return 200 anyway — Arkesel will retry on non-200 which can cause loops
    return NextResponse.json({ received: true });
  }

  const internalStatus = STATUS_MAP[rawStatus] ?? "sent";

  console.info("[arkesel-webhook] Delivery callback received", {
    smsId,
    rawStatus,
    internalStatus,
    recipient,
  });

  // Update notification_logs row matching this message ID
  const { data, error } = await supabaseAdmin
    .from("notification_logs")
    .update({ status: internalStatus })
    .eq("provider_message_id", smsId)
    .eq("provider", "arkesel")
    .select("id, booking_id, status")
    .maybeSingle();

  if (error) {
    console.error("[arkesel-webhook] Failed to update notification_logs", {
      smsId,
      error: error.message,
    });
    // Return 200 — don't trigger Arkesel retries for DB errors
    return NextResponse.json({ received: true });
  }

  if (!data) {
    console.warn("[arkesel-webhook] No notification_log found for sms_id", {
      smsId,
      rawStatus,
    });
  } else {
    console.info("[arkesel-webhook] Updated notification_log status", {
      logId: data.id,
      bookingId: data.booking_id,
      newStatus: data.status,
    });
  }

  return NextResponse.json({ received: true });
}
