"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, Disclosure, Table } from "@heroui/react";
import { BI_AXIS_TICK, BI_CARD, BI_CARD_DESCRIPTION, BI_CARD_HEADER, BI_CARD_TITLE } from "./bi-styles";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { compactNumber, moneyAmount } from "./bi-format";
import { tooltipStyle } from "../shells";
import type { OverviewSeriesPoint } from "../../actions";

/** Longer ranges read better as weekly totals than as a comb of daily points. */
const WEEKLY_AFTER_DAYS = 45;

interface TrendRow { date: string; label: string; value: number; prior: number | null }

/** Zips the current and prior daily series onto one axis, by point index. */
function toRows(current: OverviewSeriesPoint[], prior: OverviewSeriesPoint[]): TrendRow[] {
  return current.map((point, index) => ({
    date: point.date, label: point.label,
    value: point.revenue, prior: prior[index]?.revenue ?? null,
  }));
}

function toWeekly(rows: TrendRow[]): TrendRow[] {
  const weeks = new Map<string, { value: number; prior: number[] }>();
  for (const row of rows) {
    const monday = new Date(`${row.date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const week = weeks.get(key) ?? { value: 0, prior: [] };
    week.value += row.value;
    if (row.prior !== null) week.prior.push(row.prior);
    weeks.set(key, week);
  }
  return [...weeks].map(([key, week]) => ({
    date: key, label: formatDate(key, "MMM d"),
    value: week.value, prior: week.prior.length ? week.prior.reduce((sum, value) => sum + value, 0) : null,
  }));
}

/** Room revenue over the period, with the prior period as a quiet dashed line. */
export function RevenueCard({ currency, current, prior, className }: {
  currency: string;
  current: OverviewSeriesPoint[];
  prior: OverviewSeriesPoint[];
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const weekly = current.length > WEEKLY_AFTER_DAYS;
  const daily = toRows(current, prior);
  const rows = weekly ? toWeekly(daily) : daily;

  return <Card render={(props) => <section {...props} />} className={cn(BI_CARD, className)}>
    <div className={BI_CARD_HEADER}>
      <div className="min-w-0">
        <h2 className={BI_CARD_TITLE}>Room revenue</h2>
        <p className={BI_CARD_DESCRIPTION}>{weekly ? "Weekly" : "Daily"} room charges, excluding tax</p>
      </div>
      <Legend />
    </div>
    <figure aria-label={`Room revenue ${weekly ? "by week" : "by day"}. Exact values are in the data table below.`} className="h-56 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={rows} accessibilityLayer={false} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis dataKey="label" tick={BI_AXIS_TICK} tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} />
          <YAxis width={40} axisLine={false} tickLine={false} tickCount={4} allowDecimals={false}
            domain={[0, (max: number) => Math.ceil(max / 5000) * 5000 || 5000]}
            tick={BI_AXIS_TICK} tickFormatter={(value: number) => compactNumber(value)} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            labelFormatter={(label, payload) => {
              const iso = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
              if (typeof iso !== "string") return String(label ?? "");
              return weekly ? `Week of ${formatDate(iso, "MMM d, yyyy")}` : formatDate(iso, "EEE, MMM d, yyyy");
            }}
            formatter={(value, name) => [`${moneyAmount(Number(value), currency, { maximumFractionDigits: 0 })} ${currency}`, name === "prior" ? "Prior period" : "This period"]} />
          <Area type="monotone" dataKey="prior" stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4"
            fill="transparent" connectNulls isAnimationActive={false} dot={false} activeDot={false} />
          <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill={`url(#${gradientId})`}
            connectNulls isAnimationActive={false} dot={false}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
    <DataTable rows={rows} currency={currency} weekly={weekly} />
  </Card>;
}

function Legend() {
  // The keys mirror the strokes: solid for this period, dashed for the prior one.
  return <div className="flex items-center gap-4 text-xs leading-4 text-muted-foreground" aria-hidden="true">
    <span className="flex items-center gap-2"><span className="h-1 w-4 rounded-full bg-primary" /> This period</span>
    <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-muted-foreground/50" /> Prior period</span>
  </div>;
}

function DataTable({ rows, currency, weekly }: { rows: TrendRow[]; currency: string; weekly: boolean }) {
  return <Disclosure className="-mb-2">
    <Disclosure.Heading>
      <Button slot="trigger" variant="ghost" size="sm" className="-ml-3 gap-2 text-xs font-medium text-muted-foreground">
        View as table
        <Disclosure.Indicator />
      </Button>
    </Disclosure.Heading>
    <Disclosure.Content>
      <Disclosure.Body className="px-0 pb-2 pt-2">
        <Table variant="secondary">
          <Table.ScrollContainer className="max-h-64 overflow-y-auto">
            <Table.Content aria-label={`Room revenue by ${weekly ? "week" : "date"}, in ${currency}`} className="tabular-nums">
              <Table.Header>
                <Table.Column isRowHeader>{weekly ? "Week of" : "Date"}</Table.Column>
                <Table.Column className="text-right">This period</Table.Column>
                <Table.Column className="text-right">Prior period</Table.Column>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => <Table.Row key={row.date} id={row.date}>
                  <Table.Cell className="font-medium">{formatDate(row.date, "MMM d, yyyy")}</Table.Cell>
                  <Table.Cell className="text-right">{moneyAmount(row.value, currency)}</Table.Cell>
                  <Table.Cell className="text-right text-muted-foreground">{row.prior === null ? "—" : moneyAmount(row.prior, currency)}</Table.Cell>
                </Table.Row>)}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </Disclosure.Body>
    </Disclosure.Content>
  </Disclosure>;
}
