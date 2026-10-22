"use client";

import type { OverviewData } from "../actions";
import { MetricTile } from "./metric-tile";
import { SectionCard } from "./shells";
import { TrendChart } from "./trend-chart";
import { SourceTable } from "./source-table";
import { INVENTORY_EXPLANATION, ROOM_REVENUE_BASIS, reportMoney, reportPercent } from "./report-utils";

export function OverviewTab({ data }: { data: OverviewData }) {
  const money = (value: number | null) => reportMoney(value, data.currency);
  return <div className="reports-tab-content">
    <dl className="reports-kpis" aria-label="Key performance indicators">
      <MetricTile label="Room revenue (excl. tax)" value={money(data.revenue)} delta={data.deltas.revenue} definition="Net room charges by stay date." />
      <MetricTile label="Occupancy" value={reportPercent(data.occupancy)} delta={data.deltas.occupancy} definition="Occupied room nights ÷ available room nights." />
      <MetricTile label="Average daily rate" value={money(data.adr)} delta={data.deltas.adr} definition="Room revenue ÷ occupied room nights." />
      <MetricTile label="RevPAR" value={money(data.revpar)} delta={data.deltas.revpar} definition="Room revenue ÷ available room nights." />
    </dl>
    {(data.occupancy === null || data.revpar === null) && <p className="reports-note">{INVENTORY_EXPLANATION}</p>}
    <div className="reports-overview-grid">
      <SectionCard title="Daily room revenue" caption={`Net room revenue, excluding tax · ${data.currency}`}>
        <TrendChart title="Daily room revenue" data={data.series.map((point) => ({ date: point.date, value: point.revenue }))}
          units={data.currency} valueFormatter={money} emptyText="No room revenue in this period." />
      </SectionCard>
      <SectionCard title="Period summary" className="reports-summary">
        <dl>
          <div><dt>Room nights</dt><dd>{data.roomNights.toLocaleString("en")}</dd></div>
          <div><dt>Bookings with a stay in period</dt><dd>{data.sources.reduce((sum, source) => sum + source.count, 0).toLocaleString("en")}</dd></div>
          <div><dt>Revenue per guest</dt><dd>{money(data.revpag)}</dd></div>
        </dl>
        <p className="reports-note">{ROOM_REVENUE_BASIS}</p>
      </SectionCard>
    </div>
    <SourceTable sources={data.sources} currency={data.currency} />
  </div>;
}
