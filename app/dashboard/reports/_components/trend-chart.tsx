"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useId } from "react";
import { formatDate } from "@/lib/format";
import { EmptyState, TableShell, UnavailableState, tooltipStyle } from "./shells";
import { INVENTORY_EXPLANATION } from "./report-utils";

export interface TrendPoint { date: string; value: number | null }

export function TrendChart({ data, title, units, valueFormatter, percent = false, emptyText }: {
  data: TrendPoint[];
  title: string;
  units: string;
  valueFormatter: (value: number) => string;
  percent?: boolean;
  emptyText: string;
}) {
  const id = useId();
  const known = data.filter((point) => point.value !== null);
  const allZero = known.length > 0 && known.every((point) => point.value === 0);
  const hasMissing = data.some((point) => point.value === null);
  const numericTicks = (value: number) => `${value.toLocaleString("en", { maximumFractionDigits: 2 })}${percent ? "%" : ""}`;
  const axisWidth = Math.max(48, ...known.map((point) => numericTicks(point.value ?? 0).length * 7 + 12));

  return <div className="reports-trend">
    <p className="reports-chart-units" id={id}>{units} · by property date</p>
    {data.length === 0 || (allZero && !hasMissing) ? <EmptyState text={emptyText} /> : known.length === 0 ? <UnavailableState text={INVENTORY_EXPLANATION} /> : <>
      <figure aria-label={`${title}. Line chart by date. Exact values are available in the data table below.`} aria-describedby={id}>
        <div className="reports-chart" aria-hidden="true">
          <ResponsiveContainer width="100%" height={288} minWidth={0}>
            <AreaChart data={data} accessibilityLayer={false} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
              <XAxis dataKey="date" tickFormatter={(value) => formatDate(value, "MMM d")} minTickGap={32}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis orientation="right" domain={percent ? [0, (max: number) => Math.max(100, max)] : [(min: number) => Math.min(0, min), "auto"]}
                width={axisWidth} tickFormatter={numericTicks} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(date) => formatDate(String(date), "MMM d, yyyy")}
                formatter={(value) => [valueFormatter(Number(value)), units]} />
              <Area type="linear" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} fill="var(--primary)" fillOpacity={0.07}
                connectNulls={false} isAnimationActive={false} dot={data.length === 1 ? { r: 4 } : false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </figure>
      {hasMissing && <p className="reports-note">Gaps indicate unavailable historical inventory, not zero occupancy.</p>}
    </>}
    {data.length > 0 && <details className="reports-data-disclosure">
      <summary>View {title.toLowerCase()} data table</summary>
      <TableShell head={["Property date", units]} caption={`${title} — exact values`}>
        {data.map((point) => <tr key={point.date}><th scope="row">{formatDate(point.date, "MMM d, yyyy")}</th>
          <td>{point.value === null ? "Unavailable" : valueFormatter(point.value)}</td></tr>)}
      </TableShell>
    </details>}
  </div>;
}
