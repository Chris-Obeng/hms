/**
 * Guest booking links: URL building and log redaction.
 *
 * Safe to import from client components. Signing and verification live in
 * `lib/bookings/guest-access.ts`, which is server-only because it reads the
 * signing secret.
 *
 * A guest reaches their booking through a link that carries the booking
 * reference (`bref`) and a signed access token (`t`). The reference is short so
 * people can read it aloud; the token is what proves the holder was given the
 * link. Every guest-facing page and route that shows or acts on a booking
 * checks the token, so guessing a reference is not enough.
 */

/** Query parameter that carries the signed guest access token. */
export const GUEST_ACCESS_QUERY_PARAM = "t";

/** Request header that carries the token on guest API calls (retry payment). */
export const GUEST_ACCESS_HEADER = "x-booking-access";

/** Shape of a token: 16 bytes of HMAC output, base64url, no padding. */
export const GUEST_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export interface ConfirmationLinkOptions {
  /** Signed access token. Omitted from the URL when null or empty. */
  accessToken?: string | null;
  /** Paystack transaction reference to verify on arrival. */
  paymentReference?: string | null;
}

/**
 * Path of a booking's confirmation page, e.g.
 * `/my-hotel/confirmation?bref=K7MX4Q&t=…&trxref=…`.
 *
 * Paystack appends its own `trxref` and `reference` to a callback URL, so the
 * callback is built without `paymentReference` and Paystack adds it.
 */
export function confirmationPath(
  slug: string,
  bookingReference: string,
  { accessToken, paymentReference }: ConfirmationLinkOptions = {}
): string {
  const params = new URLSearchParams({ bref: bookingReference });
  if (accessToken) params.set(GUEST_ACCESS_QUERY_PARAM, accessToken);
  if (paymentReference) params.set("trxref", paymentReference);
  return `/${encodeURIComponent(slug)}/confirmation?${params.toString()}`;
}

/** Path of the booking's calendar (.ics) download. */
export function calendarPath(
  slug: string,
  bookingReference: string,
  accessToken?: string | null
): string {
  const params = new URLSearchParams({ reference: bookingReference });
  if (accessToken) params.set(GUEST_ACCESS_QUERY_PARAM, accessToken);
  return `/api/booking/${encodeURIComponent(slug)}/calendar?${params.toString()}`;
}

const ACCESS_PARAM_IN_TEXT = new RegExp(
  // Stops at a backslash too, so redacting serialised JSON cannot eat an escape.
  `([?&]${GUEST_ACCESS_QUERY_PARAM}=)[^&#\\s"'<>\\\\]*`,
  "g"
);

/**
 * Replaces the access token in any URL or query string inside `text`, so the
 * token never reaches telemetry. Text without one is returned unchanged.
 */
export function redactGuestAccessToken(text: string): string {
  return text.replace(ACCESS_PARAM_IN_TEXT, "$1[redacted]");
}

/**
 * {@link redactGuestAccessToken} applied to every string inside a value
 * (objects and arrays walked recursively, up to `maxDepth`). Mutates and
 * returns the value, so it can sit directly in a Sentry hook.
 */
export function redactGuestAccessTokenDeep<T>(value: T, maxDepth = 8): T {
  return redactNode(value, maxDepth) as T;
}

function redactNode(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactGuestAccessToken(value);
  if (depth <= 0 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = redactNode(value[i], depth - 1);
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) record[key] = redactNode(record[key], depth - 1);
  return value;
}
