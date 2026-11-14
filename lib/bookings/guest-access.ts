/**
 * Signed guest access to a booking. Server-only: reads BOOKING_LINK_SECRET.
 *
 * Guest pages and routes (confirmation page, calendar download, booking lookup,
 * retry payment) are reached without signing in. A booking reference alone must
 * not unlock them: references are short enough to guess, and these routes show
 * the guest's name and email and can start a payment. Every link the system
 * hands a guest therefore carries a token:
 *
 *   token = base64url( HMAC-SHA256(secret, context ‖ hotel_id ‖ subject_id)[0..16) )
 *
 * - 128 bits, so it cannot be guessed, and compared in constant time.
 * - Stateless: nothing is stored, so any booking's token can be recomputed.
 * - Bound to the hotel and the booking. For a multi-room reservation the subject
 *   is the anchor (`group_id`), so one token covers every room in it.
 * - `BOOKING_LINK_SECRET_PREVIOUS` is accepted during a secret rotation, so links
 *   issued before the rotation keep working until the previous secret is removed.
 *
 * Transition rule: bookings whose reference predates the 6-character format
 * (13-digit numbers, prefixed codes such as `HOP-2026-00001`) were linked
 * without a token, so they still open without one, but in "limited" mode: the
 * guest's email is masked and only their first name is shown. Current-format
 * references always need a valid token.
 *
 * Fails closed: without a usable secret no token verifies, so current-format
 * bookings cannot be opened from a guest link at all. That is reported loudly,
 * once per process, rather than silently degraded.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { captureIssue } from "@/lib/observability/sentry";
import { GUEST_ACCESS_TOKEN_PATTERN } from "@/lib/bookings/guest-access-link";

export {
  GUEST_ACCESS_HEADER,
  GUEST_ACCESS_QUERY_PARAM,
} from "@/lib/bookings/guest-access-link";

/** Domain separation, so these MACs can never be confused with any other use of the key. */
const TOKEN_CONTEXT = "roomline.guest-booking-access.v1";
const TOKEN_BYTES = 16;
/** A shorter secret is treated as missing: 32 characters is the floor for an HMAC key here. */
export const MIN_SECRET_LENGTH = 32;

/**
 * References issued by `generate_booking_reference` since 20261114140000.
 * Anything else is a legacy reference, linked before tokens existed.
 */
const CURRENT_REFERENCE_PATTERN = /^[23456789BCDFGHJKMNPQRSTVWXYZ]{6}$/;

/**
 * - `full`: a valid token was presented.
 * - `limited`: no valid token, but the reference predates signed links. Show
 *   the booking with contact details masked.
 * - `denied`: treat as not found.
 */
export type GuestAccessLevel = "full" | "limited" | "denied";

export interface GuestAccessBooking {
  id: string;
  group_id: string | null;
  reference: string;
}

let missingSecretReported = false;

function usableSecret(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** Signing secret first, then the previous one (verification only). */
function secrets(): string[] {
  const current = usableSecret(process.env.BOOKING_LINK_SECRET);
  if (!current) {
    reportMissingSecret();
    return [];
  }
  const previous = usableSecret(process.env.BOOKING_LINK_SECRET_PREVIOUS);
  return previous && previous !== current ? [current, previous] : [current];
}

function reportMissingSecret(): void {
  if (missingSecretReported) return;
  missingSecretReported = true;
  console.error(
    `[guest-access] BOOKING_LINK_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters; guest booking links cannot be signed or verified.`
  );
  captureIssue("BOOKING_LINK_SECRET is not configured", {
    scope: "booking-funnel",
    step: "confirm",
    level: "fatal",
    fingerprint: ["guest-access", "secret-missing"],
  });
}

function mac(secret: string, hotelId: string, subjectId: string): Buffer {
  return createHmac("sha256", secret)
    .update(`${TOKEN_CONTEXT}\u0000${hotelId}\u0000${subjectId}`, "utf8")
    .digest()
    .subarray(0, TOKEN_BYTES);
}

/** The id a token is bound to: the reservation's anchor, or the booking itself. */
export function guestAccessSubject(booking: Pick<GuestAccessBooking, "id" | "group_id">): string {
  return booking.group_id ?? booking.id;
}

/**
 * Token for the booking (or reservation anchor) `subjectId` at `hotelId`, or
 * null when no secret is configured. Callers then omit it from the link; the
 * missing secret has already been reported.
 */
export function signGuestAccess(hotelId: string, subjectId: string): string | null {
  const [secret] = secrets();
  if (!secret) return null;
  return mac(secret, hotelId, subjectId).toString("base64url");
}

/** True when `token` was signed for this hotel and subject with a configured secret. */
export function verifyGuestAccess(
  hotelId: string,
  subjectId: string,
  token: unknown
): boolean {
  if (typeof token !== "string" || !GUEST_ACCESS_TOKEN_PATTERN.test(token)) return false;
  const presented = Buffer.from(token, "base64url");
  if (presented.length !== TOKEN_BYTES) return false;
  let valid = false;
  // Every configured secret is checked, so timing does not reveal which matched.
  for (const secret of secrets()) {
    if (timingSafeEqual(presented, mac(secret, hotelId, subjectId))) valid = true;
  }
  return valid;
}

/** True for references issued before signed links, which may open in limited mode. */
export function isLegacyReference(reference: string): boolean {
  return !CURRENT_REFERENCE_PATTERN.test(reference);
}

/** Access level for a guest request on `booking`, which belongs to `hotelId`. */
export function resolveGuestAccess(
  hotelId: string,
  booking: GuestAccessBooking,
  token: unknown
): GuestAccessLevel {
  if (verifyGuestAccess(hotelId, guestAccessSubject(booking), token)) return "full";
  return isLegacyReference(booking.reference) ? "limited" : "denied";
}

/** `chris@example.com` → `c***@example.com`. Malformed input is masked completely. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/** First word of a name, for limited-mode greetings. */
export function firstNameOnly(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Test hook: lets a test observe the missing-secret report more than once. */
export function resetGuestAccessReportingForTests(): void {
  missingSecretReported = false;
}
