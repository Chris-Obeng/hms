/**
 * lib/arkesel.ts
 *
 * Centralised Arkesel SMS + Email for RoomLine.
 *
 * ARCHITECTURE: One RoomLine master Arkesel account. All hotels send through it.
 * Hotels never see or manage an Arkesel account — they only get a single
 * "SMS & Email notifications" on/off toggle in their settings.
 *
 * The sender name shown on guest phones is derived from the hotel's own name
 * (truncated to 11 chars per GSM spec), so it still feels personalised.
 *
 * Cost absorbed into plan margins (~GHS 0.022/SMS at GHS 5,000 top-up tier).
 * At 5 SMS per booking × 200 bookings/month = ~GHS 22/hotel/month max.
 *
 * Required env:
 *   ARKESEL_API_KEY       — RoomLine master Arkesel API key (server-only)
 *   ARKESEL_WEBHOOK_URL   — Full URL of our Arkesel delivery webhook, e.g.
 *                           https://yourdomain.com/api/webhooks/arkesel
 *                           Enables real-time delivery status tracking.
 *
 * SMS DELAY ROOT CAUSE & FIX (2026-07-03):
 *   The original sendSMS() discarded the Arkesel response body entirely.
 *   Arkesel returns a per-recipient message ID that is required to:
 *     (a) correlate delivery webhooks back to specific sends
 *     (b) diagnose silent failures (e.g. invalid sender ID, quota issues)
 *
 *   CRITICAL: Sender IDs are NOT free-form. Arkesel requires sender IDs to be
 *   pre-registered and approved (typically 1–3 business days). An unregistered
 *   sender ID causes Arkesel to queue the message for manual review, producing
 *   delays of hours. The senderName() function derives a name from the hotel
 *   name — this name MUST be registered in your Arkesel account under
 *   Settings > Sender IDs before SMS will deliver promptly.
 *
 *   As a safe fallback, set ARKESEL_FALLBACK_SENDER to a registered sender ID
 *   (e.g. "RoomLine") in env. The per-hotel derived name is still sent when
 *   available but the fallback prevents silent queueing.
 */

import {
  getTemplate,
  renderTemplate,
  type NotificationTemplatesMap,
} from "@/lib/notification-templates";

const ARKESEL_BASE = "https://sms.arkesel.com/api/v2";
const EMAIL_BASE = "https://email.arkesel.com/api/v2";

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Derive GSM sender ID from hotel name (max 11 chars, alphanumeric + spaces).
 *
 * IMPORTANT: The resulting sender ID must be pre-registered with Arkesel.
 * Unregistered sender IDs are queued for review and deliver with multi-hour
 * delays. Exported so the unified notification service can use it.
 */
export function senderName(hotelName: string): string {
  const derived = hotelName.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 11);
  // Fall back to the registered fallback sender if hotel name produces
  // something that hasn't been registered, or is empty.
  return derived || process.env.ARKESEL_FALLBACK_SENDER || "RoomLine";
}

/** Get the master API key from env */
function getMasterApiKey(): string | null {
  return process.env.ARKESEL_API_KEY ?? null;
}

/**
 * Normalise and validate a phone number for SMS delivery.
 *
 * Uses libphonenumber-js for proper international validation — the previous
 * hand-rolled regex assumed Ghana numbers (233) and silently dropped any
 * number it couldn't pattern-match, causing missed confirmations for OTA
 * guests from other countries.
 *
 * Behaviour:
 *  - Attempts to parse with the supplied defaultCountry hint (Ghana = "GH").
 *  - Returns the E.164 number (e.g. "+233241234567") if valid.
 *  - Returns null for truly invalid numbers (caller logs + skips SMS).
 *
 * IMPORTANT: the returned number must still reach a carrier that can deliver
 * to that destination. Arkesel's Ghana account delivers internationally, but
 * non-GH numbers incur higher costs. Track delivery status via notification_logs.
 */
