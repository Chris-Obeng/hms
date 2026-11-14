/**
 * Shared Zod schemas for untrusted route inputs that are *not* request bodies.
 *
 * Request bodies already go through per-route `z.object({...})` schemas. Path
 * segments and query strings were being validated with inline regexes instead,
 * which meant the same rule was written five times and could drift. They live
 * here so there is exactly one definition of "what a slug is" and "what a
 * booking reference is", and so each one carries the reason it exists.
 *
 * These are allowlists, deliberately: anything not explicitly permitted is
 * rejected before the value reaches Postgres, PostgREST, an ICS body or a
 * `Content-Disposition` header.
 */

import { z } from "zod";

/**
 * Hotel identifier taken from the URL — either the `hotels.slug` or the
 * `hotels.custom_domain`.
 *
 * Bounded at 253 characters because a custom domain is a hostname. Restricting
 * the character set matters beyond tidiness: PostgREST parses `.or()` filter
 * strings, so a value like `foo,status.eq.suspended` would be read as two
 * filters if it were ever interpolated into one.
 */
export const hotelSlugParam = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9.-]+$/i, "Invalid hotel identifier");

/**
 * Booking reference as presented by a guest.
 *
 * `public.generate_booking_reference` returns a 6-character code (e.g.
 * `K7MX4Q`) that is unique within its hotel only, so a reference must always
 * be looked up together with the hotel resolved from the URL. Older records
 * carry 13-digit numbers or prefixed codes such as `HOP-2026-00001`, so the
 * rule stays uppercase-alphanumeric with hyphens.
 *
 * Validated before use because the reference reaches an ICS calendar body and a
 * `Content-Disposition` filename, where unescaped input allows header and
 * calendar-content injection.
 */
export const bookingReferenceParam = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[A-Z0-9-]+$/, "Invalid booking reference");

/**
 * Paystack transaction reference from a callback or webhook.
 *
 * Built by `newPaystackReference` as `<booking reference>-<timestamp>-<hex>`
 * (`-r<timestamp>` for retries), so this is longer than a booking reference and
 * permits lowercase.
 */
export const paystackReferenceParam = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9._-]+$/, "Invalid payment reference");

/** ISO calendar date (`yyyy-MM-dd`) as it appears in a query string. */
export const isoDateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date");

/** Longest stay span, in nights, any guest-facing route will search or book.
 *  Matches the 366-day payout-window cap so one number bounds every date-range
 *  scan in the app. */
export const MAX_STAY_NIGHTS = 366;

/** Furthest ahead a check-in may be, in days from today. */
export const MAX_LEAD_DAYS = 730;

const STAY_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Server-side sanity check for a guest-supplied stay range, shared by the
 * availability search and the booking-create routes so both reject the same
 * shapes. It guards the date-series RPCs behind them: `room_type_available_counts`
 * builds a per-day series and `service_role` has no `statement_timeout`, so an
 * inverted or unbounded span is a denial-of-service, not just a bad request.
 *
 * Both dates must be `yyyy-MM-dd` (re-checked here via `isoDateParam`, so callers
 * may pass raw input) and are compared as UTC midnights — no timezone drift.
 */
export function validateStayRange(
  checkIn: string,
  checkOut: string
): { ok: true } | { ok: false; reason: string } {
  if (
    !isoDateParam.safeParse(checkIn).success ||
    !isoDateParam.safeParse(checkOut).success
  ) {
    return { ok: false, reason: "Invalid check-in or check-out date" };
  }
  const inMs = Date.parse(`${checkIn}T00:00:00Z`);
  const outMs = Date.parse(`${checkOut}T00:00:00Z`);
  if (outMs <= inMs) {
    return { ok: false, reason: "Check-out must be after check-in" };
  }
  if ((outMs - inMs) / STAY_DAY_MS > MAX_STAY_NIGHTS) {
    return { ok: false, reason: `Stay cannot exceed ${MAX_STAY_NIGHTS} nights` };
  }
  const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if ((inMs - todayMs) / STAY_DAY_MS > MAX_LEAD_DAYS) {
    return { ok: false, reason: "Check-in is too far in the future" };
  }
  return { ok: true };
}

/**
 * Guest email address.
 *
 * Zod's built-in validator, never a hand-written pattern: a "full" RFC 5322
 * regex is both unreadable and wrong in practice, and the only real proof an
 * address works is a delivered message.
 */
export const guestEmail = z.email().max(254);
