"use client";

import type { RevenueData } from "../actions";
import { SectionCard } from "@/components/ui/section-card";
import { TrendChart } from "./trend-chart";
import { SourceTable } from "./source-table";
import { reportMoney } from "./report-utils";

export function RevenueTab({ data }: { data: RevenueData }) {
  const money = (value: number | null) => reportMoney(value, data.currency);
  const weekly = data.granularity === "week";
  const title = "Room revenue";
  const caption = weekly
    ? `Weekly totals · week starting on the date shown · boundary weeks include only selected dates · ${data.currency}`
    : `Net room charges, excluding tax · ${data.currency}`;
  return <div className="space-y-4">
    <SectionCard title={title} caption={caption}>
      <TrendChart data={data.trend.map((point) => ({ date: point.key, value: point.revenue }))} title={title} currency={data.currency}
        valueFormatter={money} emptyText="No room revenue in this period." />
    </SectionCard>

    <SectionCard title="Booking sources">
      <SourceTable sources={data.bySource} currency={data.currency} />
    </SectionCard>

    <SectionCard title="Outstanding balance" caption="Unpaid balances across all non-cancelled bookings, including departed stays and tax. Not limited to the selected dates.">
      <p className="px-4 pb-4 text-2xl font-semibold tracking-tight tabular-nums">{money(data.outstanding)}</p>
    </SectionCard>
  </div>;
}
