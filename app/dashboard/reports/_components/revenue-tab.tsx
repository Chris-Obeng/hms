"use client";

import type { RevenueData } from "../actions";
import { MetricTile } from "./metric-tile";
import { TrendChart } from "./trend-chart";
import { SectionCard } from "./shells";
import { SourceTable } from "./source-table";
import { ROOM_REVENUE_BASIS, reportMoney } from "./report-utils";

export function RevenueTab({ data }: { data: RevenueData }) {
  const money = (value: number | null) => reportMoney(value, data.currency);
  const title = data.granularity === "week" ? "Weekly room revenue" : "Daily room revenue";
  return <div className="reports-tab-content">
    <dl className="reports-kpis reports-kpis-three" aria-label="Room revenue indicators">
      <MetricTile label="Room revenue (excl. tax)" value={money(data.totalRevenue)} delta={data.deltas.revenue} definition="Net room charges by stay date." />
      <MetricTile label="Average daily rate" value={money(data.adr)} delta={data.deltas.adr} definition="Room revenue ÷ occupied room nights." />
      <MetricTile label="RevPAR" value={money(data.revpar)} delta={data.deltas.revpar} definition="Room revenue ÷ available room nights." />
    </dl>
    <SectionCard title={title} caption={data.granularity === "week" ? `Week starting on date shown · ${data.currency} · boundary weeks include only selected dates` : `Net room revenue, excluding tax · ${data.currency}`}>
      <TrendChart data={data.trend.map((point) => ({ date: point.key, value: point.revenue }))} title={title} units={data.currency}
        valueFormatter={money} emptyText="No room revenue in this period." />
    </SectionCard>
    <p className="reports-note">{ROOM_REVENUE_BASIS}</p>
    <SourceTable sources={data.bySource} currency={data.currency} />
    <section className="reports-current-balance" aria-label="Current outstanding balance">
      <div><h2>Current outstanding</h2><p>Current unpaid balances, including departed stays and tax. Not limited to the selected dates; cancelled and no-show bookings are excluded.</p></div>
      <p className="reports-balance-value">{money(data.outstanding)}</p>
    </section>
  </div>;
}
