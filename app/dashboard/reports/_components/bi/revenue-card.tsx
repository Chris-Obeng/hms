"use client";

import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PenCard } from "@/components/ui/pen/pen-card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { compactNumber, moneyAmount } from "./bi-format";
import { tooltipStyle } from "../shells";
import type { OverviewSeriesPoint } from "../../actions";

const DAY_COUNT = 14;

interface TrendRow { date: string; label: string; value: number; prior: number | null }

/** Zips the current and prior daily series onto one axis, by point index. */
function toRows(current: OverviewSeriesPoint[], prior: OverviewSeriesPoint[]): TrendRow[] {
  return current.map((point, index) => ({
    date: point.date, label: point.label,
    value: point.revenue, prior: prior[index]?.revenue ?? null,
  }));
}

function toWeekly(rows: TrendRow[]): TrendRow[] {
  const weeks = new Map<string, { value: number; prior: number[]; date: string }>();
  for (const row of rows) {
    const monday = new Date(`${row.date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const week = weeks.get(key) ?? { value: 0, prior: [], date: key };
    week.value += row.value;
    if (row.prior !== null) week.prior.push(row.prior);
    weeks.set(key, week);
  }
  return [...weeks].map(([key, week]) => ({
    date: key, label: formatDate(key, "MMM d"),
    value: week.value, prior: week.prior.length ? week.prior.reduce((sum, value) => sum + value, 0) : null,
  }));
}

/** Room revenue over the period with the prior-period line for comparison. */
export function RevenueCard({ title, caption, currency, current, prior, className }: {
  title: string;
  caption: string;
  currency: string;
  current: OverviewSeriesPoint[];
  prior: OverviewSeriesPoint[];
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [weekly, setWeekly] = useState(false);
  const rows = weekly ? toWeekly(toRows(current, prior)) : toRows(current, prior);
  const peak = rows.reduce((best, row, index) => (row.value > (rows[best]?.value ?? -1) ? index : best), 0);

  return <PenCard className={className}>
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="space-y-1">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Legend />
        <Granularity weekly={weekly} onChange={setWeekly} disabled={current.length < DAY_COUNT} />
      </div>
    </header>
    <figure aria-label={`${title} line chart by date. Exact values are available in the data table below.`} className="h-[196px] w-full md:h-[216px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={rows} accessibilityLayer={false} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0485F72E" />
              <stop offset="100%" stopColor="#0485F700" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            tickLine={false} axisLine={false} tickMargin={8} minTickGap={36} />
          <YAxis width={40} axisLine={false} tickLine={false} tickCount={4} allowDecimals={false}
            domain={[0, (max: number) => Math.ceil(max / 5000) * 5000 || 5000]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            tickFormatter={(value: number) => compactNumber(value)} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            labelFormatter={(label, payload) => {
              const iso = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
              return typeof iso === "string" ? formatDate(iso, "EEE, MMM d, yyyy") : String(label ?? "");
            }}
            formatter={(value, name) => [moneyAmount(Number(value), currency), name === "prior" ? "Prior period" : "Current period"]} />
          <Area type="monotone" dataKey="prior" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4"
            fill="transparent" connectNulls isAnimationActive={false} dot={false} activeDot={false} />
          <Area type="monotone" dataKey="value" stroke="var(--pen-accent)" strokeWidth={2} fill={`url(#${gradientId})`}
            connectNulls isAnimationActive={false} dot={false}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
          {rows[peak] && <ReferenceDot x={rows[peak].label} y={rows[peak].value} r={3.5}
            fill="var(--pen-accent)" stroke="var(--card)" strokeWidth={1.5} ifOverflow="extendDomain" />}
        </AreaChart>
      </ResponsiveContainer>
    </figure>
    <DataTable rows={rows} currency={currency} />
  </PenCard>;
}

function Legend() {
  return <div className="flex items-center gap-4" aria-hidden="true">
    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="h-[4px] w-4 rounded-full bg-[var(--pen-accent)]" /> Current period
    </span>
    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="h-[4px] w-4 rounded-full bg-[#94a3b8]" /> Prior period
    </span>
  </div>;
}

function Granularity({ weekly, onChange, disabled }: { weekly: boolean; onChange: (weekly: boolean) => void; disabled: boolean }) {
  return <div className="flex gap-1 rounded-lg bg-secondary p-[4px]" role="group" aria-label="Chart granularity">
    {([false, true] as const).map((isWeekly) => <button key={String(isWeekly)} type="button"
      aria-pressed={weekly === isWeekly} disabled={disabled && isWeekly}
      onClick={() => onChange(isWeekly)}
      className={cn("rounded-md px-3 py-1 text-xs transition-colors disabled:opacity-40",
        weekly === isWeekly ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground")}>
      {isWeekly ? "Weekly" : "Daily"}
    </button>)}
  </div>;
}

function DataTable({ rows, currency }: { rows: ReturnType<typeof toRows>; currency: string }) {
  return <details className="border-t border-border/50">
    <summary className="flex min-h-9 cursor-pointer list-none items-center text-[11px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
      View data table
    </summary>
    <div className="max-h-64 overflow-y-auto" role="region" aria-label="Revenue data table" tabIndex={0}>
      <table className="w-full border-collapse text-[13px]">
        <thead><tr>
          <th scope="col" className="border-b border-border/60 py-2 pr-4 text-left text-xs font-medium text-muted-foreground">Date</th>
          <th scope="col" className="border-b border-border/60 px-4 py-2 text-right text-xs font-medium text-muted-foreground">Current period</th>
          <th scope="col" className="border-b border-border/60 py-2 pl-4 text-right text-xs font-medium text-muted-foreground">Prior period</th>
        </tr></thead>
        <tbody className="[&>tr:not(:last-child)>*]:border-b [&>tr:not(:last-child)>*]:border-border/40">
          {rows.map((row) => <tr key={row.date}>
            <th scope="row" className="py-2 pr-4 text-left font-medium">{formatDate(row.date, "MMM d, yyyy")}</th>
            <td className="px-4 py-2 text-right tabular-nums">{moneyAmount(row.value, currency)}</td>
            <td className="py-2 pl-4 text-right tabular-nums text-muted-foreground">{row.prior === null ? "—" : moneyAmount(row.prior, currency)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </details>;
}
