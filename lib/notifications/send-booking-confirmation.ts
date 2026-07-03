/**
 * lib/notifications/send-booking-confirmation.ts
 *
 * Unified booking confirmation notification service.
 *
 * Responsibilities:
 *  1. Resolve channel (sms vs email) from guest phone number.
 *  2. Guard against double-sends (idempotency check via notification_logs).
 *  3. Call the right provider (Arkesel SMS or Resend email).
 *  4. Log the outcome (success / failure + provider message ID) to notification_logs.
 *  5. Return a typed result — never fails silently.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveNotificationChannel } from "@/lib/notifications/channel-router";
import { sendEmailViaResend } from "@/lib/notifications/resend";
import {
  buildConfirmationEmail,
  buildCancellationEmail,
} from "@/lib/notifications/email-templates";
import type { BookingNotifyData, HotelNotifyConfig } from "@/lib/arkesel";
import type { NotificationTemplatesMap } from "@/lib/notification-templates";

// ── Result types ──────────────────────────────────────────────────────────────

export interface ConfirmationSendSuccess {
  success: true;
  channel: "sms" | "email";
  provider: "arkesel" | "resend";
  providerId: string;
  recipient: string;
  /** True if we skipped the send because a confirmation already exists */
  alreadySent: false;
}

export interface ConfirmationSendSkipped {
  success: true;
  alreadySent: true;
  /** Which log entry prevented the resend */
  existingLogId: string;
}

export interface ConfirmationSendFailure {
  success: false;
  channel: "sms" | "email";
  provider: "arkesel" | "resend";
  recipient: string;
  error: string;
}

export type ConfirmationSendResult =
  | ConfirmationSendSuccess
  | ConfirmationSendSkipped
  | ConfirmationSendFailure;

// ── Event types ───────────────────────────────────────────────────────────────

export type NotificationEventType =
  | "booking_confirmed"
  | "booking_cancelled";

// ── Idempotency check ─────────────────────────────────────────────────────────

