"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Chip } from "@heroui/react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { BI_CARD, BI_CARD_DESCRIPTION, BI_CARD_HEADER, BI_CARD_TITLE } from "./bi-styles";
import { tooltipStyle } from "../shells";
import { formatDate } from "@/lib/format";
import type { OccupancyCoverage } from "../../actions";

/**
 * Daily occupancy bars against the average line. Days without a recorded room
 * count have no bar; the average and the note cover recorded days only.
 */
export function OccupancyTrendCard({ daily, coverage, delta, className }: {
  daily: { date: string; label: string; occupancy: number | null }[];
  coverage: OccupancyCoverage;
  /** Occupancy delta in points; null hides the chip. */
  delta: number | null;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const average = coverage.occupancy;
  const chartable = average !== null && daily.some((day) => day.occupancy !== null);
  const partial = coverage.recordedDays < coverage.completedDays;
  // Name the start date only when the gap is at the beginning of the range.
  const startsLate = coverage.firstRecordedDate !== null && daily[0] !== undefined && coverage.firstRecordedDate > daily[0].date;
  const averageText = average === null ? null : `${average.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
  const chipText = delta !== null && Number.isFinite(delta)
    ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toLocaleString("en", { maximumFractionDigits: 1 })} pts`
    : null;
  const chipColor = delta === null ? "default" : delta > 0 ? "success" : delta < 0 ? "danger" : "default";

  return <Card render={(props) => <section {...props} />} className={cn(BI_CARD, className)}>
    <Card.Header className={BI_CARD_HEADER}>
      <div className="min-w-0">
        <Card.Title render={(props) => <h2 {...props} />} className={BI_CARD_TITLE}>Occupancy</Card.Title>
        <Card.Description className={BI_CARD_DESCRIPTION}>Occupied room nights as a share of verified capacity</Card.Description>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-4 text-muted-foreground" aria-hidden="true">
          <span className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-violet-500" /> Daily occupancy</span>
          <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-[#64748b]" /> {partial ? "Average of recorded days" : "Period average"}{averageText && <span className="font-medium tabular-nums text-foreground">{averageText}</span>}</span>
        </span>
        {chipText && <Chip size="sm" variant="soft" color={chipColor} className="font-medium tabular-nums">{chipText}</Chip>}
      </div>
    </Card.Header>
    <Card.Content>
      {!chartable
        ? <p className="py-8 text-center text-[13px] leading-5 text-muted-foreground">No room count is recorded for these dates yet, so occupancy can’t be shown. Room counts are saved from the day rooms are added or changed.</p>
        : <figure aria-label={`Daily occupancy bar chart. ${partial ? "Average of recorded days" : "Period average"} ${averageText}.`} className="h-48 w-full md:h-56">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={daily} accessibilityLayer={false} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                tickLine={false} axisLine={false} tickMargin={8} minTickGap={36} />
              <YAxis width={40} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[25, 50, 75, 100]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                tickFormatter={(value: number) => `${value}%`} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
                labelFormatter={(label, payload) => {
                  const iso = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
                  return typeof iso === "string" ? formatDate(iso, "EEE, MMM d, yyyy") : String(label ?? "");
                }}
                formatter={(value) => [`${Number(value).toLocaleString("en", { maximumFractionDigits: 1 })}%`, "Occupancy"]} />
              <Bar dataKey="occupancy" fill="#8b5cf6" radius={4} maxBarSize={isMobile ? 8 : 24} isAnimationActive={false} />
              {/* The value lives in the legend, so no label sits on top of the bars. */}
              <ReferenceLine y={average} stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 4" />
            </BarChart>
          </ResponsiveContainer>
        </figure>}
      {chartable && partial && <p className="text-xs leading-4 text-muted-foreground">
        Shown for {coverage.recordedDays} of {coverage.completedDays} completed days. The other days have no recorded room count{startsLate ? `; counts start on ${formatDate(coverage.firstRecordedDate!, "MMM d, yyyy")}` : ""}.
      </p>}
    </Card.Content>
  </Card>;
}
