/**
 * Early departures: what happens to a stay when the guest checks out before
 * their booked departure.
 *
 * The industry standard (Mews, Cloudbeds, OPERA; USALI / STR for reporting)
 * is to move the departure to the day the guest left, so the nights they did
 * not use stop being room nights and room revenue. The SQL function
 * `check_out_early` does that in one transaction and decides the money by the
 * hotel's policy (or a per-stay override):
 *
 * - "charge": the bill stays the same; the unused nights become an early
 *   departure fee (part of the total, never room revenue).
 * - "release": the bill drops by the unused nights; anything already paid
 *   above the new total is left for staff to refund.
 *
 * A guest who leaves on their arrival day keeps one night: they used it.
 */

import { formatCurrency } from "@/lib/format";

export type EarlyDeparturePolicy = "charge" | "release";

export const EARLY_DEPARTURE_POLICIES: readonly EarlyDeparturePolicy[] = ["charge", "release"];

/** Hotels that never chose keep the bill as booked, as Oriel always did. */
export const DEFAULT_EARLY_DEPARTURE_POLICY: EarlyDeparturePolicy = "charge";

export function readEarlyDeparturePolicy(settings: unknown): EarlyDeparturePolicy {
  const value =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>).early_departure_policy
      : undefined;
  return value === "charge" || value === "release" ? value : DEFAULT_EARLY_DEPARTURE_POLICY;
}

/** One outcome of shortening a stay (what `bookings_private.shorten_stay` returns). */
export interface EarlyDepartureOutcome {
  currency: string;
  checkOutBefore: string;
  checkOutAfter: string;
  nightsReleased: number;
  /** Price of the nights no longer used (room charge plus its tax). */
  releasedAmount: number;
  earlyDepartureFee: number;
  totalBefore: number;
  totalAfter: number;
  amountPaid: number;
  /** Paid above the new total: the amount to refund. */
  overpaid: number;
  paymentStatus: string | null;
}

export interface EarlyDeparturePreview {
  policy: EarlyDeparturePolicy;
  departureDate: string;
  charge: EarlyDepartureOutcome;
  release: EarlyDepartureOutcome;
}

export interface EarlyDepartureResult extends EarlyDepartureOutcome {
  policy: EarlyDeparturePolicy;
  departureDate: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw new Error("Early check-out returned an invalid amount.");
  return n;
}

function str(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Early check-out returned an invalid value.");
  return value;
}

function policy(value: unknown): EarlyDeparturePolicy {
  if (value === "charge" || value === "release") return value;
  throw new Error("Early check-out returned an unknown policy.");
}

export function parseEarlyDepartureOutcome(raw: unknown): EarlyDepartureOutcome {
  if (!isRecord(raw)) throw new Error("Early check-out returned no result.");
  return {
    currency: str(raw.currency),
    checkOutBefore: str(raw.check_out_before),
    checkOutAfter: str(raw.check_out_after),
    nightsReleased: num(raw.nights_released),
    releasedAmount: num(raw.released_amount),
    earlyDepartureFee: num(raw.early_departure_fee),
    totalBefore: num(raw.total_before),
    totalAfter: num(raw.total_after),
    amountPaid: num(raw.amount_paid),
    overpaid: num(raw.overpaid),
    paymentStatus: typeof raw.payment_status === "string" ? raw.payment_status : null,
  };
}

export function parseEarlyDepartureResult(raw: unknown): EarlyDepartureResult {
  if (!isRecord(raw)) throw new Error("Early check-out returned no result.");
  return {
    ...parseEarlyDepartureOutcome(raw),
    policy: policy(raw.policy),
    departureDate: str(raw.departure_date),
  };
}

/** `null` when the stay is not leaving early (or is not in house). */
export function parseEarlyDeparturePreview(raw: unknown): EarlyDeparturePreview | null {
  if (!isRecord(raw)) throw new Error("Early check-out preview returned no result.");
  if (raw.early !== true) return null;
  return {
    policy: policy(raw.policy),
    departureDate: str(raw.departure_date),
    charge: parseEarlyDepartureOutcome(raw.charge),
    release: parseEarlyDepartureOutcome(raw.release),
  };
}

/**
 * Whether checking out on `today` is early: the stay would end before its
 * booked departure. Mirrors the SQL (at least one night is always kept).
 */
export function isEarlyDeparture(checkIn: string, checkOut: string, today: string): boolean {
  const firstMorning = addDays(checkIn, 1);
  const departure = today > firstMorning ? today : firstMorning;
  return departure < checkOut;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** What to tell staff after an early check-out (shared by every check-out button). */
export function earlyCheckoutToast(early: EarlyDepartureResult): { tone: "success" | "warning"; text: string } {
  if (early.overpaid > 0) {
    return {
      tone: "warning",
      text: `Checked out early. Give the guest back ${formatCurrency(early.overpaid, early.currency)}, then record the refund on their booking.`,
    };
  }
  if (early.policy === "release") {
    return { tone: "success", text: `Checked out early. The bill is now ${formatCurrency(early.totalAfter, early.currency)}.` };
  }
  if (early.earlyDepartureFee > 0) {
    return {
      tone: "success",
      text: `Checked out early. ${formatCurrency(early.earlyDepartureFee, early.currency)} kept as an early departure fee.`,
    };
  }
  return { tone: "success", text: "Checked out early. The bill is unchanged." };
}
