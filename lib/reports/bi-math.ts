/** Pure reporting calculations. Accumulate integer minor units, convert at the DTO boundary. */
import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { fromMinor, mulMinor, sumMinor, toMinor } from "@/lib/money";
import { parseReportDate } from "./resolve-range";

export interface StayRow {
  id: string;
  check_in: string;
  check_out: string;
  subtotal: number | string;
  /** Deliberately never used for room revenue: includes tax. */
  total_amount?: number | string | null;
  currency: string | null;
  nights: number | null;
  rooms_count?: number | null;
  adults?: number | null;
  children?: number | null;
}
export interface NightRow {
  id: string;
  booking_id: string;
  stay_date: string;
  rate_minor: number | string;
  rooms_count: number;
  currency: string;
  source: string;
}
export interface NightFact {
  bookingId: string;
  date: string;
  revenueMinor: number;
  roomNights: number;
}
export interface Allocation {
  revenue: number;
  revenueMinor: number;
  roomNights: number;
  guests: number;
  facts: NightFact[];
  warnings: string[];
}

export function assertCurrency(value: unknown, currency?: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw new Error("Report unavailable: a currency is missing or invalid.");
  if (currency && value !== currency) throw new Error("Report unavailable: mixed currencies require a currency-specific report; no exchange rate has been applied.");
  return value;
}
export function moneyMinor(value: unknown, currency: string): number {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && value.trim() === "")) throw new Error("Report unavailable: a monetary value is missing.");
  return toMinor(value, currency);
}
function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`Report unavailable: invalid ${label}.`);
  return value;
}

/**
 * Largest-remainder allocation using bigint intermediates. Ties use input order
 * (chronological date for nights). Returns exactly target, including signed adjustments.
 */
export function allocateMinorExactly(target: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(target) || weights.some(w => !Number.isSafeInteger(w) || w < 0)) throw new Error("Invalid minor-unit allocation.");
  if (!weights.length) {
    if (target !== 0) throw new Error("Cannot allocate money without nights.");
    return [];
  }
  const effective = weights.some(w => w > 0) ? weights : weights.map(() => 1);
  const total = effective.reduce((sum, w) => sum + BigInt(w), BigInt(0));
  const magnitude = BigInt(Math.abs(target));
  const rows = effective.map((w, index) => ({ index, amount: magnitude * BigInt(w) / total, remainder: magnitude * BigInt(w) % total }));
  let remaining = magnitude - rows.reduce((sum, row) => sum + row.amount, BigInt(0));
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) {
    if (remaining === BigInt(0)) break;
    row.amount += BigInt(1);
    remaining -= BigInt(1);
  }
  return rows.map(row => Number(row.amount) * (target < 0 ? -1 : 1));
}

/**
 * booking_nights holds per-room, tax-exclusive sold rates. bookings.subtotal is
 * the authoritative NET room charge (including manual discounts/corrections).
 * Reconcile the full booking before slicing dates: distribute its net subtotal
 * proportionally to rate_minor × rooms_count, with largest remainders assigned
 * by date. This preserves variable rates and exactly conserves the subtotal.
 * There is no separate discount field to subtract a second time.
 * Creation and repricing persist the booking's room quantity on every snapshot;
 * mismatched quantities are inconsistent stay data, not a monetary adjustment.
 * Legacy bookings with NO snapshots use an explicitly warned equal-date fallback.
 * A partially recorded stay is an error, never fabricated from current rates.
 */
export function reconcileBookingNights(stay: StayRow, recorded: NightRow[], currency: string): { facts: NightFact[]; warnings: string[] } {
  assertCurrency(stay.currency, currency);
  const rooms = positiveInteger(stay.rooms_count, "booking room quantity");
  const start = parseReportDate(stay.check_in);
  const end = parseReportDate(stay.check_out);
  const count = differenceInCalendarDays(end, start);
  positiveInteger(count, "stay length");
  if (count > 3660) throw new Error("Report unavailable: a stay exceeds the supported 3660-night reconciliation limit.");
  const target = moneyMinor(stay.subtotal, currency);
  if (target < 0) throw new Error("Report unavailable: room subtotal is negative.");
  const warnings: string[] = [];
  const nights = [...recorded].sort((a, b) => a.stay_date.localeCompare(b.stay_date) || a.id.localeCompare(b.id));
  if (!nights.length) {
    warnings.push("Some legacy stays have no nightly snapshots: their net room subtotal is allocated equally by date, with exact chronological minor-unit remainders.");
    const amounts = allocateMinorExactly(target, Array.from({ length: count }, () => 1));
    return { facts: amounts.map((revenueMinor, i) => ({ bookingId: stay.id, date: format(addDays(start, i), "yyyy-MM-dd"), revenueMinor, roomNights: rooms })), warnings };
  }
  if (nights.length !== count) throw new Error("Report unavailable: nightly snapshots are incomplete; reconcile the affected bookings.");
  const weights = nights.map((night, index) => {
    if (night.booking_id !== stay.id || night.stay_date !== format(addDays(start, index), "yyyy-MM-dd")) throw new Error("Report unavailable: nightly snapshot dates do not match their booking.");
    assertCurrency(night.currency, currency);
    const rate = Number(night.rate_minor);
    if (!Number.isSafeInteger(rate) || rate < 0) throw new Error("Report unavailable: invalid nightly minor-unit rate.");
    const nightlyRooms = positiveInteger(night.rooms_count, "nightly room quantity");
    if (nightlyRooms !== rooms) throw new Error("Report unavailable: nightly snapshot room quantities do not match their booking; reconcile the affected bookings.");
    return mulMinor(rate, nightlyRooms);
  });
  if (sumMinor(weights) !== target) warnings.push("Nightly rates have been reconciled proportionally to net booking subtotals (including discounts/corrections); chronological largest remainders conserve every minor unit.");
  if (nights.some(n => n.source === "reconstructed")) warnings.push("Some nightly rates were reconstructed from legacy booking rates rather than original dated quotes.");
  const amounts = allocateMinorExactly(target, weights);
  return { facts: nights.map((n, i) => ({ bookingId: stay.id, date: n.stay_date, revenueMinor: amounts[i], roomNights: n.rooms_count })), warnings };
}

