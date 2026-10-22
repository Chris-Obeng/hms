"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SOURCE_LABELS } from "@/lib/booking-status";
import { tooltipStyle } from "./shells";

const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Channel-mix donut + legend. Renders only the sources present in the data. */
export function SourceDonut({
  slices,
}: {
  slices: { source: string; count: number; pct: number }[];
}) {
  const data = slices.map((s) => ({
    name: SOURCE_LABELS[s.source] ?? s.source,
    value: s.count,
    pct: s.pct,
  }));
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <div className="grid grid-cols-[128px_1fr] items-center gap-4">
      <div className="relative" style={{ height: 128 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="66%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [value, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-kpi tabular-nums text-foreground">{total}</span>
          <span className="text-caption text-muted-foreground">bookings</span>
        </div>
      </div>
      <ul className="space-y-1.5 min-w-0">
        {data.map((row, i) => (
          <li key={row.name} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ background: SERIES[i % SERIES.length] }}
            />
            <span className="text-foreground truncate">{row.name}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{row.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
