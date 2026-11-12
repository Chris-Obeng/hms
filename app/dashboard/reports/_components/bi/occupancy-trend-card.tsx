"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Chip } from "@heroui/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
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

  return <PenCard className={className}>
    <PenCardHead title="Occupancy" caption="Occupied room nights as a share of verified capacity" actions={<>
      <span className="hidden items-center gap-2 text-[11px] text-muted-foreground md:flex" aria-hidden="true">
        <span className="size-3 rounded-[4px] bg-violet-500" /> Daily occupancy
        <span className="ml-3 h-[4px] w-4 rounded-full bg-[#64748b]" /> Period average
      </span>
      {chipText && <Chip size="sm" variant="soft" color={chipColor} className="font-medium tabular-nums">{chipText}</Chip>}
    </>} />
    {!chartable
      ? <p className="py-8 text-center text-[13px] text-muted-foreground">Historical capacity is not recorded for this range, so occupancy cannot be charted.</p>
      : <figure aria-label={`Daily occupancy bar chart. Period average ${average.toLocaleString("en", { maximumFractionDigits: 1 })} percent.`} className="h-[176px] w-full md:h-[216px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={daily} accessibilityLayer={false} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickLine={false} axisLine={false} tickMargin={8} minTickGap={36} />
            <YAxis width={38} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[25, 50, 75, 100]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickFormatter={(value: number) => `${value}%`} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
              labelFormatter={(label, payload) => {
                const iso = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
                return typeof iso === "string" ? formatDate(iso, "EEE, MMM d, yyyy") : String(label ?? "");
              }}
              formatter={(value) => [`${Number(value).toLocaleString("en", { maximumFractionDigits: 1 })}%`, "Occupancy"]} />
            <Bar dataKey="occupancy" fill="#8b5cf6" radius={4} barSize={isMobile ? 6 : 24} isAnimationActive={false} />
            <ReferenceLine y={average} stroke="#64748b" strokeWidth={1.5}
              label={{ value: `avg ${average.toLocaleString("en", { maximumFractionDigits: 1 })}%`, position: "insideTopRight", fill: "#475569", fontSize: 10, fontFamily: "var(--font-mono)" }} />
          </BarChart>
        </ResponsiveContainer>
      </figure>}
  </PenCard>;
}
