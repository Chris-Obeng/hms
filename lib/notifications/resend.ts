/**
 * lib/notifications/resend.ts
 *
 * Resend email sender for HotelOS Pro.
 *
 * Architecture:
 *   - Single platform-level Resend account (env RESEND_API_KEY).
 *   - The FROM domain/address is infrastructure config (RESEND_FROM_ADDRESS).
 *   - The display name changes per-hotel: "${hotel.name}" <bookings@ourdomain.com>
 *
 * Required env:
 *   RESEND_API_KEY        — Resend API key (server-only, never NEXT_PUBLIC_)
 *   RESEND_FROM_ADDRESS   — Verified sender address, e.g. bookings@yourdomain.com
 */

import { Resend } from "resend";

// Lazily initialised — module-level singleton is fine for server-side Next.js.
let _resend: Resend | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[resend] RESEND_API_KEY is not set. Add it to your environment variables."
    );
  }
  if (!_resend) {
    _resend = new Resend(apiKey);
  }
  return _resend;
}

function getFromAddress(): string {
  const addr = process.env.RESEND_FROM_ADDRESS;
  if (!addr) {
    throw new Error(
      "[resend] RESEND_FROM_ADDRESS is not set. Add it to your environment variables."
    );
  }
  return addr;
}

export interface ResendEmailParams {
  /** Hotel display name — appears as the sender name in the inbox */
  hotelName: string;
  /** Recipient email address */
  to: string;
  subject: string;
  /** Full HTML body — use buildConfirmationEmail() / buildCancellationEmail() */
  html: string;
  /**
   * Optional idempotency key to prevent duplicate sends on retry.
   * Format convention: "{event_type}/{booking_id}"
   */
  idempotencyKey?: string;
}

export interface ResendSendResult {
  id: string;
}

/**
 * Sends a transactional email via Resend.
 *
 * Throws on failure — callers must handle errors explicitly.
 * Never fails silently.
 */
export async function sendEmailViaResend(
  params: ResendEmailParams
): Promise<ResendSendResult> {
  const resend = getResend();
  const fromAddress = getFromAddress();

  // Construct "Hotel Name <address@domain.com>" from header
  // Sanitise hotel name: strip double-quotes to prevent header injection
  const sanitisedName = params.hotelName.replace(/"/g, "'");
  const from = `"${sanitisedName}" <${fromAddress}>`;

  console.info("[resend] Sending email", {
    from,
    to: params.to,
    subject: params.subject,
    idempotencyKey: params.idempotencyKey,
  });

  const sendOptions: Parameters<typeof resend.emails.send>[1] = params.idempotencyKey
    ? { idempotencyKey: params.idempotencyKey }
    : undefined;

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    },
    sendOptions
  );

  if (error) {
    console.error("[resend] Send failed", {
      to: params.to,
      subject: params.subject,
      error,
    });
    throw new Error(
      `[resend] Failed to send to ${params.to}: ${error.message}`
    );
  }

  if (!data?.id) {
    throw new Error(
      `[resend] Unexpected response: no message ID returned for ${params.to}`
    );
  }

  console.info("[resend] Email sent successfully", {
    to: params.to,
    messageId: data.id,
  });

  return { id: data.id };
}
