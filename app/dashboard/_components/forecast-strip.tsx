"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// ── Types ──────────────────────────────────────────────────────

export interface ForecastDay {
  date: string;
  iso: string;
  occupancyRate: number;
  adr: number;
  roomsSold: number;
  totalRooms: number;
  revpar: number;
}

interface ForecastStripProps {
  data: ForecastDay[];
  currency?: string;
  onDayClick?: (iso: string) => void;
}

// ── Custom Tooltip ─────────────────────────────────────────────

function ForecastTooltip({
  active,
  payload,
  label,
  currency,
}: any & { currency?: string }) {
  if (active && payload && payload.length) {
    const entry = payload[0].payload as ForecastDay;
    return (
      <div className="rounded-xl border bg-card px-3 py-2.5 shadow-lg backdrop-blur-sm text-xs space-y-1.5">
        <p className="font-medium text-foreground">{entry.date}</p>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Occupancy</span>
          <span className="font-semibold text-foreground tabular-nums">
            {entry.occupancyRate}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">ADR</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatCurrency(entry.adr, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Rooms Sold</span>
          <span className="font-semibold text-foreground tabular-nums">
            {entry.roomsSold}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">RevPAR</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatCurrency(entry.revpar, currency)}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

function formatCurrency(amount: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Main Component ─────────────────────────────────────────────

export function ForecastStrip({
  data,
  currency = "GHS",
  onDayClick,
}: ForecastStripProps) {
  const totalRooms = data.length > 0 ? data[0].totalRooms : 0;

  const barSize = Math.max(8, Math.min(20, 280 / Math.max(data.length, 1)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          14-Day Forecast
        </CardTitle>
        <CardDescription className="text-xs mt-0.5">
          Occupancy rate and revenue projections
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="h-[160px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 4, left: -12, bottom: 0 }}
                onClick={(e) => {
                  if (e?.activeLabel) {
                    const day = data.find((d) => d.date === e.activeLabel);
                    if (day) onDayClick?.(day.iso);
                  }
                }}
              >
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                  width={28}
                />
                <Tooltip content={<ForecastTooltip currency={currency} />} cursor={{ fill: "hsl(var(--muted)/0.2)" }} />
                <Bar
                  dataKey="occupancyRate"
                  radius={[3, 3, 0, 0]}
                  barSize={barSize}
                  cursor="pointer"
                >
                  {data.map((entry, index) => {
                    const rate = entry.occupancyRate;
                    let fill = "hsl(215, 100%, 60%)";
                    if (rate >= 70) fill = "hsl(160, 60%, 45%)";
                    else if (rate >= 40) fill = "hsl(215, 100%, 60%)";
                    else fill = "hsl(35, 90%, 55%)";
                    return <Cell key={index} fill={fill} opacity={0.75} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[160px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No forecast data available
            </p>
          </div>
        )}

        {/* Quick Stats */}
        {data.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/40">
            <QuickStat
              label="Avg Occupancy"
              value={`${Math.round(
                data.reduce((s, d) => s + d.occupancyRate, 0) / data.length
              )}%`}
            />
            <QuickStat
              label="Avg ADR"
              value={formatCurrency(
                Math.round(
                  data.reduce((s, d) => s + d.adr, 0) / data.length
                ),
                currency
              )}
            />
            <QuickStat
              label="Total Rooms"
              value={totalRooms.toString()}
            />
            <QuickStat
              label="RevPAR"
              value={formatCurrency(
                Math.round(
                  data.reduce((s, d) => s + d.revpar, 0) / data.length
                ),
                currency
              )}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-center">
      <p className="text-xs font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-[9px] text-muted-foreground/70 mt-0.5 uppercase tracking-wider">
        {label}
      </p>
    </div>
  );
}
