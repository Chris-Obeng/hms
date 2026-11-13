"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@heroui/react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { BI_AXIS_TICK, BI_CARD, BI_CARD_DESCRIPTION, BI_CARD_HEADER, BI_CARD_TITLE } from "./bi-styles";
import { tooltipStyle } from "../shells";
import { formatDate } from "@/lib/format";
import type { OccupancyCoverage } from "../../actions";

/**
 * Nightly occupancy bars against the average line. Days without a recorded room
 * count have no bar; the average and the note cover recorded days only. The
 * change against the prior period lives in the KPI strip, so it is not repeated.
 */
export function OccupancyTrendCard({ daily, coverage, className }: {
  daily: { date: string; label: string; occupancy: number | null }[];
  coverage: OccupancyCoverage;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const average = coverage.occupancy;
  const chartable = average !== null && daily.some((day) => day.occupancy !== null);
  const partial = coverage.recordedDays < coverage.completedDays;
  // Name the start date only when the gap is at the beginning of the range.
  const startsLate = coverage.firstRecordedDate !== null && daily[0] !== undefined && coverage.firstRecordedDate > daily[0].date;
  const averageText = average === null ? null : `${average.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
  const averageLabel = partial ? "Average of recorded days" : "Period average";

  return <Card render={(props) => <section {...props} />} className={cn(BI_CARD, className)}>
    <div className={BI_CARD_HEADER}>
      <div className="min-w-0">
        <h2 className={BI_CARD_TITLE}>Occupancy</h2>
        <p className={BI_CARD_DESCRIPTION}>Share of rooms occupied each night</p>
      </div>
      {chartable && averageText && <p className="flex items-center gap-2 text-xs leading-4 text-muted-foreground">
        <span className="w-4 border-t-2 border-dashed border-primary" aria-hidden="true" />
        {averageLabel}
        <span className="font-semibold tabular-nums text-foreground">{averageText}</span>
      </p>}
    </div>
    {!chartable
      ? <p className="py-8 text-center text-sm leading-5 text-muted-foreground">No room count is recorded for these dates yet, so occupancy can’t be shown. Room counts are saved from the day rooms are added or changed.</p>
      : <figure aria-label={`Nightly occupancy bar chart. ${averageLabel} ${averageText}.`} className="h-56 w-full md:h-64 lg:h-[23rem]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={daily} accessibilityLayer={false} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="label" tick={BI_AXIS_TICK} tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
            <YAxis width={40} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 50, 100]}
              tick={BI_AXIS_TICK} tickFormatter={(value: number) => `${value}%`} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
              labelFormatter={(label, payload) => {
                const iso = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
                return typeof iso === "string" ? formatDate(iso, "EEE, MMM d, yyyy") : String(label ?? "");
              }}
              formatter={(value) => [`${Number(value).toLocaleString("en", { maximumFractionDigits: 1 })}%`, "Occupancy"]} />
            {/* Nights stay neutral; the accent marks the one figure that matters here, the average. */}
            <Bar dataKey="occupancy" fill="var(--muted-foreground)" fillOpacity={0.28} radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 8 : 20} isAnimationActive={false} />
            <ReferenceLine y={average} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4 4" />
          </BarChart>
        </ResponsiveContainer>
      </figure>}
    {chartable && partial && <p className="text-xs leading-4 text-muted-foreground">
      Shown for {coverage.recordedDays} of {coverage.completedDays} completed days. The other days have no recorded room count{startsLate ? `; counts start on ${formatDate(coverage.firstRecordedDate!, "MMM d, yyyy")}` : ""}.
    </p>}
  </Card>;
}