/** Checkout is exclusive. Dates are property calendar dates, not UTC timestamps. */
export function stayNightsInRange(checkIn: string, checkOut: string, start: Date, end: Date): number {
  const lo = parseISO(checkIn) > start ? parseISO(checkIn) : start;
  const last = subDays(parseISO(checkOut), 1);
  const hi = last < end ? last : end;
  return Math.max(0, differenceInCalendarDays(hi, lo) + 1);
}
export function allocateNightlyRevenue(stays: StayRow[], start: Date, end: Date, currency: string, nights: NightRow[] = []): Allocation {
  const byBooking = new Map<string, NightRow[]>();
  for (const night of nights) {
    const rows = byBooking.get(night.booking_id) ?? [];
    rows.push(night);
    byBooking.set(night.booking_id, rows);
  }
  const lo = format(start, "yyyy-MM-dd"), hi = format(end, "yyyy-MM-dd");
  const facts: NightFact[] = [];
  const warnings = new Set<string>();
  let guests = 0;
  let reconciledNights = 0;
  for (const stay of stays) {
    if (stayNightsInRange(stay.check_in, stay.check_out, start, end) === 0) continue;
    reconciledNights += differenceInCalendarDays(parseISO(stay.check_out), parseISO(stay.check_in));
    if (reconciledNights > 100_000) throw new Error("Report unavailable: nightly reconciliation exceeds the 100,000-night safety limit; choose a shorter period.");
    const result = reconcileBookingNights(stay, byBooking.get(stay.id) ?? [], currency);
    facts.push(...result.facts.filter(n => n.date >= lo && n.date <= hi));
    result.warnings.forEach(w => warnings.add(w));
    guests += (stay.adults ?? 0) + (stay.children ?? 0);
  }
  const revenueMinor = sumMinor(facts.map(n => n.revenueMinor));
  return { revenue: fromMinor(revenueMinor, currency), revenueMinor, roomNights: facts.reduce((sum, n) => sum + n.roomNights, 0), guests, facts, warnings: [...warnings] };
}

export interface AvailabilityRow { capacity: number | null; booked: number | null }
export function occupancyFromAvailability(rows: AvailabilityRow[]) {
  const capacity = rows.some(r => r.capacity == null) ? null : rows.reduce((sum, r) => sum + r.capacity!, 0);
  const booked = rows.reduce((sum, r) => sum + (r.booked ?? 0), 0);
  return { availableRoomNights: capacity, roomNightsSold: booked, occupancyPct: occupancy(booked, capacity) };
}
export function occupancy(booked: number, capacity: number | null): number | null {
  return capacity == null || capacity <= 0 ? null : Math.round(booked / capacity * 1000) / 10;
}
export function adr(revenue: number, roomNights: number): number { return roomNights > 0 ? Math.round(revenue / roomNights * 100) / 100 : 0; }
export function revpar(revenue: number, capacity: number | null): number | null { return capacity == null || capacity <= 0 ? null : Math.round(revenue / capacity * 100) / 100; }
export function revpag(revenue: number, guests: number): number { return guests > 0 ? Math.round(revenue / guests * 100) / 100 : 0; }
export function priorRange(start: Date, end: Date): { start: Date; end: Date } {
  const span = differenceInCalendarDays(end, start) + 1;
  return { start: subDays(start, span), end: subDays(start, 1) };
}
export function pctDelta(current: number | null, prior: number | null): number | null {
  return current == null || prior == null || prior === 0 ? null : Math.round((current - prior) / prior * 1000) / 10;
}
/** Change between two percentages in percentage points: 50% to 60% is +10 pts. */
export function pointsDelta(current: number | null, prior: number | null): number | null {
  return current == null || prior == null ? null : Math.round((current - prior) * 10) / 10;
}
