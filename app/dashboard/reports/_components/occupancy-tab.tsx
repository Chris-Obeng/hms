"use client";

import type { OccupancyData } from "../actions";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { SectionCard } from "@/components/ui/section-card";
import { TrendChart } from "./trend-chart";
import { EmptyState, TableShell } from "./shells";
import { reportDelta, reportPercent } from "./report-utils";

function Delta({ value }: { value: number | null }) {
  const delta = reportDelta(value);
  return delta ? <span className={delta.direction === "up" ? "text-emerald-600" : delta.direction === "down" ? "text-destructive" : undefined}>{delta.text}</span> : null;
}

/** One bucket in the arrival mix: count only, since the five buckets are different bookings. */
function ArrivalCount({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0">
    <dt className="text-label text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value.toLocaleString("en")}</dd>
  </div>;
}

export function OccupancyTab({ data }: { data: OccupancyData }) {
  const available = data.availableRoomNights ?? data.byRoomType.reduce((sum, room) => sum + (room.capacity ?? 0), 0);
  const { stayMix } = data;
  return <div className="space-y-4">
    <StatStrip label="Occupancy indicators" columns={4}>
      <Stat label="Occupancy" value={reportPercent(data.occupancy)} tone={data.occupancy === null ? "unavailable" : "default"} hint={<Delta value={data.deltas.occupancy} />} />
      <Stat label="Room nights" value={data.roomNights.toLocaleString("en")} hint={<Delta value={data.deltas.roomNights} />} />
      <Stat label="Average stay" value={`${data.avgLengthOfStay} nights`} hint="full stay per booking" />
      <Stat label="New bookings" value={data.newBookings.toLocaleString("en")} hint="created in this period" />
    </StatStrip>

    <SectionCard title="Arrivals" caption="Bookings whose check-in falls on a date in this period, by current status.">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-5">
        <ArrivalCount label="Stayed" value={stayMix.stayed} />
        <ArrivalCount label="In house" value={stayMix.inHouse} />
        <ArrivalCount label="Expected" value={stayMix.arriving} />
        <ArrivalCount label="Cancelled" value={stayMix.cancelled} />
        <ArrivalCount label="No-show" value={stayMix.noShow} />
      </dl>
    </SectionCard>

    <SectionCard title="Occupancy" caption="Occupied room nights as a share of verified historical capacity.">
      <TrendChart title="Daily occupancy" currency={data.currency} percent
        data={data.daily.map((point) => ({ date: point.date, value: point.occupancy }))}
        valueFormatter={(value) => reportPercent(value)} emptyText="No occupied room nights in this period." />
    </SectionCard>

    <SectionCard title="By room type" caption={available > 0 ? `${available.toLocaleString("en")} available room nights in the period.` : undefined}>
      {data.byRoomType.length === 0 ? <EmptyState text="No room type activity in this period." /> : <TableShell
        head={["Room type", "Occupied", "Available", "Occupancy"]} caption="Occupancy by room type">
        {data.byRoomType.map((room, index) => <tr key={`${room.name}-${index}`} className="transition-colors duration-150 hover:bg-muted/40">
          <th scope="row" className="px-4 py-2.5 text-left font-medium">{room.name}</th>
          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{room.booked.toLocaleString("en")}</td>
          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{room.capacity === null ? <span aria-hidden="true">—</span> : room.capacity.toLocaleString("en")}</td>
          <td className="px-4 py-2.5 text-right">
            <div className="flex items-center justify-end gap-2 tabular-nums">
              <span className="hidden h-[3px] w-14 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary/60" style={{ width: `${Math.min(100, room.occupancy ?? 0)}%` }} />
              </span>
              {room.occupancy === null ? <span className="text-muted-foreground">—</span> : reportPercent(room.occupancy)}
            </div>
          </td>
        </tr>)}
      </TableShell>}
    </SectionCard>
  </div>;
}