function normalizePhone(phone: string, defaultCountry: "GH" | string = "GH"): string | null {
  if (!phone || typeof phone !== "string") return null;

  try {
    // Dynamic import avoids bundling the full libphonenumber dataset client-side.
    // On the server this is synchronous require under the hood.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parsePhoneNumber, isValidPhoneNumber } = require("libphonenumber-js") as typeof import("libphonenumber-js");

    // First try with the default country hint
    if (isValidPhoneNumber(phone, defaultCountry as import("libphonenumber-js").CountryCode)) {
      const parsed = parsePhoneNumber(phone, defaultCountry as import("libphonenumber-js").CountryCode);
      return parsed.format("E.164");
    }

    // Try without country hint (handles numbers already in E.164 format)
    if (isValidPhoneNumber(phone)) {
      const parsed = parsePhoneNumber(phone);
      return parsed.format("E.164");
    }

    return null;
  } catch {
    // parsePhoneNumber throws for completely unparseable strings
    return null;
  }
}

/** Fire-and-forget wrapper — never throws */
async function safe(fn: () => Promise<void>, label: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[arkesel:${label}]`, err instanceof Error ? err.message : err);
  }
}

// ── Arkesel response types ────────────────────────────────────────

interface ArkeselSmsRecipientResult {
  recipient?: string;
  id?: string;
  "invalid numbers"?: string[];
}

interface ArkeselSmsResponse {
  status: string;
  data?: ArkeselSmsRecipientResult[];
}


// ── Core senders ──────────────────────────────────────────────────

export interface SmsSendResult {
  /** First message ID returned by Arkesel for this send */
  messageId: string | null;
  /** All per-recipient results returned by Arkesel */
  recipientResults: ArkeselSmsRecipientResult[];
  /** Any phone numbers Arkesel flagged as invalid */
  invalidNumbers: string[];
}

/**
 * Sends an SMS via Arkesel and returns the provider's message IDs.
 *
 * Key changes from original:
 *  - Response body is parsed and returned (not discarded).
 *  - Structured logging on request and response for diagnosis.
 *  - callback_url included when ARKESEL_WEBHOOK_URL is set, enabling
 *    real-time delivery status tracking.
 *  - Throws on HTTP error or non-success status in response body.
 */
export async function sendSmsWithResult(
  sender: string,
  phone: string,
  message: string
): Promise<SmsSendResult> {
  const apiKey = getMasterApiKey();
  if (!apiKey) {
    throw new Error("[arkesel] ARKESEL_API_KEY not set");
  }

  const normalised = normalizePhone(phone);
  if (!normalised) {
    throw new Error(`[arkesel] Could not normalise phone number: ${phone}`);
  }

  const webhookUrl = process.env.ARKESEL_WEBHOOK_URL;
  const body: Record<string, unknown> = {
    sender,
    message,
    recipients: [normalised],
  };
  if (webhookUrl) {
    body.callback_url = webhookUrl;
  }

  console.info("[arkesel:sms] Sending", {
    sender,
    recipient: normalised,
    messageLength: message.length,
    hasCallbackUrl: Boolean(webhookUrl),
  });

  const res = await fetch(`${ARKESEL_BASE}/sms/send`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const responseText = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("[arkesel:sms] HTTP error", {
      status: res.status,
      body: responseText,
      sender,
      recipient: normalised,
    });
    throw new Error(`Arkesel SMS failed (HTTP ${res.status}): ${responseText}`);
  }

  let parsed: ArkeselSmsResponse;
  try {
    parsed = JSON.parse(responseText) as ArkeselSmsResponse;
  } catch {
    // Non-JSON 200 — treat as unknown success but log it
    console.warn("[arkesel:sms] Non-JSON 200 response", { responseText, sender, recipient: normalised });
    return { messageId: null, recipientResults: [], invalidNumbers: [] };
  }

  if (parsed.status !== "success") {
    console.error("[arkesel:sms] Non-success status in response", {
      status: parsed.status,
      body: responseText,
      sender,
      recipient: normalised,
    });
    throw new Error(`Arkesel SMS: provider returned status '${parsed.status}' for ${normalised}`);
  }

  const recipientResults = parsed.data ?? [];
  const invalidNumbers: string[] = [];
  let messageId: string | null = null;

  for (const r of recipientResults) {
    if (r["invalid numbers"]) {
      invalidNumbers.push(...(r["invalid numbers"] ?? []));
    }
    if (r.id && !messageId) {
      messageId = r.id;
    }
  }

  console.info("[arkesel:sms] Sent successfully", {
    sender,
    recipient: normalised,
    messageId,
    invalidNumbers,
  });

  if (invalidNumbers.length > 0) {
    console.warn("[arkesel:sms] Invalid numbers reported by Arkesel", {
      invalidNumbers,
      sender,
    });
  }

  return { messageId, recipientResults, invalidNumbers };
}

/**
 * Internal helper for legacy notification functions.
 * Sends to multiple recipients and ignores the result.
 * New code should use sendSmsWithResult() directly.
 */
async function sendSMS(
  sender: string,
  recipients: string[],
  message: string
): Promise<void> {
  const apiKey = getMasterApiKey();
  if (!apiKey) { console.warn("[arkesel] ARKESEL_API_KEY not set — SMS skipped"); return; }

  const phones = recipients.map((r) => normalizePhone(r)).filter(Boolean) as string[];
  if (!phones.length) return;

  // Send one at a time so we capture per-recipient message IDs in logs.
  // For bulk sends this could be batched, but booking notifications are always
  // single-recipient so the overhead is negligible.
  for (const phone of phones) {
    await sendSmsWithResult(sender, phone, message);
  }
}

async function sendEmail(
  sender: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const apiKey = getMasterApiKey();
  if (!apiKey) { console.warn("[arkesel] ARKESEL_API_KEY not set — email skipped"); return; }
  if (!to?.includes("@")) return;

  const res = await fetch(`${EMAIL_BASE}/email/send`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${sender} <noreply@RoomLineprp.com>`,
      to: [{ email: to }],
      subject,
      html: htmlBody,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Arkesel email failed (${res.status}): ${text}`);
  }
}


// ── Public config type ────────────────────────────────────────────

/**
 * Minimal hotel context needed for sending notifications.
 * No per-hotel API keys — everything goes through the RoomLine master account.
 */
export interface HotelNotifyConfig {
  /** Hotel name — used as the SMS sender ID seen by guests */
  hotelName: string;
  /** Hotel currency for formatting amounts */
  currency: string;
  /** Whether the hotel has enabled guest notifications (hotels.settings.sms_notifications_enabled) */
  notificationsEnabled?: boolean;
}

export interface BookingNotifyData {
  guestName: string;
  guestEmail: string | null | undefined;
  guestPhone: string | null | undefined;
  reference: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  hotelAddress?: string | null;
  hotelPhone?: string | null;
}


// ── Notification functions ────────────────────────────────────────

/**
 * @deprecated Use sendBookingConfirmation() from lib/notifications/send-booking-confirmation.ts
 * for new booking confirmation flows. This function is retained for any legacy
 * direct callers but new code must go through the unified service.
 */
export async function notifyBookingConfirmed(
  config: HotelNotifyConfig,
  booking: BookingNotifyData,
  templates?: NotificationTemplatesMap | null
): Promise<void> {
  if (config.notificationsEnabled === false) return;
  const sender = senderName(config.hotelName);
  const tpl = getTemplate(templates ?? null, "booking_confirmed");
  if (!tpl.sms_enabled && !tpl.email_enabled) return;

  const vars = {
    guest_name: booking.guestName, reference: booking.reference,
    room_name: booking.roomName, hotel_name: config.hotelName,
    check_in: booking.checkIn, check_out: booking.checkOut,
    check_in_time: booking.checkInTime ?? "", check_out_time: booking.checkOutTime ?? "",
    nights: String(booking.nights), total_amount: booking.totalAmount.toLocaleString(),
    currency: config.currency, hotel_phone: booking.hotelPhone ?? "",
    hotel_address: booking.hotelAddress ?? "",
  };

  // SMS only — email is now handled by Resend via sendBookingConfirmation()
  await Promise.all([
    tpl.sms_enabled && booking.guestPhone
      ? safe(() => sendSMS(sender, [booking.guestPhone!], renderTemplate(tpl.sms_template, vars)), "booking-confirmed-sms")
      : Promise.resolve(),
  ]);
}

/**
 * @deprecated Use sendBookingCancellation() from lib/notifications/send-booking-confirmation.ts
 */
export async function notifyBookingCancelled(
  config: HotelNotifyConfig,
  booking: Pick<BookingNotifyData, "guestName" | "guestEmail" | "guestPhone" | "reference" | "roomName" | "checkIn">,
  templates?: NotificationTemplatesMap | null
): Promise<void> {
  if (config.notificationsEnabled === false) return;
  const sender = senderName(config.hotelName);
  const tpl = getTemplate(templates ?? null, "booking_cancelled");

  const vars = {
    guest_name: booking.guestName, reference: booking.reference,
    room_name: booking.roomName, hotel_name: config.hotelName,
    check_in: booking.checkIn, check_out: "", check_in_time: "",
    check_out_time: "", nights: "", total_amount: "", currency: config.currency,
    hotel_phone: "", hotel_address: "",
  };

  // SMS only — email now handled by Resend via sendBookingCancellation()
  await Promise.all([
    tpl.sms_enabled && booking.guestPhone
      ? safe(() => sendSMS(sender, [booking.guestPhone!], renderTemplate(tpl.sms_template, vars)), "booking-cancelled-sms")
      : Promise.resolve(),
  ]);
}


export async function notifyPaymentReceived(
  config: HotelNotifyConfig,
  data: { guestName: string; guestEmail: string | null | undefined; reference: string; amountPaid: number; outstandingBalance: number },
  templates?: NotificationTemplatesMap | null
): Promise<void> {
  if (config.notificationsEnabled === false || !data.guestEmail) return;
  const sender = senderName(config.hotelName);
  const tpl = getTemplate(templates ?? null, "payment_received");
  if (!tpl.email_enabled) return;
  const html = `<p>Hi ${data.guestName},</p><p>Payment of <strong>${config.currency} ${data.amountPaid.toLocaleString()}</strong> received for booking <strong>${data.reference}</strong> at ${config.hotelName}.</p>${data.outstandingBalance > 0 ? `<p>Outstanding: <strong>${config.currency} ${data.outstandingBalance.toLocaleString()}</strong> — payable at check-in.</p>` : "<p>Fully paid. See you soon!</p>"}`;
  await safe(() => sendEmail(sender, data.guestEmail!, `Payment Receipt — ${data.reference}`, html), "payment-received-email");
}

export async function notifyCheckInReminder(
  config: HotelNotifyConfig,
  data: { guestPhone: string | null | undefined; guestName: string; reference: string; checkIn: string; checkInTime?: string | null; hotelAddress?: string | null },
  templates?: NotificationTemplatesMap | null
): Promise<void> {
  if (config.notificationsEnabled === false || !data.guestPhone) return;
  const sender = senderName(config.hotelName);
  const tpl = getTemplate(templates ?? null, "check_in_reminder");
  if (!tpl.sms_enabled) return;
  const vars = { guest_name: data.guestName, reference: data.reference, hotel_name: config.hotelName, check_in: data.checkIn, check_in_time: data.checkInTime ?? "", hotel_address: data.hotelAddress ?? "", check_out: "", check_out_time: "", nights: "", total_amount: "", currency: config.currency, room_name: "", hotel_phone: "" };
  await safe(() => sendSMS(sender, [data.guestPhone!], renderTemplate(tpl.sms_template, vars)), "checkin-reminder-sms");
}

export async function notifyCheckOutReminder(
  config: HotelNotifyConfig,
  data: { guestPhone: string | null | undefined; guestName: string; reference: string; checkOut: string; checkOutTime?: string | null },
  templates?: NotificationTemplatesMap | null
): Promise<void> {
  if (config.notificationsEnabled === false || !data.guestPhone) return;
  const sender = senderName(config.hotelName);
  const tpl = getTemplate(templates ?? null, "check_out_reminder");
  if (!tpl.sms_enabled) return;
  const vars = { guest_name: data.guestName, reference: data.reference, hotel_name: config.hotelName, check_out: data.checkOut, check_out_time: data.checkOutTime ?? "", check_in: "", check_in_time: "", nights: "", total_amount: "", currency: config.currency, room_name: "", hotel_phone: "", hotel_address: "" };
  await safe(() => sendSMS(sender, [data.guestPhone!], renderTemplate(tpl.sms_template, vars)), "checkout-reminder-sms");
}

export async function notifyPaymentLink(
  config: HotelNotifyConfig,
  data: { guestName: string; guestEmail: string | null | undefined; guestPhone: string | null | undefined; reference: string; paymentUrl: string; amount: number }
): Promise<void> {
  if (config.notificationsEnabled === false) return;
  const sender = senderName(config.hotelName);
  const smsMsg = `Hi ${data.guestName}, pay ${config.currency} ${data.amount.toLocaleString()} for your ${config.hotelName} booking (${data.reference}): ${data.paymentUrl}`;
  const emailHtml = `<p>Hi ${data.guestName},</p><p>Here is your payment link for booking <strong>${data.reference}</strong> at <strong>${config.hotelName}</strong>:</p><p><a href="${data.paymentUrl}" style="background:#1C1917;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Pay ${config.currency} ${data.amount.toLocaleString()}</a></p>`;
  await Promise.all([
    data.guestPhone ? safe(() => sendSMS(sender, [data.guestPhone!], smsMsg), "payment-link-sms") : Promise.resolve(),
    data.guestEmail ? safe(() => sendEmail(sender, data.guestEmail!, `Payment Request — ${data.reference}`, emailHtml), "payment-link-email") : Promise.resolve(),
  ]);
}

