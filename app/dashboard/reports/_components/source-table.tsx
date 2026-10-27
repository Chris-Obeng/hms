"use client";

import type { SourceSlice } from "../actions";
import { sumMinor, toMinor } from "@/lib/money";
import { SOURCE_LABELS } from "@/lib/booking-status";
import { reportMoney, reportShare } from "./report-utils";
import { EmptyState, TableShell } from "./shells";

/** Sources as a share bar plus one right-aligned table, so the revenue split reads at a glance. */
export function SourceTable({ sources, currency, caption = "Room revenue and room nights within the selected stay dates." }: {
  sources: SourceSlice[];
  currency: string;
  caption?: string;
}) {
  // Share of revenue, weighted by booking count (integer minor units throughout).
  const totalRevenue = sumMinor(sources.map((source) => toMinor(source.revenue, currency)));
  const totalBookings = sources.reduce((sum, source) => sum + source.count, 0);
  if (sources.length === 0) return <EmptyState text="No bookings in this period." />;
  return <div className="pb-3">
    <p className="px-4 pb-3 text-caption text-muted-foreground">{caption}</p>
    <div className="flex gap-[2px] px-4 pb-3" aria-hidden="true">
      {sources.map((source) => <span key={source.source} className="h-1 rounded-full bg-primary/25 first:bg-primary"
        style={{ flexGrow: Math.max(source.revenue, 0.001) }} />)}
    </div>
    <TableShell caption={`Booking sources — room revenue excluding tax (${currency})`}
      head={["Source", "Bookings", "Room nights", `Revenue (${currency})`, "Share"]}>
      {sources.map((source) => <tr key={source.source} className="transition-colors duration-150 hover:bg-muted/40">
        <th scope="row" className="px-4 py-2.5 text-left font-medium">{SOURCE_LABELS[source.source] ?? source.source}</th>
        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{source.count.toLocaleString("en")}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{source.roomNights.toLocaleString("en")}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{reportMoney(source.revenue, currency)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{totalRevenue > 0 ? reportShare(toMinor(source.revenue, currency), totalRevenue) : reportShare(source.count, totalBookings)}%</td>
      </tr>)}
    </TableShell>
  </div>;
}
