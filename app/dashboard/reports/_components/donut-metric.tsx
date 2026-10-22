"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { useReducedMotion } from "motion/react";

/**
 * Mews-style rounded occupancy ring. PolarAngleAxis with a fixed [0,100] domain
 * maps the percent to the arc; the fully-rounded cap + faint pink track give the
 * finish. Center label sits on top.
 */
export function DonutMetric({
  percent,
  sublabel,
  label,
  color = "var(--bi-accent)",
}: {
  percent: number;
  sublabel?: string;
  label?: string;
  color?: string;
}) {
  const reduce = useReducedMotion();
  const value = Math.max(0, Math.min(100, percent));
  const display = value % 1 === 0 ? String(value) : value.toFixed(1);

  return (
    <div
      className="relative mx-auto w-full max-w-[128px]"
      role="img"
      aria-label={`${label ?? "Occupancy"} ${display} percent`}
    >
      <ResponsiveContainer width="100%" aspect={1} minHeight={108}>
        <RadialBarChart
          data={[{ value }]}
          startAngle={90}
          endAngle={-270}
          innerRadius="70%"
          outerRadius="100%"
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={999}
            background={{ fill: "var(--bi-accent-soft)" }}
            fill={color}
            isAnimationActive={!reduce}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-kpi tabular-nums text-foreground">{display}%</span>
        {sublabel && <span className="mt-0.5 text-caption text-muted-foreground">{sublabel}</span>}
      </div>
    </div>
  );
}
