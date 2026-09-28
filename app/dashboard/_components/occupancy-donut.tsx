"use client";

import { RadialBar, RadialBarChart, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { useReducedMotion } from "motion/react";

/**
 * Single-value occupancy ring. PolarAngleAxis with a fixed [0,100] domain maps
 * the percent to the arc sweep; the RadialBar's rounded cap and faint on-brand
 * background track give it the Mews-style finish. Center label sits on top.
 */
export function OccupancyDonut({ percent }: { percent: number }) {
  const reduce = useReducedMotion();
  const value = Math.max(0, Math.min(100, percent));
  const display = value % 1 === 0 ? String(value) : value.toFixed(1);

  return (
    <div
      className="relative mx-auto w-full max-w-[184px]"
      role="img"
      aria-label={`Night occupancy ${display} percent`}
    >
      <ResponsiveContainer width="100%" aspect={1} minHeight={140}>
        <RadialBarChart
          data={[{ value }]}
          startAngle={90}
          endAngle={-270}
          innerRadius="74%"
          outerRadius="100%"
          barSize={13}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={999}
            background={{ fill: "var(--accent-soft)" }}
            fill="var(--primary)"
            isAnimationActive={!reduce}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </RadialBarChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-kpi-hero tabular-nums text-foreground">{display}%</span>
        <span className="mt-0.5 text-label text-muted-foreground">Night occupancy</span>
      </div>
    </div>
  );
}
