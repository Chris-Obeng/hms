/**
 * lib/format.ts
 *
 * Shared display formatters (currency, dates, names, stay length).
 *
 * These are pure functions with no React or server dependencies, so they can
 * be imported from server components, client components and server actions.
 * Never re-declare a local `formatCurrency` / `formatDate` helper in a
 * component — import from here instead.
 */

import { format, parseISO } from "date-fns";

import { DEFAULT_CURRENCY, formatMajor } from "./money";

/**
 * Formats a major-unit amount for display.
 *
 * Delegates to `lib/money` so the exponent table is the single source of truth:
 * fraction digits come from the currency rather than being hardcoded to 2, which
 * is what made `UGX` render as `USh 1,200.00`. `options` is still spread last,
 * so callers that need a specific Intl behaviour keep working.
 *
 * For anything new, prefer `formatMoney` from `lib/money` and keep the amount in
 * integer minor units until the moment it is rendered.
 */
export function formatCurrency(
  amount: number,
  currency = DEFAULT_CURRENCY,
  options: Intl.NumberFormatOptions = {}
): string {
  return formatMajor(amount, currency, { intl: options });
}

/** Currency without decimals — for dashboards and charts. */
export function formatCurrencyCompact(amount: number, currency = DEFAULT_CURRENCY): string {
  return formatMajor(amount, currency, { showDecimals: false });
}

/**
 * "GHS 1,150" — ISO code prefix instead of the ₵ symbol, per the booking
 * funnel design (pencil-booking.pen). `showDecimals: false` renders the
 * rounded nightly rate on room cards; totals keep the currency's decimals.
 */
export function formatCurrencyCode(
  amount: number,
  currency = DEFAULT_CURRENCY,
  options: { showDecimals?: boolean } = {}
): string {
  const { showDecimals = true } = options;
  const digits = showDecimals ? 2 : 0;
  return `${currency.toUpperCase()} ${amount.toLocaleString("en-GH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

// ── Dates ────────────────────────────────────────────────────────

/** Date-only strings are parsed as local time so the displayed day never shifts. */
function toDate(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

/**
 * Formats a date with a date-fns pattern, falling back to `fallback` for
 * nullish values and to the raw input for unparseable ones.
 *
 * @example formatDate("2026-01-02")                    // "Jan 02, 2026"
 * @example formatDate(iso, "dd MMM yyyy, HH:mm")       // "02 Jan 2026, 14:03"
 */
export function formatDate(
  value: string | Date | null | undefined,
  pattern = "MMM dd, yyyy",
  fallback = "—"
): string {
  if (!value) return fallback;
  try {
    return format(toDate(value), pattern);
  } catch {
    return typeof value === "string" ? value : fallback;
  }
}

/** "Fri, Jan 2, 2026" */
export function formatDateFull(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  return formatDate(value, "EEE, MMM d, yyyy", fallback);
}

/** "Jan 2, 2026, 2:03 PM" */
export function formatDateTime(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  return formatDate(value, "MMM d, yyyy, h:mm a", fallback);
}

/** "02 Jan 2026, 14:03" — used by the integration/sync log views. */
export function formatDateTime24(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  return formatDate(value, "dd MMM yyyy, HH:mm", fallback);
}

/** Formats an instant in the property's timezone instead of the browser timezone. */
export function formatDateInTimeZone(
  value: string | Date | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
  fallback = "—",
): string {
  if (!value) return fallback;
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(
      typeof value === "string" ? new Date(value) : value,
    );
  } catch {
    return typeof value === "string" ? value : fallback;
  }
}

/**
 * Relative time for recent timestamps: "Just now", "5m ago", "2h ago", "3d ago".
 */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  { fallback = "Never", justNow = "Just now" }: { fallback?: string; justNow?: string } = {}
): string {
  if (!value) return fallback;
  const diff = Date.now() - toDate(value).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return justNow;
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Misc display helpers ─────────────────────────────────────────

/** First letters of the first two words, uppercased. */
export function getInitials(name: string | null | undefined, fallback = "?"): string {
  if (!name) return fallback;
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || fallback;
}

/** Nights between two dates, preferring a stored value when present. */
export function getNights(
  checkIn: string,
  checkOut: string,
  nights?: number | null
): number {
  if (nights && nights > 0) return nights;
  return Math.max(
    1,
    Math.round(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    )
  );
}

/** "1 night" / "3 nights" — pluralized stay length. */
export function nightsLabel(nights: number): string {
  return `${nights} night${nights === 1 ? "" : "s"}`;
}

/**
 * Room number as stored ("room 6", "rm 6", "6") → display form ("Room 6").
 * The rooms table keeps the word inside the number, so call sites that prefix
 * "Room" themselves would otherwise render "Room room 6". Null for a booking
 * with no room assigned.
 */
export function formatRoomLabel(roomNumber: string | null | undefined): string | null {
  if (!roomNumber) return null;
  const cleaned = roomNumber.replace(/^\s*(?:room|rm)\.?\s*/i, "").trim();
  return cleaned ? `Room ${cleaned}` : "Room";
}
