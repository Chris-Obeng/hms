"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useId } from "react";
import { formatDate } from "@/lib/format";
import { EmptyState, TableShell, UnavailableState, tooltipStyle } from "./shells";
import { INVENTORY_EXPLANATION, reportMoneyWhole, splitMoney } from "./report-utils";

export interface TrendPoint { date: string; value: number | null; secondary?: number | null }

/** One area per figure, one hue; a dashed line carries the second metric instead of a second axis. */
export function TrendChart({ data, title, currency, valueFormatter, percent = false, emptyText, secondaryKey, secondaryFormatter, secondaryLabel }: {
  data: TrendPoint[];
  title: string;
  currency: string;
  valueFormatter: (value: number) => string;
  percent?: boolean;
  emptyText: string;
  secondaryKey?: boolean;
  secondaryFormatter?: (value: number) => string;
  secondaryLabel?: string;
}) {
  const id = useId();
  const known = data.filter((point) => point.value !== null);
  const allZero = known.length > 0 && known.every((point) => point.value === 0);
  const hasMissing = data.some((point) => point.value === null);
  const singlePoint = known.length === 1;
  const moneyTick = (value: number) => splitMoney(reportMoneyWhole(value, currency), currency).amount;
  const tick = (value: number) => percent
    ? `${value.toLocaleString("en", { maximumFractionDigits: 0 })}%`
    : moneyTick(value);
  const axisWidth = percent ? 40 : Math.max(44, ...known.map((point) => moneyTick(point.value ?? 0).length * 7 + 14));

  return <div className="px-1 pb-3">
    <span id={id} className="sr-only">{percent ? "Share of available room nights by property date." : `Amounts in ${currency}, by property date.`}</span>
    {data.length === 0 || (allZero && !hasMissing) ? <EmptyState text={emptyText} /> : known.length === 0 ? <UnavailableState text={INVENTORY_EXPLANATION} /> : <>
      <figure aria-label={`${title}. Line chart by date. Exact values are available in the data table below.`} aria-describedby={id}>
        <div className="h-[200px] w-full md:h-[232px]" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data} accessibilityLayer={false} margin={{ top: 16, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} strokeDasharray="2 6" />
              <XAxis dataKey="date" tickFormatter={(value) => formatDate(value, "MMM d")} minTickGap={36}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }} tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis orientation="right" width={axisWidth} axisLine={false} tickLine={false}
                domain={percent ? [0, 100] : [0, (max: number) => Math.ceil(max / 1000) * 1000]}
                tickCount={4} allowDecimals={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }} tickFormatter={tick} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                labelFormatter={(date) => formatDate(String(date), "EEE, MMM d, yyyy")}
                formatter={(value, name) => [valueFormatter(Number(value)), name === "secondary" ? (secondaryLabel ?? "Secondary") : percent ? "Occupancy" : `Room revenue (${currency})`]} />
              {secondaryKey && <Area type="linear" dataKey="secondary" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 4"
                fill="transparent" connectNulls={false} isAnimationActive={false} dot={false} activeDot={{ r: 3.5, stroke: "var(--card)", strokeWidth: 2 }} />}
              <Area type="linear" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.1}
                connectNulls={false} isAnimationActive={false} dot={singlePoint ? { r: 3.5, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 } : false}
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </figure>
      {hasMissing && <p className="px-3 pt-2 text-caption text-muted-foreground">Gaps mark dates where historical inventory is unavailable, not zero occupancy.</p>}
      <details className="group border-t border-border/50">
        <summary className="flex min-h-10 cursor-pointer list-none items-center px-3 pt-2 text-caption font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground [&::-webkit-details-marker]:hidden">
          View data table
        </summary>
        <TableShell head={secondaryKey ? ["Date", percent ? "Occupancy" : `Revenue (${currency})`, secondaryLabel ?? ""] : ["Date", percent ? "Occupancy" : `Revenue (${currency})`]} caption={`${title} — exact values`}>
          {data.map((point) => <tr key={point.date}>
            <th scope="row" className="px-4 py-2.5 text-left font-medium">{formatDate(point.date, "MMM d, yyyy")}</th>
            <td className="px-4 py-2.5 text-right tabular-nums">{point.value === null ? <span className="text-muted-foreground">—</span> : valueFormatter(point.value)}</td>
            {secondaryKey && <td className="px-4 py-2.5 text-right tabular-nums">{point.secondary == null ? <span className="text-muted-foreground">—</span> : (secondaryFormatter ?? valueFormatter)(point.secondary)}</td>}
          </tr>)}
        </TableShell>
      </details>
    </>}
  </div>;
}
