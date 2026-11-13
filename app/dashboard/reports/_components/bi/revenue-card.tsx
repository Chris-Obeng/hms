"use client";

import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, Disclosure, Table, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { BI_CARD, BI_CARD_DESCRIPTION, BI_CARD_HEADER, BI_CARD_TITLE } from "./bi-styles";
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

  return <Card render={(props) => <section {...props} />} className={cn(BI_CARD, className)}>
    <Card.Header className={BI_CARD_HEADER}>
      <div className="min-w-0">
        <Card.Title render={(props) => <h2 {...props} />} className={BI_CARD_TITLE}>{title}</Card.Title>
        <Card.Description className={BI_CARD_DESCRIPTION}>{caption}</Card.Description>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Legend />
        <ToggleButtonGroup aria-label="Chart granularity" size="sm" selectionMode="single" disallowEmptySelection
          selectedKeys={[weekly ? "weekly" : "daily"]}
          onSelectionChange={(keys) => setWeekly(keys.has("weekly"))}>
          <ToggleButton id="daily">Daily</ToggleButton>
          <ToggleButton id="weekly" isDisabled={current.length < DAY_COUNT}><ToggleButtonGroup.Separator />Weekly</ToggleButton>
        </ToggleButtonGroup>
      </div>
    </Card.Header>
    <Card.Content className="gap-2">
      <figure aria-label={`${title} line chart by date. Exact values are available in the data table below.`} className="h-48 w-full md:h-56">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={rows} accessibilityLayer={false} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
    </Card.Content>
  </Card>;
}

function Legend() {
  // The keys mirror the strokes: a solid line for this period, a dashed one for the prior period.
  return <div className="flex items-center gap-4 text-xs leading-4 text-muted-foreground" aria-hidden="true">
    <span className="flex items-center gap-2"><span className="h-1 w-4 rounded-full bg-[var(--pen-accent)]" /> Current period</span>
    <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-[#94a3b8]" /> Prior period</span>
  </div>;
}

function DataTable({ rows, currency }: { rows: TrendRow[]; currency: string }) {
  return <Disclosure className="border-t border-border/50 pt-2">
    <Disclosure.Heading>
      <Button slot="trigger" variant="ghost" size="sm" className="-ml-3 gap-2 text-xs font-medium text-muted-foreground">
        View data table
        <Disclosure.Indicator />
      </Button>
    </Disclosure.Heading>
    <Disclosure.Content>
      <Disclosure.Body className="px-0 pb-0 pt-2">
        <Table variant="secondary">
          <Table.ScrollContainer className="max-h-64 overflow-y-auto">
            <Table.Content aria-label="Revenue by date" className="tabular-nums">
              <Table.Header>
                <Table.Column isRowHeader>Date</Table.Column>
                <Table.Column className="text-right">Current period</Table.Column>
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
