"use client";

import { getSourceLabel } from "@/lib/booking-status";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
import { PenTable, PenTableRow, PenTableCell, type PenColumn } from "@/components/ui/pen/pen-table";
import { moneyAmount } from "./bi-format";
import type { SourceSlice } from "../../actions";

const COLUMNS: PenColumn[] = [
  { label: "Source", width: "1fr" },
  { label: "Bookings", width: "90px", align: "right" },
  { label: "Room nights", width: "100px", align: "right" },
  { label: "Revenue", width: "130px", align: "right" },
  { label: "Share", width: "140px" },
];

/** Share strip + source table: where booked room nights and revenue came from. */
export function SourcesCard({ sources, currency, className }: {
  sources: SourceSlice[];
  currency: string;
  className?: string;
}) {
  const bookings = sources.reduce((sum, row) => sum + row.count, 0);
  const revenue = sources.reduce((sum, row) => sum + row.revenue, 0);

  return <PenCard className={className}>
    <PenCardHead title="Booking sources" caption="Room revenue and room nights within the selected stay dates · GHS" />
    {sources.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">No stays with revenue in this period.</p> : <>
      <ShareStrip sources={sources} />
      <div className="hidden lg:block">
        <PenTable caption="Booking sources" columns={COLUMNS}
          footer={<div className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-muted-foreground">{bookings.toLocaleString("en")} bookings with stays in the period</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{currency} {moneyAmount(revenue, currency, { maximumFractionDigits: 0 })} room revenue</span>
          </div>}>
          {sources.map((row) => <PenTableRow key={row.source} columns={COLUMNS}>
            <PenTableCell column={COLUMNS[0]} className="text-sm text-foreground">{getSourceLabel(row.source)}</PenTableCell>
            <PenTableCell column={COLUMNS[1]} className="text-sm tabular-nums">{row.count.toLocaleString("en")}</PenTableCell>
            <PenTableCell column={COLUMNS[2]} className="text-sm tabular-nums">{row.roomNights.toLocaleString("en")}</PenTableCell>
            <PenTableCell column={COLUMNS[3]} className="text-sm tabular-nums">{moneyAmount(row.revenue, currency, { maximumFractionDigits: 0 })}</PenTableCell>
            <PenTableCell column={COLUMNS[4]}>
              <span className="flex w-full items-center gap-2.5">
                <span className="h-1 w-[56px] overflow-hidden rounded-full bg-border" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[var(--pen-accent)]" style={{ width: `${Math.min(100, row.pct)}%` }} />
                </span>
                <span className="font-mono text-xs tabular-nums">{row.pct.toLocaleString("en", { maximumFractionDigits: 1 })}%</span>
              </span>
            </PenTableCell>
          </PenTableRow>)}
        </PenTable>
      </div>
      <div className="lg:hidden">
        {sources.map((row, index) => <div key={row.source} className={index === 0 ? "" : "border-t border-border/50"}>
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-xs font-medium text-foreground">{getSourceLabel(row.source)}</span>
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-xs tabular-nums text-foreground">{moneyAmount(row.revenue, currency, { maximumFractionDigits: 0 })}</span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{row.pct.toLocaleString("en", { maximumFractionDigits: 1 })}%</span>
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <div className="h-full rounded-full bg-[var(--pen-accent)]" style={{ width: `${Math.min(100, row.pct)}%` }} />
          </div>
        </div>)}
      </div>
    </>}
  </PenCard>;
}

/** 4px bar of the source mix; each step down in rank is one step lighter. */
function ShareStrip({ sources }: { sources: SourceSlice[] }) {
  const OPACITIES = [1, 0.55, 0.35, 0.2];
  const total = sources.reduce((sum, row) => sum + row.count, 0) || 1;
  return <div className="flex h-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
    {sources.map((row, index) => <span key={row.source}
      className="h-full bg-[var(--pen-accent)]"
      style={{ width: `${(row.count / total) * 100}%`, opacity: OPACITIES[Math.min(index, OPACITIES.length - 1)] }} />)}
  </div>;
}
