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

export function formatCurrency(
  amount: number,
  currency = "GHS",
  options: Intl.NumberFormatOptions = {}
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

/** Currency without decimals — for dashboards and charts. */
export function formatCurrencyCompact(amount: number, currency = "GHS"): string {
  return formatCurrency(amount, currency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