async function findExistingLog(
  bookingId: string,
  eventType: NotificationEventType
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("notification_logs")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("event_type", eventType)
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

// ── Log writer ────────────────────────────────────────────────────────────────

async function writeNotificationLog(entry: {
  hotelId: string;
  bookingId: string | null;
  eventType: NotificationEventType;
  channel: "sms" | "email";
  provider: "arkesel" | "resend";
  recipient: string;
  providerMessageId: string | null;
  status: "sent" | "failed";
  errorMessage: string | null;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("notification_logs")
    .insert({
      hotel_id: entry.hotelId,
      booking_id: entry.bookingId,
      event_type: entry.eventType,
      channel: entry.channel,
      provider: entry.provider,
      recipient: entry.recipient,
      provider_message_id: entry.providerMessageId,
      status: entry.status,
      error_message: entry.errorMessage,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[notification-logs] Failed to write log entry", {
      error: error.message,
      entry,
    });
    return null;
  }

  return data?.id ?? null;
}

// ── SMS send (via Arkesel) ────────────────────────────────────────────────────

async function sendViaSms(
  sender: string,
  phone: string,
  message: string,
  hotelId: string,
  bookingId: string | null,
  eventType: NotificationEventType
): Promise<ConfirmationSendSuccess | ConfirmationSendFailure> {
  const { sendSmsWithResult } = await import("@/lib/arkesel");

  try {
    const result = await sendSmsWithResult(sender, phone, message);

    await writeNotificationLog({
      hotelId,
      bookingId,
      eventType,
      channel: "sms",
      provider: "arkesel",
      recipient: phone,
      providerMessageId: result.messageId ?? null,
      status: "sent",
      errorMessage: null,
    });

    return {
      success: true,
      channel: "sms",
      provider: "arkesel",
      providerId: result.messageId ?? "",
      recipient: phone,
      alreadySent: false,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "SMS send failed";

    await writeNotificationLog({
      hotelId,
      bookingId,
      eventType,
      channel: "sms",
      provider: "arkesel",
      recipient: phone,
      providerMessageId: null,
      status: "failed",
      errorMessage,
    });

    return {
      success: false,
      channel: "sms",
      provider: "arkesel",
      recipient: phone,
      error: errorMessage,
    };
  }
}

// ── Email send (via Resend) ───────────────────────────────────────────────────

async function sendViaEmail(
  hotelName: string,
  email: string,
  subject: string,
  html: string,
  hotelId: string,
  bookingId: string | null,
  eventType: NotificationEventType,
  idempotencyKey?: string
): Promise<ConfirmationSendSuccess | ConfirmationSendFailure> {
  try {
    const result = await sendEmailViaResend({
      hotelName,
      to: email,
      subject,
      html,
      idempotencyKey,
    });

    await writeNotificationLog({
      hotelId,
      bookingId,
      eventType,
      channel: "email",
      provider: "resend",
      recipient: email,
      providerMessageId: result.id,
      status: "sent",
      errorMessage: null,
    });

    return {
      success: true,
      channel: "email",
      provider: "resend",
      providerId: result.id,
      recipient: email,
      alreadySent: false,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Email send failed";

    await writeNotificationLog({
      hotelId,
      bookingId,
      eventType,
      channel: "email",
      provider: "resend",
      recipient: email,
      providerMessageId: null,
      status: "failed",
      errorMessage,
    });

    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: email,
      error: errorMessage,
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SendBookingConfirmationParams {
  hotelId: string;
  bookingId: string;
  config: HotelNotifyConfig;
  booking: BookingNotifyData;
  templates?: NotificationTemplatesMap | null;
}

/**
 * Sends a booking confirmation notification to the guest.
 *
 * Channel resolution:
 *  - Valid Ghanaian phone number → SMS via Arkesel
 *  - All other cases (foreign, invalid, missing phone) → Email via Resend
 *
 * Idempotency: If a successful 'booking_confirmed' log already exists for this
 * bookingId, the send is skipped and ConfirmationSendSkipped is returned.
 * This prevents duplicate notifications on webhook retries.
 *
 * Never throws — returns a typed result with success/failure status.
 */
export async function sendBookingConfirmation(
  params: SendBookingConfirmationParams
): Promise<ConfirmationSendResult> {
  const { hotelId, bookingId, config, booking } = params;
  const eventType: NotificationEventType = "booking_confirmed";

  if (config.notificationsEnabled === false) {
    console.info("[send-booking-confirmation] Notifications disabled for hotel", {
      hotelId,
    });
    // Treat disabled as a non-error skip — return a failure so callers know
    // nothing was sent, without throwing.
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: booking.guestEmail ?? "(none)",
      error: "Notifications disabled",
    };
  }

  // ── Idempotency check ────────────────────────────────────────────────────
  const existing = await findExistingLog(bookingId, eventType);
  if (existing) {
    console.info("[send-booking-confirmation] Already sent, skipping", {
      bookingId,
      existingLogId: existing.id,
    });
    return { success: true, alreadySent: true, existingLogId: existing.id };
  }

  // ── Channel resolution ───────────────────────────────────────────────────
  const phone = booking.guestPhone ?? "";
  const email = booking.guestEmail ?? "";
  const channel = resolveNotificationChannel(phone);

  console.info("[send-booking-confirmation] Channel resolved", {
    bookingId,
    channel,
    phone: phone || "(none)",
    email: email || "(none)",
  });

  // ── SMS path (Arkesel) ───────────────────────────────────────────────────
  if (channel === "sms") {
    if (!phone) {
      return {
        success: false,
        channel: "sms",
        provider: "arkesel",
        recipient: "(none)",
        error: "No phone number available for SMS",
      };
    }

    const { getTemplate, renderTemplate } = await import(
      "@/lib/notification-templates"
    );
    const tpl = getTemplate(params.templates ?? null, "booking_confirmed");

    if (!tpl.sms_enabled) {
      return {
        success: false,
        channel: "sms",
        provider: "arkesel",
        recipient: phone,
        error: "SMS disabled by template config",
      };
    }

    const { senderName } = await import("@/lib/arkesel");
    const sender = senderName(config.hotelName);

    const vars = {
      guest_name: booking.guestName,
      reference: booking.reference,
      room_name: booking.roomName,
      hotel_name: config.hotelName,
      check_in: booking.checkIn,
      check_out: booking.checkOut,
      check_in_time: booking.checkInTime ?? "",
      check_out_time: booking.checkOutTime ?? "",
      nights: String(booking.nights),
      total_amount: booking.totalAmount.toLocaleString(),
      currency: config.currency,
      hotel_phone: booking.hotelPhone ?? "",
      hotel_address: booking.hotelAddress ?? "",
    };

    const message = renderTemplate(tpl.sms_template, vars);

    return sendViaSms(sender, phone, message, hotelId, bookingId, eventType);
  }

  // ── Email path (Resend) ──────────────────────────────────────────────────
  if (!email) {
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: "(none)",
      error: "No email address available",
    };
  }

  const { getTemplate } = await import("@/lib/notification-templates");
  const tpl = getTemplate(params.templates ?? null, "booking_confirmed");

  if (!tpl.email_enabled) {
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: email,
      error: "Email disabled by template config",
    };
  }

  const html = buildConfirmationEmail(
    config.hotelName,
    booking,
    config.currency
  );
  const subject = `Booking Confirmed — ${booking.reference}`;
  // Idempotency key prevents Resend from sending twice on retry
  const idempotencyKey = `booking_confirmed/${bookingId}`;

  return sendViaEmail(
    config.hotelName,
    email,
    subject,
    html,
    hotelId,
    bookingId,
    eventType,
    idempotencyKey
  );
}

// ── Cancellation notification ─────────────────────────────────────────────────

export interface SendBookingCancellationParams {
  hotelId: string;
  bookingId: string;
  config: HotelNotifyConfig;
  booking: Pick<
    BookingNotifyData,
    "guestName" | "guestEmail" | "guestPhone" | "reference" | "roomName" | "checkIn"
  > & { hotelPhone?: string | null };
  templates?: NotificationTemplatesMap | null;
}

/**
 * Sends a booking cancellation notification to the guest.
 * Same channel resolution logic as sendBookingConfirmation.
 */
export async function sendBookingCancellation(
  params: SendBookingCancellationParams
): Promise<ConfirmationSendResult> {
  const { hotelId, bookingId, config, booking } = params;
  const eventType: NotificationEventType = "booking_cancelled";

  if (config.notificationsEnabled === false) {
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: booking.guestEmail ?? "(none)",
      error: "Notifications disabled",
    };
  }

  const phone = booking.guestPhone ?? "";
  const email = booking.guestEmail ?? "";
  const channel = resolveNotificationChannel(phone);

  if (channel === "sms") {
    if (!phone) {
      return {
        success: false,
        channel: "sms",
        provider: "arkesel",
        recipient: "(none)",
        error: "No phone number",
      };
    }

    const { getTemplate, renderTemplate } = await import(
      "@/lib/notification-templates"
    );
    const tpl = getTemplate(params.templates ?? null, "booking_cancelled");

    if (!tpl.sms_enabled) {
      return {
        success: false,
        channel: "sms",
        provider: "arkesel",
        recipient: phone,
        error: "SMS disabled by template config",
      };
    }

    const { senderName } = await import("@/lib/arkesel");
    const sender = senderName(config.hotelName);
    const vars = {
      guest_name: booking.guestName,
      reference: booking.reference,
      room_name: booking.roomName,
      hotel_name: config.hotelName,
      check_in: booking.checkIn,
      check_out: "",
      check_in_time: "",
      check_out_time: "",
      nights: "",
      total_amount: "",
      currency: config.currency,
      hotel_phone: booking.hotelPhone ?? "",
      hotel_address: "",
    };
    const { renderTemplate: rt } = await import("@/lib/notification-templates");
    const message = rt(tpl.sms_template, vars);

    return sendViaSms(sender, phone, message, hotelId, bookingId, eventType);
  }

  // Email path
  if (!email) {
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: "(none)",
      error: "No email address",
    };
  }

  const { getTemplate } = await import("@/lib/notification-templates");
  const tpl = getTemplate(params.templates ?? null, "booking_cancelled");

  if (!tpl.email_enabled) {
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: email,
      error: "Email disabled by template config",
    };
  }

  const html = buildCancellationEmail(
    config.hotelName,
    booking.guestName,
    booking.reference,
    booking.hotelPhone
  );
  const subject = `Booking Cancelled — ${booking.reference}`;
  const idempotencyKey = `booking_cancelled/${bookingId}`;

  return sendViaEmail(
    config.hotelName,
    email,
    subject,
    html,
    hotelId,
    bookingId,
    eventType,
    idempotencyKey
  );
}
