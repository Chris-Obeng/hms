"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Chip } from "@heroui/react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { BI_CARD, BI_CARD_DESCRIPTION, BI_CARD_HEADER, BI_CARD_TITLE } from "./bi-styles";
import { tooltipStyle } from "../shells";
import { formatDate } from "@/lib/format";

/** Daily occupancy bars against a period-average line, per the design. */
export function OccupancyTrendCard({ daily, average, delta, className }: {
  daily: { date: string; label: string; occupancy: number | null }[];
  /** Period occupancy — the same figure the KPI strip shows. */
  average: number | null;
  /** Occupancy delta in points; null hides the chip. */
  delta: number | null;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const chartable = daily.length > 0 && average !== null;
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
        <span className="hidden items-center gap-4 text-xs leading-4 text-muted-foreground md:flex" aria-hidden="true">
          <span className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-violet-500" /> Daily occupancy</span>
          <span className="flex items-center gap-2"><span className="h-1 w-4 rounded-full bg-[#64748b]" /> Period average</span>
        </span>
        {chipText && <Chip size="sm" variant="soft" color={chipColor} className="font-medium tabular-nums">{chipText}</Chip>}
      </div>
    </Card.Header>
    <Card.Content>
      {!chartable
        ? <p className="py-8 text-center text-[13px] leading-5 text-muted-foreground">Historical capacity is not recorded for this range, so occupancy cannot be charted.</p>
        : <figure aria-label={`Daily occupancy bar chart. Period average ${average.toLocaleString("en", { maximumFractionDigits: 1 })} percent.`} className="h-48 w-full md:h-56">
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
              <ReferenceLine y={average} stroke="#64748b" strokeWidth={1.5}
                label={{ value: `avg ${average.toLocaleString("en", { maximumFractionDigits: 1 })}%`, position: "insideTopRight", fill: "#475569", fontSize: 10, fontFamily: "var(--font-mono)" }} />
            </BarChart>
          </ResponsiveContainer>
        </figure>}
    </Card.Content>
  </Card>;
}
