"use client";

import * as React from "react";
import { format, subDays, parseISO } from "date-fns";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getOccupancyReport,
  getRevenueReport,
  getSourcesReport,
  type OccupancyReportData,
  type RevenueReportData,
  type SourcesReportData,
} from "./actions";

// ── Helpers ──────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  bookings_com: "Booking.com",
  manual: "Manual",
  phone: "Phone",
  walk_in: "Walk-in",
};

const CHART_COLORS = ["#2563EB", "#7C3AED", "#0D9488", "#D97706", "#DC2626"];

// ── Date Range Picker ─────────────────────────────────────────────

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((p) => {
        const start = format(subDays(new Date(), p.days - 1), "yyyy-MM-dd");
        const end = format(new Date(), "yyyy-MM-dd");
        const active = startDate === start && endDate === end;
        return (
          <button
            key={p.days}
            onClick={() => onChange(start, end)}
            className={cn(
              "h-7 px-3 rounded-lg text-xs font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        );
      })}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="h-7 rounded-lg border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
        />
        <span>→</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="h-7 rounded-lg border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
        />
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Occupancy Tab ────────────────────────────────────────────────

function OccupancyTab({
  data,
  loading,
}: {
  data: OccupancyReportData | null;
  loading: boolean;
}) {
  if (loading || !data) {
    return <TabSkeleton />;
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Avg Occupancy" value={`${data.avgOccupancy}%`} />
        <KpiCard label="Nights Sold" value={data.totalNightsSold.toLocaleString()} />
        <KpiCard
          label="Busiest Room Type"
          value={
            data.byRoomType.sort((a, b) => b.nights - a.nights)[0]?.name ?? "—"
          }
        />
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Daily Occupancy Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.dailyOccupancy} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => format(parseISO(v), "MMM d")}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
              />
              <Tooltip
                formatter={(v) => [`${v ?? 0}%`, "Occupancy"]}
                labelFormatter={(l) => format(parseISO(l), "MMM d, yyyy")}
                contentStyle={{
                  fontSize: 12,
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  background: "hsl(var(--background))",
                }}
              />
              <Line
                type="monotone"
                dataKey="occupancy"
                stroke="#2563EB"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">By Room Type</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Room Type</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Rooms</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Nights Sold</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Avg Occ%</th>
              </tr>
            </thead>
            <tbody>
              {data.byRoomType.map((row) => (
                <tr key={row.name} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{row.name}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{row.totalRooms}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.nights}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.avgOccupancy}%</td>
                </tr>
              ))}
              {data.byRoomType.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs">No data for this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Revenue Tab ───────────────────────────────────────────────────

function RevenueTab({
  data,
  loading,
  currency,
  onExport,
}: {
  data: RevenueReportData | null;
  loading: boolean;
  currency: string;
  onExport: () => void;
}) {
  if (loading || !data) return <TabSkeleton />;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
          <KpiCard label="Total Revenue" value={fmt(data.totalRevenue, currency)} />
          <KpiCard label="Avg Rate / Night" value={fmt(data.avgNightlyRate, currency)} />
          <KpiCard
            label="Outstanding Balance"
            value={fmt(data.outstandingBalance, currency)}
            sub="across unpaid bookings"
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={onExport}>
          <Download className="size-3.5 mr-1.5" />
          CSV
        </Button>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Weekly Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.weeklyRevenue} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => fmt(v, currency)}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [fmt(Number(v ?? 0), currency), "Revenue"]}
                contentStyle={{
                  fontSize: 12,
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  background: "hsl(var(--background))",
                }}
              />
              <Bar dataKey="revenue" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Revenue by Source</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Source</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Bookings</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.bySource.map((row) => (
                <tr key={row.source} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{SOURCE_LABELS[row.source] ?? row.source}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{row.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(row.revenue, currency)}</td>
                </tr>
              ))}
              {data.bySource.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-xs">No data for this period</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sources Tab ───────────────────────────────────────────────────

function SourcesTab({
  data,
  loading,
  currency,
  onExport,
}: {
  data: SourcesReportData | null;
  loading: boolean;
  currency: string;
  onExport: () => void;
}) {
  if (loading || !data) return <TabSkeleton />;
  const directPct = data.bySource.find((s) => s.source === "direct")?.pct ?? 0;
  const otaPct = data.bySource.find((s) => s.source === "bookings_com")?.pct ?? 0;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-3 gap-4 flex-1">
          <KpiCard label="Total Bookings" value={data.totalBookings.toLocaleString()} />
          <KpiCard label="Direct %" value={`${directPct}%`} />
          <KpiCard label="OTA %" value={`${otaPct}%`} />
        </div>
        <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={onExport}>
          <Download className="size-3.5 mr-1.5" />
          CSV
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Channel Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.bySource}
                  dataKey="count"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {data.bySource.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [v ?? 0, name ? (SOURCE_LABELS[name] ?? name) : ""]}
                  contentStyle={{
                    fontSize: 12,
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    background: "hsl(var(--background))",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Booking Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Source</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Count</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.bySource.map((row, i) => (
                  <tr key={row.source} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        {SOURCE_LABELS[row.source] ?? row.source}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(row.revenue, currency)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.pct}%</td>
                  </tr>
                ))}
                {data.bySource.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs">No data for this period</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export interface ReportsClientProps {
  currency: string;
  initialStartDate: string;
  initialEndDate: string;
}

export function ReportsClient({ currency, initialStartDate, initialEndDate }: ReportsClientProps) {
  const [startDate, setStartDate] = React.useState(initialStartDate);
  const [endDate, setEndDate] = React.useState(initialEndDate);
  const [activeTab, setActiveTab] = React.useState("occupancy");

  const [occupancyData, setOccupancyData] = React.useState<OccupancyReportData | null>(null);
  const [revenueData, setRevenueData] = React.useState<RevenueReportData | null>(null);
  const [sourcesData, setSourcesData] = React.useState<SourcesReportData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchAll = React.useCallback(async (start: string, end: string) => {
    setLoading(true);
    const [occ, rev, src] = await Promise.all([
      getOccupancyReport(start, end),
      getRevenueReport(start, end),
      getSourcesReport(start, end),
    ]);
    setOccupancyData(occ);
    setRevenueData(rev);
    setSourcesData(src);
    setLoading(false);
  }, []);

  React.useEffect(() => { fetchAll(startDate, endDate); }, [startDate, endDate, fetchAll]);

  function handleDateChange(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
  }

  function exportOccupancyCsv() {
    if (!occupancyData) return;
    exportCsv(occupancyData.dailyOccupancy, `occupancy-${startDate}-${endDate}.csv`);
  }

  function exportRevenueCsv() {
    if (!revenueData) return;
    exportCsv(
      revenueData.bySource.map((r) => ({ source: SOURCE_LABELS[r.source] ?? r.source, bookings: r.count, revenue: r.revenue })),
      `revenue-${startDate}-${endDate}.csv`
    );
  }

  function exportSourcesCsv() {
    if (!sourcesData) return;
    exportCsv(
      sourcesData.bySource.map((r) => ({ source: SOURCE_LABELS[r.source] ?? r.source, count: r.count, revenue: r.revenue, share_pct: r.pct })),
      `sources-${startDate}-${endDate}.csv`
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Hotel performance analytics</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList className="h-9 rounded-xl">
            <TabsTrigger value="occupancy" className="rounded-lg text-xs">Occupancy</TabsTrigger>
            <TabsTrigger value="revenue" className="rounded-lg text-xs">Revenue</TabsTrigger>
            <TabsTrigger value="sources" className="rounded-lg text-xs">Booking Sources</TabsTrigger>
          </TabsList>
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateChange} />
        </div>

        <div className="mt-6">
          <TabsContent value="occupancy">
            <div className="flex justify-end mb-4">
              <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={exportOccupancyCsv} disabled={!occupancyData}>
                <Download className="size-3.5 mr-1.5" />CSV
              </Button>
            </div>
            <OccupancyTab data={occupancyData} loading={loading} />
          </TabsContent>
          <TabsContent value="revenue">
            <RevenueTab data={revenueData} loading={loading} currency={currency} onExport={exportRevenueCsv} />
          </TabsContent>
          <TabsContent value="sources">
            <SourcesTab data={sourcesData} loading={loading} currency={currency} onExport={exportSourcesCsv} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
