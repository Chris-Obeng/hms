import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import type { GuestsData, OccupancyData, OverviewData, RevenueData } from "../actions";

export type ReportTab = "overview" | "revenue" | "occupancy" | "guests";
export interface ReportRange { startDate: string; endDate: string }
export type ReportSnapshot =
  | { tab: "overview"; data: OverviewData }
  | { tab: "revenue"; data: RevenueData }
  | { tab: "occupancy"; data: OccupancyData }
  | { tab: "guests"; data: GuestsData };
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

/** A short, calm period label: "Sep 23 – Oct 22, 2026" within one year. */
export function reportPeriodLabel(range: ReportRange): string {
  const sameYear = range.startDate.slice(0, 4) === range.endDate.slice(0, 4);
  return sameYear
    ? `${formatDate(range.startDate, "MMM d")} – ${formatDate(range.endDate, "MMM d, yyyy")}`
    : reportRangeLabel(range);
}

/** Server metadata is the only authority for tenant identity, including for older cached responses. */
export function matchesReportContext(
  snapshot: ReportSnapshot | undefined,
  context: ReportRange & { orgId: string; hotelId: string; tab: ReportTab; timeZone: string },
): snapshot is ReportSnapshot {
  const meta = snapshot?.data?.meta;
  return Boolean(meta && snapshot?.tab === context.tab &&
    meta.orgId === context.orgId && meta.hotelId === context.hotelId &&
    meta.startDate === context.startDate && meta.endDate === context.endDate && meta.timeZone === context.timeZone);
}

export function reportMoney(value: number | null, currency: string): string {
  return value === null ? "Unavailable" : formatCurrency(value, currency);
}

/** Currency without its decimal tail, for axis ticks and dense table columns. */
export function reportMoneyWhole(value: number | null, currency: string): string {
  return value === null ? "Unavailable" : formatCurrency(value, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** "GHS 12,345.67" without the space Intl inserts, so currency and figure can be set at different sizes. */
export function splitMoney(value: string, currency: string): { currency: string; amount: string } {
  return value.startsWith(currency) ? { currency, amount: value.slice(currency.length).trimStart() } : { currency: "", amount: value };
}

export function reportPercent(value: number | null): string {
  return value === null ? "Unavailable" : `${value.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
}

/** Calendar days covered by an inclusive range. */
export function reportDayCount(range: ReportRange): number {
  return (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / DAY_MS + 1;
}

/** Share of the period, rounded to one decimal. */
export function reportShare(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

/** Signed change against the prior period, for a KPI line. Null when there is no comparable prior figure. */
export function reportDelta(value: number | null | undefined, label = "vs prior period"): { text: string; direction: "up" | "down" | "flat" } | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const directions = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const text = `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("en", { maximumFractionDigits: 1 })}% ${label}`;
  return { text, direction: directions };
}

/** Tender colours for the composition ring. Follows the chart tokens, so it inherits the theme. */
export const TENDER_COLORS: Record<string, string> = {
  cash: "var(--chart-1)",
  card: "var(--chart-2)",
  mobile_money: "var(--chart-3)",
  bank_transfer: "var(--chart-4)",
  pos: "var(--chart-5)",
  paystack_link: "var(--chart-5)",
};
export const OTHER_TENDER_COLOR = "var(--muted-foreground)";
/** Distinct fallbacks for tenders the theme has no token for, so no two arcs share a hue. */
const FALLBACK_TENDER_COLORS = ["color-mix(in oklch, var(--chart-3) 55%, var(--chart-1))", "color-mix(in oklch, var(--chart-1) 45%, var(--chart-2))"];

/** Top three tenders by amount, the rest folded into one "Other" slice. */
export function tenderSegments(rows: { method: string; amount: number }[]): { key: string; label: string; value: number; color: string }[] {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  const unresolved = sorted.filter((row) => !TENDER_COLORS[row.method]);
  const segments = sorted.slice(0, 3).map((row) => ({
    key: row.method, label: PAYMENT_METHOD_LABELS[row.method] ?? row.method, value: row.amount,
    color: TENDER_COLORS[row.method] ?? FALLBACK_TENDER_COLORS[unresolved.indexOf(row) % FALLBACK_TENDER_COLORS.length],
  }));
  const tail = sorted.slice(3);
  if (tail.length > 0) segments.push({ key: "other", label: "Other", value: tail.reduce((sum, row) => sum + row.amount, 0), color: OTHER_TENDER_COLOR });
  return segments;
}

export const INVENTORY_EXPLANATION = "Historical room inventory is not available for every date. Occupancy and RevPAR are unavailable where capacity cannot be verified.";

export const ROOM_REVENUE_BASIS = "Net nightly room charges and reconciled adjustments, excluding tax, for completed nights of checked-in or checked-out stays. Confirmed bookings and today's incomplete night are excluded. This is not cash collected or the full booked reservation value.";
