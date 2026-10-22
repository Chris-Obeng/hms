"use client";

import type { OccupancyData } from "../actions";
import { MetricTile } from "./metric-tile";
import { TrendChart } from "./trend-chart";
import { EmptyState, SectionCard, TableShell } from "./shells";
import { INVENTORY_EXPLANATION, reportPercent } from "./report-utils";

export function OccupancyTab({ data }: { data: OccupancyData }) {
  return <div className="reports-tab-content">
    <dl className="reports-kpis" aria-label="Occupancy indicators">
      <MetricTile label="Occupancy" value={reportPercent(data.occupancy)} delta={data.deltas.occupancy} definition="Occupied room nights ÷ available room nights." />
      <MetricTile label="Room nights" value={data.roomNights.toLocaleString("en")} delta={data.deltas.roomNights} definition="Occupied room nights in the selected period." />
      <MetricTile label="Average length of stay" value={`${data.avgLengthOfStay} nights`} definition="Full stay length per booking overlapping this period." />
      <MetricTile label="New bookings" value={data.newBookings.toLocaleString("en")} definition="Reservations created in the selected period." />
    </dl>
    {data.occupancy === null && <p className="reports-note">{INVENTORY_EXPLANATION}</p>}
    <SectionCard title="Daily occupancy" caption="Occupied room nights as a percentage of verified historical capacity.">
      <TrendChart title="Daily occupancy" data={data.daily.map((point) => ({ date: point.date, value: point.occupancy }))}
        percent units="Occupancy (%)" valueFormatter={reportPercent} emptyText="No occupied room nights in this period." />
    </SectionCard>
    <SectionCard title="Occupancy by room type" caption="Capacity is available room nights across the selected dates.">
      {data.byRoomType.length === 0 ? <EmptyState text="No room type activity in this period." /> : <TableShell
        head={["Room type", "Occupied room nights", "Available room nights", "Occupancy"]} caption="Occupancy by room type">
        {data.byRoomType.map((room, index) => <tr key={`${room.name}-${index}`}><th scope="row">{room.name}</th><td>{room.booked.toLocaleString("en")}</td>
          <td>{room.capacity === null ? "Unavailable" : room.capacity.toLocaleString("en")}</td><td>{reportPercent(room.occupancy)}</td></tr>)}
      </TableShell>}
    </SectionCard>
  </div>;
}
