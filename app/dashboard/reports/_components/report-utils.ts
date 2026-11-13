import { formatCurrency } from "@/lib/format";
import { shiftReportDate, validateReportRange, reportPeriodLabel } from "@/lib/report-dates";
import type { GuestsData, OccupancyData, OverviewData, RevenueData } from "../actions";

export type ReportTab = "overview" | "revenue" | "occupancy" | "guests";
export interface ReportRange { startDate: string; endDate: string }
export type ReportSnapshot =
  | { tab: "overview"; data: OverviewData }
  | { tab: "revenue"; data: RevenueData }
  | { tab: "occupancy"; data: OccupancyData }
  | { tab: "guests"; data: GuestsData };

// Date arithmetic lives in lib/report-dates.ts so the shared range control and
// the reports page validate identically; re-exported for existing callers.
export { shiftReportDate, validateReportRange, reportPeriodLabel };

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
const DAY_MS = 86_400_000;
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

export const INVENTORY_EXPLANATION = "Historical room inventory is not available for every date. Occupancy and RevPAR are unavailable where capacity cannot be verified.";

export const ROOM_REVENUE_BASIS = "Net nightly room charges and reconciled adjustments, excluding tax, for completed nights of checked-in or checked-out stays. Confirmed bookings and today's incomplete night are excluded. This is not cash collected or the full booked reservation value.";
