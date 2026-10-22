import type { GuestsData, OccupancyData, OverviewData, ReportScope, RevenueData, SourceSlice } from "../actions";
import { ROOM_REVENUE_BASIS, type ReportRange, type ReportTab } from "./report-utils";

export type ReportSnapshot =
  | { tab: "overview"; data: OverviewData }
  | { tab: "revenue"; data: RevenueData }
  | { tab: "occupancy"; data: OccupancyData }
  | { tab: "guests"; data: GuestsData };
export interface ExportContext extends ReportScope, ReportRange {
  tab: ReportTab;
  timeZone: string;
  isSuccess: boolean;
  isFetching: boolean;
  isStale: boolean;
}
type Cell = string | number | null;

/** Quote every field and neutralize spreadsheet formulas, including whitespace-prefixed ones.
 * Trusted numeric cells stay numeric, including negative adjustments. */
export function csvCell(value: Cell): string {
  if (value === null) return '"Unavailable"';
  const raw = String(value);
  const unsafe = typeof value === "string" && (/^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(raw) || /^[\t\r\n]/.test(raw));
  return `"${(unsafe ? `'${raw}` : raw).replaceAll('"', '""')}"`;
}

/** Server metadata is the source of tenant identity, including for older cached responses. */
export function matchesReportContext(snapshot: ReportSnapshot | undefined, context: ReportScope & ReportRange & { tab: ReportTab; timeZone: string }): snapshot is ReportSnapshot {
  const meta = snapshot?.data?.meta;
  return Boolean(meta && snapshot?.tab === context.tab &&
    meta.orgId === context.orgId && meta.hotelId === context.hotelId &&
    meta.startDate === context.startDate && meta.endDate === context.endDate && meta.timeZone === context.timeZone);
}

export function canExportReport(snapshot: ReportSnapshot | undefined, context: ExportContext): snapshot is ReportSnapshot {
  return context.isSuccess && !context.isFetching && !context.isStale && matchesReportContext(snapshot, context);
}

function sourcesRows(sources: SourceSlice[]): Cell[][] {
  return [[], ["Booking sources"], ["Source", "Bookings", "Room nights", "Room revenue excluding tax", "Booking share (%)"],
    ...sources.map((source) => [source.source, source.count, source.roomNights, source.revenue, source.pct])];
}

/** Exports exactly the successful active snapshot. Callers cannot export a prior range or tenant. */
export function buildReportCsv(snapshot: ReportSnapshot | undefined, context: ExportContext): string {
  if (!canExportReport(snapshot, context)) throw new Error("Refresh the current report before exporting.");
  const { data } = snapshot;
  const rows: Cell[][] = [
    ["RoomLine report", snapshot.tab], ["Organization", data.meta.orgId], ["Hotel", data.meta.hotelId],
    ["Start date (inclusive)", data.meta.startDate], ["End date (inclusive)", data.meta.endDate],
    ["Prior start date", data.meta.priorStartDate], ["Prior end date", data.meta.priorEndDate],
    ["Property timezone", data.meta.timeZone], ["Generated at (UTC)", data.meta.generatedAt], ["Currency", data.currency],
    ["Basis", snapshot.tab === "guests" ? "Successful payments by local payment date, including taxes and deposits; guest arrivals by local arrival date." : ROOM_REVENUE_BASIS],
    ...data.meta.warnings.map((warning): Cell[] => ["Report note", warning]), [],
  ];
  switch (snapshot.tab) {
    case "overview": {
      const d = snapshot.data;
      rows.push(["Metric", "Value"], ["Room revenue excluding tax", d.revenue], ["Occupancy (%)", d.occupancy],
        ["Average daily rate", d.adr], ["RevPAR", d.revpar], ["Room nights", d.roomNights], ["Revenue per guest", d.revpag],
        [], ["Property date", "Room revenue excluding tax", "Occupancy (%)", "Room nights", "Average daily rate", "RevPAR"],
        ...d.series.map((point) => [point.date, point.revenue, point.occupancy, point.roomNights, point.adr, point.revpar]), ...sourcesRows(d.sources));
      break;
    }
    case "revenue": {
      const d = snapshot.data;
      rows.push(["Metric", "Value"], ["Room revenue excluding tax", d.totalRevenue], ["Average daily rate", d.adr], ["RevPAR", d.revpar],
        ["Current outstanding (all booking dates; generated-at snapshot)", d.outstanding], [],
        [d.granularity === "week" ? "Week starting (selected dates only)" : "Property date", "Room revenue excluding tax"],
        ...d.trend.map((point) => [point.key, point.revenue]), ...sourcesRows(d.bySource));
      break;
    }
    case "occupancy": {
      const d = snapshot.data;
      rows.push(["Metric", "Value"], ["Occupancy (%)", d.occupancy], ["Occupied room nights", d.roomNights],
        ["Available room nights", d.availableRoomNights], ["Average full stay length (nights)", d.avgLengthOfStay], ["New bookings created", d.newBookings],
        [], ["Property date", "Occupancy (%)"], ...d.daily.map((point) => [point.date, point.occupancy]), [],
        ["Room type", "Occupied room nights", "Available room nights", "Occupancy (%)"],
        ...d.byRoomType.map((room) => [room.name, room.booked, room.capacity, room.occupancy]));
      break;
    }
    case "guests": {
      const d = snapshot.data;
      rows.push(["Metric", "Value"], ["Selected-period collections", d.totalCollected],
        ["Current outstanding (all booking dates; generated-at snapshot)", d.outstanding],
        ["Arriving guests", d.totalGuests], ["New arriving guests", d.newGuests], ["Repeat arriving guests", d.repeatGuests], [],
        ["Payment method", "Successful payments", "Collected"], ...d.byMethod.map((method) => [method.method, method.count, method.amount]), [],
        ["Nationality", "Arriving guests"], ...d.origins.map((origin) => [origin.nationality, origin.count]));
      break;
    }
  }
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadReportCsv(csv: string, tab: ReportTab, range: ReportRange): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `roomline-${tab}-${range.startDate}-${range.endDate}.csv`;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1_000); }
}
