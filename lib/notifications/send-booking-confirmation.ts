/** Email-only transactional booking notifications. */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmailViaResend } from "@/lib/notifications/resend";
import {
  buildCancellationEmail,
  buildConfirmationEmail,
} from "@/lib/notifications/email-templates";
import type { NotificationTemplatesMap } from "@/lib/notification-templates";
import type { BookingNotifyData, HotelNotifyConfig } from "@/lib/notifications/types";

export interface EmailSendSuccess {
  success: true;
  channel: "email";
  provider: "resend";
  providerId: string;
  recipient: string;
  alreadySent: false;
}

export interface EmailSendSkipped {
  success: true;
  alreadySent: true;
  existingLogId: string;
}

export interface EmailSendFailure {
  success: false;
  channel: "email";
  provider: "resend";
  recipient: string;
  error: string;
}

export type ConfirmationSendResult = EmailSendSuccess | EmailSendSkipped | EmailSendFailure;
export type NotificationEventType = "booking_confirmed" | "booking_cancelled";

async function findExistingEmailLog(
  bookingId: string,
  eventType: NotificationEventType
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("notification_logs")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("event_type", eventType)
    .eq("channel", "email")
    .eq("provider", "resend")
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

async function writeEmailLog(entry: {
  hotelId: string;
  bookingId: string;
  eventType: NotificationEventType;
  recipient: string;
  providerMessageId: string | null;
  status: "sent" | "failed";
  errorMessage: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("notification_logs").insert({
    hotel_id: entry.hotelId,
    booking_id: entry.bookingId,
    event_type: entry.eventType,
    channel: "email",
    provider: "resend",
    recipient: entry.recipient,
    provider_message_id: entry.providerMessageId,
    status: entry.status,
    error_message: entry.errorMessage,
  });

  if (error) {
    console.error("[notification-logs] Failed to write email log", error.message);
  }
}

async function sendEmail(params: {
  hotelId: string;
  bookingId: string;
  eventType: NotificationEventType;
  hotelName: string;
  recipient: string;
  subject: string;
  html: string;
}): Promise<ConfirmationSendResult> {
  const existing = await findExistingEmailLog(params.bookingId, params.eventType);
  if (existing) {
    return { success: true, alreadySent: true, existingLogId: existing.id };
  }

  try {
    const result = await sendEmailViaResend({
      hotelName: params.hotelName,
      to: params.recipient,
      subject: params.subject,
      html: params.html,
      idempotencyKey: `${params.eventType}/${params.bookingId}`,
    });

    await writeEmailLog({
      hotelId: params.hotelId,
      bookingId: params.bookingId,
      eventType: params.eventType,
      recipient: params.recipient,
      providerMessageId: result.id,
      status: "sent",
      errorMessage: null,
    });

    return {
      success: true,
      channel: "email",
      provider: "resend",
      providerId: result.id,
      recipient: params.recipient,
      alreadySent: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    await writeEmailLog({
      hotelId: params.hotelId,
      bookingId: params.bookingId,
      eventType: params.eventType,
      recipient: params.recipient,
      providerMessageId: null,
      status: "failed",
      errorMessage: message,
    });
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: params.recipient,
      error: message,
    };
  }
}

export interface SendBookingConfirmationParams {
  hotelId: string;
  bookingId: string;
  config: HotelNotifyConfig;
  booking: BookingNotifyData;
  templates?: NotificationTemplatesMap | null;
}

export async function sendBookingConfirmation(
  params: SendBookingConfirmationParams
): Promise<ConfirmationSendResult> {
  const email = params.booking.guestEmail?.trim();
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
  const template = getTemplate(params.templates ?? null, "booking_confirmed");
  if (!template.email_enabled) {
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: email,
      error: "Email disabled by template config",
    };
  }

  return sendEmail({
    hotelId: params.hotelId,
    bookingId: params.bookingId,
    eventType: "booking_confirmed",
    hotelName: params.config.hotelName,
    recipient: email,
    subject: `Booking Confirmed — ${params.booking.reference}`,
    html: buildConfirmationEmail(
      params.config.hotelName,
      params.booking,
      params.config.currency
    ),
  });
}

export interface SendBookingCancellationParams {
  hotelId: string;
  bookingId: string;
  config: HotelNotifyConfig;
  booking: Pick<
    BookingNotifyData,
    "guestName" | "guestEmail" | "reference" | "roomName" | "checkIn"
  > & { hotelPhone?: string | null };
  templates?: NotificationTemplatesMap | null;
}

export async function sendBookingCancellation(
  params: SendBookingCancellationParams
): Promise<ConfirmationSendResult> {
  const email = params.booking.guestEmail?.trim();
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
  const template = getTemplate(params.templates ?? null, "booking_cancelled");
  if (!template.email_enabled) {
    return {
      success: false,
      channel: "email",
      provider: "resend",
      recipient: email,
      error: "Email disabled by template config",
    };
  }

  return sendEmail({
    hotelId: params.hotelId,
    bookingId: params.bookingId,
    eventType: "booking_cancelled",
    hotelName: params.config.hotelName,
    recipient: email,
    subject: `Booking Cancelled — ${params.booking.reference}`,
    html: buildCancellationEmail(
      params.config.hotelName,
      params.booking.guestName,
      params.booking.reference,
      params.booking.hotelPhone
    ),
  });
}
