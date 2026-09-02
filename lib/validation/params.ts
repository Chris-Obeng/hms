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
 * `public.generate_booking_reference` returns a bare 13-digit OTA-style number,
 * but references also arrive from imports and older records, so the rule stays
 * uppercase-alphanumeric with hyphens rather than digits-only.
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
 * Retries append a suffix (`<booking reference>-r<timestamp>`), so this is
 * longer than a booking reference and permits lowercase.
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

/**
 * Guest email address.
 *
 * Zod's built-in validator, never a hand-written pattern: a "full" RFC 5322
 * regex is both unreadable and wrong in practice, and the only real proof an
 * address works is a delivered message.
 */
export const guestEmail = z.email().max(254);
