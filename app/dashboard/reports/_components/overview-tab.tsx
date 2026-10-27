"use client";

import type { OverviewData } from "../actions";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { SectionCard } from "@/components/ui/section-card";
import { SegmentedDonut } from "@/components/ui/segmented-donut";
import { TrendChart } from "./trend-chart";
import { reportDelta, reportMoney, reportPercent, tenderSegments } from "./report-utils";

function Delta({ value }: { value: number | null }) {
  const delta = reportDelta(value);
  return delta ? <span className={delta.direction === "up" ? "text-emerald-600" : delta.direction === "down" ? "text-destructive" : undefined}>{delta.text}</span> : null;
}

export function OverviewTab({ data }: { data: OverviewData }) {
  const money = (value: number | null) => reportMoney(value, data.currency);
  const segments = tenderSegments(data.byMethod);
  return <div className="space-y-4">
    <StatStrip label="Key performance indicators" columns={5}>
      <Stat label="Room revenue" value={money(data.revenue)} hint={<Delta value={data.deltas.revenue} />} />
      <Stat label="Occupancy" value={reportPercent(data.occupancy)} tone={data.occupancy === null ? "unavailable" : "default"} hint={<Delta value={data.deltas.occupancy} />} />
      <Stat label="ADR" value={money(data.adr)} hint={<Delta value={data.deltas.adr} />} />
      <Stat label="RevPAR" value={money(data.revpar)} tone={data.revpar === null ? "unavailable" : "default"} hint={<Delta value={data.deltas.revpar} />} />
      <Stat label="Room nights" value={data.roomNights.toLocaleString("en")} hint={<Delta value={data.deltas.roomNights} />} />
    </StatStrip>

    <SectionCard title="Room revenue" caption={`Net room charges, excluding tax · ${data.currency}`}>
      <TrendChart title="Room revenue" currency={data.currency}
        data={data.series.map((point) => ({ date: point.date, value: point.revenue }))}
        valueFormatter={money} emptyText="No room revenue in this period." />
    </SectionCard>

    <SectionCard title="Collected" caption={`Successful payments in the period · ${data.currency}`}>
      {segments.length === 0
        ? <p className="px-4 pb-5 text-sm text-muted-foreground">No payments collected in this period.</p>
        : <div className="px-4 pb-5">
          <SegmentedDonut label="Collected by payment method" heading="Collected" value={money(data.collected)} segments={segments} />
        </div>}
    </SectionCard>
  </div>;
}
