"use client";

import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
import { PenTable, PenTableRow, PenTableCell, type PenColumn } from "@/components/ui/pen/pen-table";
import { moneyAmount } from "./bi-format";
import type { OccupancyData, RoomTypeOcc } from "../../actions";

const COLUMNS: PenColumn[] = [
  { label: "Room type", width: "1fr" },
  { label: "Occupied", width: "80px", align: "right" },
  { label: "Occupancy", width: "140px" },
  { label: "ADR", width: "95px", align: "right" },
  { label: "RevPAR", width: "95px", align: "right" },
  { label: "Revenue", width: "120px", align: "right" },
];

/** Occupied nights, rate and revenue per room type: table on desktop, rows on mobile. */
export function RoomTypeCard({ data, className }: { data: OccupancyData; className?: string }) {
  const soldNights = data.roomNights;
  const capacityNights = data.availableRoomNights;
  const totalRevenue = data.byRoomType.reduce((sum, row) => sum + row.revenue, 0);

  return <PenCard className={className}>
    <PenCardHead title="Room type performance" caption="Occupied room nights, rate and revenue by room type · GHS" />
    <div className="hidden lg:block">
      <PenTable caption="Room type performance" columns={COLUMNS}
        footer={<TableFooter count={data.byRoomType.length} soldNights={soldNights} capacityNights={capacityNights} totalRevenue={totalRevenue} currency={data.currency} />}>
        {data.byRoomType.map((row) => <PenTableRow key={row.name} columns={COLUMNS}>
          <PenTableCell column={COLUMNS[0]} className="text-sm text-foreground">{row.name}</PenTableCell>
          <PenTableCell column={COLUMNS[1]} className="text-sm tabular-nums">{row.booked.toLocaleString("en")}</PenTableCell>
          <PenTableCell column={COLUMNS[2]}>
            <span className="flex w-full items-center gap-2.5">
              <span className="h-1 w-[60px] overflow-hidden rounded-full bg-border" aria-hidden="true">
                <span className="block h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, row.occupancy ?? 0)}%` }} />
              </span>
              <span className="font-mono text-xs tabular-nums">{row.occupancy === null ? "—" : `${row.occupancy.toLocaleString("en", { maximumFractionDigits: 1 })}%`}</span>
            </span>
          </PenTableCell>
          <PenTableCell column={COLUMNS[3]} className="text-sm tabular-nums">{moneyAmount(row.adr, data.currency, { maximumFractionDigits: 0 })}</PenTableCell>
          <PenTableCell column={COLUMNS[4]} className="text-sm tabular-nums">{moneyAmount(row.revpar, data.currency, { maximumFractionDigits: 0 })}</PenTableCell>
          <PenTableCell column={COLUMNS[5]} className="text-sm tabular-nums">{moneyAmount(row.revenue, data.currency, { maximumFractionDigits: 0 })}</PenTableCell>
        </PenTableRow>)}
      </PenTable>
    </div>
    <div className="lg:hidden">
      {data.byRoomType.map((row, index) => <MobileRow key={row.name} row={row} currency={data.currency} first={index === 0} />)}
    </div>
  </PenCard>;
}

function TableFooter({ count, soldNights, capacityNights, totalRevenue, currency }: {
  count: number; soldNights: number; capacityNights: number | null; totalRevenue: number; currency: string;
}) {
  return <div className="flex items-center justify-between gap-4">
    <span className="text-[13px] text-muted-foreground">
      {count} {count === 1 ? "room type" : "room types"} · {soldNights.toLocaleString("en")}{capacityNights ? ` of ${capacityNights.toLocaleString("en")} room nights sold` : " room nights sold"}
    </span>
    <span className="font-mono text-xs text-muted-foreground tabular-nums">{currency} {moneyAmount(totalRevenue, currency, { maximumFractionDigits: 0 })} total</span>
  </div>;
}

function MobileRow({ row, currency, first }: { row: RoomTypeOcc; currency: string; first: boolean }) {
  return <div className={first ? "" : "border-t border-border/50"}>
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[13px] font-medium text-foreground">{row.name}</span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{moneyAmount(row.revenue, currency, { maximumFractionDigits: 0 })}</span>
    </div>
    <div className="h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
      <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, row.occupancy ?? 0)}%` }} />
    </div>
    <div className="flex items-center justify-between py-2 font-mono text-[10px] text-muted-foreground tabular-nums">
      <span>Occ {row.occupancy === null ? "—" : `${row.occupancy.toLocaleString("en", { maximumFractionDigits: 1 })}%`}</span>
      <span>ADR {moneyAmount(row.adr, currency, { maximumFractionDigits: 0 })}</span>
      <span>RevPAR {moneyAmount(row.revpar, currency, { maximumFractionDigits: 0 })}</span>
    </div>
  </div>;
}
