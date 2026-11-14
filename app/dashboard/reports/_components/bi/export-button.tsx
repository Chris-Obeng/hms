"use client";

import { Download } from "lucide-react";
import { Button } from "@heroui/react";
import type { RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";
import type { GuestsData, OccupancyData, OverviewData, RevenueData } from "../../actions";

/**
 * Exports the loaded BI figures as CSV, including the room type, source, guest,
 * receivables and rooms-sold detail that the page no longer charts. Only loaded
 * figures are exported; the server actions remain the single authority over them.
 */
export function ExportButton({ range, overview, occupancy, guests, revenue, roomsSold, disabled }: {
  range: { startDate: string; endDate: string };
  overview?: OverviewData;
  occupancy?: OccupancyData;
  guests?: GuestsData;
  revenue?: RevenueData;
  roomsSold?: RoomsSoldMetric;
  disabled?: boolean;
}) {
  function download() {
    const rows: string[][] = [];
    const add = (...cells: (string | number | null | undefined)[]) => rows.push(cells.map(toCell));
    if (overview) {
      add("KPI", "Value", "Change vs prior period");
      add("Room revenue", overview.revenue, pct(overview.deltas.revenue));
      add("Occupancy %", overview.occupancy, pts(overview.deltas.occupancy));
      add("ADR", overview.adr, pct(overview.deltas.adr));
      add("RevPAR", overview.revpar, pct(overview.deltas.revpar));
      add("Room nights", overview.roomNights, pct(overview.deltas.roomNights));
      add("Collections", overview.collected, null);
      add();
      add("Daily series", "Revenue", "Occupancy %", "ADR", "RevPAR", "Room nights");
      for (const point of overview.series) add(point.date, point.revenue, point.occupancy, point.adr, point.revpar, point.roomNights);
      add();
      add("Collections by method", "Payments", "Amount");
      for (const method of overview.byMethod) add(method.method, method.count, method.amount);
      add();
      add("Booking sources", "Bookings", "Room nights", "Revenue", "Share %");
      for (const source of overview.sources) add(source.source, source.count, source.roomNights, source.revenue, source.pct);
    }
    if (occupancy) {
      add();
      add("Room type", "Occupied nights", "Capacity", "Occupancy %", "ADR", "RevPAR", "Revenue");
      for (const type of occupancy.byRoomType) add(type.name, type.booked, type.capacity, type.occupancy, type.adr, type.revpar, type.revenue);
    }
    if (guests) {
      add();
      add("Guest origins", "Guests");
      for (const origin of guests.origins) add(origin.nationality, origin.count);
      add("New guests", guests.newGuests);
      add("Repeat guests", guests.repeatGuests);
    }
    if (revenue) {
      add();
      add("Outstanding", revenue.outstanding, "Open bookings", revenue.outstandingCount);
    }
    if (roomsSold) {
      add();
      add("Rooms sold tonight", "Sold", "Pending holds", "Available to sell", "Sellable", "Active rooms");
      add(roomsSold.soldRooms, roomsSold.heldRooms, roomsSold.availableRooms, roomsSold.sellableRooms, roomsSold.totalRooms);
    }
    const csv = rows.map((row) => row.join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `oriel-reports-${range.startDate}_${range.endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <Button variant="outline" isDisabled={disabled || !overview} onPress={download}
    className="h-10 gap-2 rounded-lg border-border/70 px-4 text-sm font-medium">
    <Download size={16} aria-hidden="true" /> Export
  </Button>;
}

/** Changes carry their unit, since occupancy moves in points and the rest in percent. */
function pct(value: number | null): string | null { return value === null ? null : `${value}%`; }
function pts(value: number | null): string | null { return value === null ? null : `${value} pts`; }

/** A signed figure with an optional unit ("-1.5%", "-2 pts"): spreadsheets read it as data, never as a formula. */
const SIGNED_FIGURE = /^-?\d+(\.\d+)?(%| pts)?$/;
/** Leading characters a spreadsheet treats as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (room type,
 * source or nationality names start with =, +, -, @, tab or CR) gets a leading
 * quote; numbers and signed figures such as "-1.5%" are written as they are.
 */
export function toCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text) && !SIGNED_FIGURE.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