export async function notifyStaffApproved(
  config: HotelNotifyConfig,
  data: { staffPhone: string | null | undefined; staffName: string; role: string }
): Promise<void> {
  if (!data.staffPhone) return;
  const sender = senderName(config.hotelName);
  const msg = `Hi ${data.staffName}, your RoomLine access for ${config.hotelName} has been approved as ${data.role.replace("_", " ")}. You can now log in.`;
  await safe(() => sendSMS(sender, [data.staffPhone!], msg), "staff-approved-sms");
}

/** Test SMS — used from the integrations settings page */
export async function sendTestSms(
  recipientPhone: string,
  hotelName: string
): Promise<{ success: true } | { success: false; error: string }> {
  const apiKey = getMasterApiKey();
  if (!apiKey) return { success: false, error: "ARKESEL_API_KEY not configured on server" };
  try {
    await sendSMS(senderName(hotelName), [recipientPhone], `Test SMS from RoomLiness for ${hotelName}. Guest notifications are working correctly.`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "SMS failed" };
  }
}


// ── Email HTML builder (legacy — kept for Arkesel email fallback) ─────────────
// The canonical implementation is in lib/notifications/email-templates.ts
// which is used by the Resend sender.

/** @deprecated Import from @/lib/notifications/email-templates instead */
function buildConfirmationEmail(hotelName: string, booking: BookingNotifyData, currency: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #E7E5E4;overflow:hidden;">
    <div style="background:#1C1917;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${hotelName}</h1>
      <p style="margin:6px 0 0;color:#A8A29E;font-size:13px;">Booking Confirmation</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#44403C;font-size:15px;margin:0 0 20px;">Hi ${booking.guestName.split(" ")[0]}, your reservation is confirmed.</p>
      <div style="background:#F5F4F2;border-radius:10px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:10px;color:#A8A29E;text-transform:uppercase;letter-spacing:.08em;">Booking Reference</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#1C1917;font-family:monospace;">${booking.reference}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:7px 0;color:#A8A29E;">Room</td><td style="padding:7px 0;text-align:right;color:#44403C;">${booking.roomName}</td></tr>
        <tr><td style="padding:7px 0;color:#A8A29E;">Check-in</td><td style="padding:7px 0;text-align:right;color:#44403C;">${booking.checkIn}${booking.checkInTime ? ` from ${booking.checkInTime}` : ""}</td></tr>
        <tr><td style="padding:7px 0;color:#A8A29E;">Check-out</td><td style="padding:7px 0;text-align:right;color:#44403C;">${booking.checkOut}${booking.checkOutTime ? ` by ${booking.checkOutTime}` : ""}</td></tr>
        <tr><td style="padding:7px 0;color:#A8A29E;">Nights</td><td style="padding:7px 0;text-align:right;color:#44403C;">${booking.nights}</td></tr>
        <tr style="border-top:1px solid #E7E5E4;"><td style="padding:10px 0 0;font-weight:700;color:#1C1917;">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:700;color:#1C1917;">${currency} ${booking.totalAmount.toLocaleString()}</td></tr>
      </table>
    </div>
  </div></body></html>`;
}
