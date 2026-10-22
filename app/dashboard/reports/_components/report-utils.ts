import { formatCurrency, formatDate } from "@/lib/format";

export type ReportTab = "overview" | "revenue" | "occupancy" | "guests";
export interface ReportRange { startDate: string; endDate: string }
const DAY_MS = 86_400_000;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Calendar-only arithmetic avoids browser/server timezone and DST shifts. */
export function shiftReportDate(value: string, days: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function validateReportRange(range: ReportRange, today: string): string | null {
  if (!validDate(range.startDate) || !validDate(range.endDate)) return "Enter a valid start and end date.";
  if (range.startDate > range.endDate) return "End date must be on or after start date.";
  if (range.endDate > today) return "End date cannot be after the current property date.";
  const days = (Date.parse(range.endDate) - Date.parse(range.startDate)) / DAY_MS + 1;
  if (days > 366) return "Choose a date range of 366 days or fewer.";
  return null;
}

export function reportRangeLabel(range: ReportRange): string {
  return `${formatDate(range.startDate, "MMM d, yyyy")} – ${formatDate(range.endDate, "MMM d, yyyy")}`;
}

export function reportMoney(value: number | null, currency: string): string {
  return value === null ? "Unavailable" : formatCurrency(value, currency);
}

export function reportPercent(value: number | null): string {
  return value === null ? "Unavailable" : `${value.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
}

export const INVENTORY_EXPLANATION = "Historical room inventory is not available for every date. Occupancy and RevPAR are unavailable where capacity cannot be verified.";

export const ROOM_REVENUE_BASIS = "Net nightly room charges and reconciled adjustments, excluding tax, for completed nights of checked-in or checked-out stays. Confirmed bookings and today's incomplete night are excluded. This is not cash collected or the full booked reservation value.";
