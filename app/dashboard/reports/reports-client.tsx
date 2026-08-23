"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RotateCw } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { formatCurrencyCompact, formatDate } from "@/lib/format";
import { SOURCE_LABELS } from "@/lib/booking-status";
import { Button, Card, Tabs } from "@heroui/react";
import {
  getOccupancyReport,
  getRevenueReport,
  getSourcesReport,
  type OccupancyReportData,
  type RevenueReportData,
  type SourcesReportData,
} from "./actions";

// ── Chart theming ──────────────────────────────────────────────────
// Reads the app's CSS custom properties so charts follow light/dark
// automatically. Gold is the single data accent; neutrals separate series.

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = React.useState({
    gold: "#d4af37",
    fg: "#1c1c1c",
    mutedFg: "#8e8e8e",
    border: "rgba(0,0,0,0.08)",
    surface: "#ffffff",
    series: ["#d4af37", "#a3a3a3", "#6b6b6b", "#484848", "#2e2e2e"],
  });

  React.useEffect(() => {
    // Read computed tokens on the next frame — avoids synchronous setState
    // inside the effect and lets theme transitions settle first.
    const frame = requestAnimationFrame(() => {
      const s = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
      setColors({
        gold: v("--color-gold", "#d4af37"),
        fg: v("--foreground", "#1c1c1c"),
        mutedFg: v("--muted-foreground", "#8e8e8e"),
        border: v("--border", "rgba(0,0,0,0.08)"),
        surface: v("--popover", v("--card", "#ffffff")),
        series: [
          v("--color-gold", "#d4af37"),
          v("--chart-2", "#a3a3a3"),
          v("--chart-3", "#6b6b6b"),
          v("--chart-4", "#484848"),
          v("--chart-5", "#2e2e2e"),
        ],
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return colors;
}

// ── Date range picker ──────────────────────────────────────────────

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function DateRangePicker({
  startDate,
  endDate,
  today,
  onChange,
}: {
  startDate: string;
  endDate: string;
  today: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Quick ranges">
        {PRESETS.map((p) => {
          const start = format(subDays(parseISO(today + "T00:00:00"), p.days - 1), "yyyy-MM-dd");
          const active = startDate === start && endDate === today;
          return (
            <button
              key={p.days}
              type="button"
              onClick={() => onChange(start, today)}
              aria-pressed={active}
              className={cn(
                "h-9 px-3 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={startDate}
          max={endDate}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            // Keep the pair valid — never let start pass end
            onChange(v, v > endDate ? v : endDate);
          }}
          className="h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          aria-label="Start date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={endDate}
          min={startDate}
          max={today}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onChange(v < startDate ? v : startDate, v);
          }}
          className="h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          aria-label="End date"
        />
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card-default p-4 min-w-0">
      <p className="text-label text-muted-foreground truncate">{label}</p>
      <p className="text-kpi text-foreground mt-1 truncate">{value}</p>
      {sub && <p className="text-caption text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function SectionCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="card-default">
      <div className="flex items-baseline justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <h2 className="text-section text-foreground">{title}</h2>
        {caption && (
          <p className="text-caption text-muted-foreground shrink-0 tabular-nums">{caption}</p>
        )}
      </div>
      <div className="px-4 sm:px-5 pb-4 sm:pb-5">{children}</div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-body text-muted-foreground">{text}</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-center px-6">
      <p className="text-body text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onPress={onRetry} className="gap-1.5">
        <RotateCw className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}

function TableShell({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="-mx-4 sm:-mx-5 overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="border-b border-border/60">
            {head.map((h, i) => (
              <th
                key={h}
                className={cn(
                  "px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap",
                  i === 0 ? "text-left" : "text-right"
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function TabSkeleton({ variant }: { variant: "charts" | "split" }) {
  return (
    <div className="space-y-5 animate-pulse" aria-hidden>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[84px] rounded-xl bg-muted/40" />
        ))}
      </div>
      {variant === "split" ? (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="h-[300px] rounded-xl bg-muted/40" />
          <div className="h-[300px] rounded-xl bg-muted/40" />
        </div>
      ) : (
        <>
          <div className="h-[260px] rounded-xl bg-muted/40" />
          <div className="h-[200px] rounded-xl bg-muted/40" />
        </>
      )}
    </div>
  );
}

const tooltipStyle = (surface: string, border: string): React.CSSProperties => ({
  fontSize: 12,
  lineHeight: 1.5,
  background: surface,
  border: `1px solid ${border}`,
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
  padding: "8px 10px",
});

// ── Occupancy tab ──────────────────────────────────────────────────

function OccupancyTab({
  data,
  colors,
}: {
  data: OccupancyReportData;
  colors: ReturnType<typeof useChartColors>;
}) {
  const busiest = data.byRoomType[0]?.name ?? "—";
  const hasData = data.dailyOccupancy.some((d) => d.occupied > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <KpiCard label="Avg occupancy" value={`${data.avgOccupancy}%`} />
        <KpiCard label="Nights sold" value={data.totalNightsSold.toLocaleString()} />
        <KpiCard label="Busiest room type" value={busiest} />
      </div>

      <SectionCard title="Daily occupancy rate">
        {!hasData ? (
          <EmptyState text="No occupied nights in this period." />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.dailyOccupancy} margin={{ left: -14, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="occFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.gold} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={colors.gold} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => format(parseISO(v), "MMM d")}
                tick={{ fontSize: 11, fill: colors.mutedFg }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: colors.mutedFg }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                formatter={(v) => [`${Number(v ?? 0)}%`, "Occupancy"]}
                labelFormatter={(l) => formatDate(String(l))}
                contentStyle={tooltipStyle(colors.surface, colors.border)}
                cursor={{ stroke: colors.mutedFg, strokeOpacity: 0.25 }}
              />
              <Area
                type="monotone"
                dataKey="occupancy"
                stroke={colors.gold}
                strokeWidth={2}
                fill="url(#occFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <SectionCard title="By room type">
        {data.byRoomType.length === 0 ? (
          <EmptyState text="No room types configured yet." />
        ) : (
          <TableShell head={["Room type", "Rooms", "Nights sold", "Avg occ"]}>
            {data.byRoomType.map((row) => (
              <tr key={row.name} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">{row.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {row.totalRooms}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.nights.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span className="inline-flex items-center gap-2 justify-end">
                    <span
                      className="hidden sm:block h-1.5 w-16 rounded-full bg-muted overflow-hidden"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, row.avgOccupancy)}%`,
                          background: colors.gold,
                        }}
                      />
                    </span>
                    {row.avgOccupancy}%
                  </span>
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </SectionCard>
    </div>
  );
}

// ── Revenue tab ────────────────────────────────────────────────────

function RevenueTab({
  data,
  currency,
  colors,
}: {
  data: RevenueReportData;
  currency: string;
  colors: ReturnType<typeof useChartColors>;
}) {
  const hasTrend = data.trend.some((t) => t.revenue > 0);
  const maxSourceRevenue = Math.max(1, ...data.bySource.map((s) => s.revenue));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <KpiCard
          label="Total revenue"
          value={formatCurrencyCompact(data.totalRevenue, currency)}
          sub={`${data.granularity === "day" ? "Daily" : "Weekly"} trend below`}
        />
        <KpiCard
          label="Avg rate / night"
          value={formatCurrencyCompact(data.avgNightlyRate, currency)}
        />
        <KpiCard
          label="Outstanding balance"
          value={formatCurrencyCompact(data.outstandingBalance, currency)}
          sub="Across open bookings"
        />
      </div>

      <SectionCard
        title={data.granularity === "day" ? "Revenue by day" : "Revenue by week"}
        caption={`Check-ins ${formatDate(data.trend[0]?.key)} – ${formatDate(
          data.trend[data.trend.length - 1]?.key
        )}`}
      >
        {!hasTrend ? (
          <EmptyState text="No revenue recorded in this period." />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.trend} margin={{ left: -8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: colors.mutedFg }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v: number) => formatCurrencyCompact(v, currency)}
                tick={{ fontSize: 11, fill: colors.mutedFg }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                formatter={(v) => [formatCurrencyCompact(Number(v ?? 0), currency), "Revenue"]}
                labelFormatter={(l) => String(l)}
                contentStyle={tooltipStyle(colors.surface, colors.border)}
                cursor={{ fill: colors.mutedFg, opacity: 0.06 }}
              />
              <Bar
                dataKey="revenue"
                fill={colors.gold}
                radius={[5, 5, 0, 0]}
                maxBarSize={38}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <SectionCard title="Revenue by source">
        {data.bySource.length === 0 ? (
          <EmptyState text="No bookings in this period." />
        ) : (
          <TableShell head={["Source", "Bookings", "Revenue", ""]}>
            {data.bySource.map((row) => (
              <tr key={row.source} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                  {SOURCE_LABELS[row.source] ?? row.source}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {row.count}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium whitespace-nowrap">
                  {formatCurrencyCompact(row.revenue, currency)}
                </td>
                <td className="hidden sm:table-cell px-4 py-2.5" aria-hidden>
                  <span className="block h-1.5 w-full max-w-24 ml-auto rounded-full bg-muted overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(4, (row.revenue / maxSourceRevenue) * 100)}%`,
                        background: colors.mutedFg,
                      }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </SectionCard>
    </div>
  );
}

// ── Sources tab ────────────────────────────────────────────────────

function SourcesTab({
  data,
  currency,
  colors,
}: {
  data: SourcesReportData;
  currency: string;
  colors: ReturnType<typeof useChartColors>;
}) {
  const directPct = data.bySource.find((s) => s.source === "direct")?.pct ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <KpiCard label="Total bookings" value={data.totalBookings.toLocaleString()} />
        <KpiCard label="Direct share" value={`${directPct}%`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <SectionCard title="Channel distribution">
          {data.bySource.length === 0 ? (
            <EmptyState text="No bookings in this period." />
          ) : (
            <div className="relative mx-auto max-w-[280px]">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={data.bySource}
                    dataKey="count"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {data.bySource.map((entry, i) => (
                      <Cell key={entry.source} fill={colors.series[i % colors.series.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [`${v ?? 0} bookings`, name ? (SOURCE_LABELS[String(name)] ?? String(name)) : ""]}
                    contentStyle={tooltipStyle(colors.surface, colors.border)}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center total */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                aria-hidden
              >
                <span className="text-kpi-hero text-foreground leading-none">
                  {data.totalBookings.toLocaleString()}
                </span>
                <span className="text-caption text-muted-foreground mt-1">bookings</span>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Breakdown">
          {data.bySource.length === 0 ? (
            <EmptyState text="No bookings in this period." />
          ) : (
            <ul className="divide-y divide-border/40">
              {data.bySource.map((row, i) => (
                <li key={row.source} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ background: colors.series[i % colors.series.length] }}
                        aria-hidden
                      />
                      <span className="text-sm font-medium truncate">
                        {SOURCE_LABELS[row.source] ?? row.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-sm tabular-nums">
                      <span className="font-semibold whitespace-nowrap">
                        {formatCurrencyCompact(row.revenue, currency)}
                      </span>
                      <span className="text-muted-foreground w-10 text-right">{row.pct}%</span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 w-full rounded-full bg-muted/70 overflow-hidden" aria-hidden>
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${row.pct}%`,
                        background: colors.series[i % colors.series.length],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export interface ReportsClientProps {
  currency: string;
  initialStartDate: string;
  initialEndDate: string;
}

type ReportTab = "occupancy" | "revenue" | "sources";

export function ReportsClient({ currency, initialStartDate, initialEndDate }: ReportsClientProps) {
  const [startDate, setStartDate] = React.useState(initialStartDate);
  const [endDate, setEndDate] = React.useState(initialEndDate);
  const [activeTab, setActiveTab] = React.useState<ReportTab>("occupancy");
  const colors = useChartColors();
  const today = initialEndDate;

  // One query per report — cached per tab+range, fetched only when its tab is
  // active (important on metered mobile connections).
  const occQ = useQuery({
    queryKey: ["reports", "occupancy", startDate, endDate],
    queryFn: () => getOccupancyReport(startDate, endDate),
    enabled: activeTab === "occupancy",
  });
  const revQ = useQuery({
    queryKey: ["reports", "revenue", startDate, endDate],
    queryFn: () => getRevenueReport(startDate, endDate),
    enabled: activeTab === "revenue",
  });
  const srcQ = useQuery({
    queryKey: ["reports", "sources", startDate, endDate],
    queryFn: () => getSourcesReport(startDate, endDate),
    enabled: activeTab === "sources",
  });

  function periodLabel(): string {
    for (const p of PRESETS) {
      const start = format(subDays(parseISO(today + "T00:00:00"), p.days - 1), "yyyy-MM-dd");
      if (startDate === start && endDate === today) return `Last ${p.days} days`;
    }
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title text-foreground">Reports</h1>
        <p className="text-caption text-muted-foreground tabular-nums">{periodLabel()}</p>
      </div>

      <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as ReportTab)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Report sections" className="w-full sm:w-fit">
            <Tabs.Tab id="occupancy" className="flex-1 sm:flex-initial text-xs sm:text-sm">
              Occupancy
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="revenue" className="flex-1 sm:flex-initial text-xs sm:text-sm">
              Revenue
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="sources" className="flex-1 sm:flex-initial text-xs sm:text-sm">
              Booking sources
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <div className="mt-4">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            today={today}
            onChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
        </div>

        <Tabs.Panel id="occupancy" className="mt-5">
          {occQ.isPending ? (
            <TabSkeleton variant="charts" />
          ) : occQ.isError ? (
            <ErrorState message="Could not load occupancy data." onRetry={() => occQ.refetch()} />
          ) : occQ.data ? (
            <OccupancyTab data={occQ.data} colors={colors} />
          ) : null}
        </Tabs.Panel>

        <Tabs.Panel id="revenue" className="mt-5">
          {revQ.isPending ? (
            <TabSkeleton variant="charts" />
          ) : revQ.isError ? (
            <ErrorState message="Could not load revenue data." onRetry={() => revQ.refetch()} />
          ) : revQ.data ? (
            <RevenueTab data={revQ.data} currency={currency} colors={colors} />
          ) : null}
        </Tabs.Panel>

        <Tabs.Panel id="sources" className="mt-5">
          {srcQ.isPending ? (
            <TabSkeleton variant="split" />
          ) : srcQ.isError ? (
            <ErrorState message="Could not load booking sources." onRetry={() => srcQ.refetch()} />
          ) : srcQ.data ? (
            <SourcesTab data={srcQ.data} currency={currency} colors={colors} />
          ) : null}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
