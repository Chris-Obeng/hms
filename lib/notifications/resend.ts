/**
 * lib/notifications/resend.ts
 *
 * Resend email sender for Oriel.
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

const EMAIL_ADDRESS_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Extracts and validates a bare RFC-safe email address from `RESEND_FROM_ADDRESS`.
 * Tolerates both `"bookings@domain.com"` and `"Oriel <bookings@domain.com>"`
 * so operators never end up with broken double-bracket `From:` headers (`HIGH-02`).
 */
export function parseResendFromAddress(raw: string | undefined): string {
  if (!raw || !raw.trim()) {
    throw new Error(
      "[resend] RESEND_FROM_ADDRESS is not set. Add it to your environment variables."
    );
  }
  const withoutCrlf = raw.replace(/[\r\n]/g, "").trim();
  const angleMatch = withoutCrlf.match(/<([^<>]+)>/);
  const candidate = (angleMatch ? angleMatch[1] : withoutCrlf)
    .replace(/["<>]/g, "")
    .trim();

  if (!EMAIL_ADDRESS_RE.test(candidate)) {
    throw new Error(
      "[resend] RESEND_FROM_ADDRESS is not a valid email address."
    );
  }
  return candidate;
}

/** Redacts an email address for server stdout/error logs (`ab***@domain.com`). */
export function redactEmailForLog(email: string): string {
  const trimmed = String(email ?? "").trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0) return "[redacted-email]";
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}***@${domain}`;
}

function getFromAddress(): string {
  return parseResendFromAddress(process.env.RESEND_FROM_ADDRESS);
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

  // Construct "Hotel Name <address@domain.com>" from header.
  // Sanitise hotel name + subject: strip CR/LF, quotes, and angle brackets to prevent header injection.
  const sanitisedName =
    params.hotelName.replace(/[\r\n"<>]/g, " ").replace(/\s+/g, " ").trim() ||
    "Oriel";
  const sanitisedSubject = params.subject.replace(/[\r\n]/g, " ").trim();
  const from = `"${sanitisedName}" <${fromAddress}>`;
  const redactedRecipient = redactEmailForLog(params.to);

  console.info("[resend] Sending email", {
    from,
    to: redactedRecipient,
    subject: sanitisedSubject,
    idempotencyKey: params.idempotencyKey,
  });

  const sendOptions: Parameters<typeof resend.emails.send>[1] = params.idempotencyKey
    ? { idempotencyKey: params.idempotencyKey }
    : undefined;

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [params.to],
      subject: sanitisedSubject,
      html: params.html,
    },
    sendOptions
  );

  if (error) {
    console.error("[resend] Send failed", {
      to: redactedRecipient,
      subject: sanitisedSubject,
      error,
    });
    throw new Error(
      `[resend] Failed to send to ${redactedRecipient}: ${error.message}`
    );
  }

  if (!data?.id) {
    throw new Error(
      `[resend] Unexpected response: no message ID returned for ${redactedRecipient}`
    );
  }

  console.info("[resend] Email sent successfully", {
    to: redactedRecipient,
    messageId: data.id,
  });

  return { id: data.id };
}
