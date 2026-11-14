"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Card, Skeleton } from "@heroui/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { formatCurrencySymbol, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getGuestsReport, getOccupancyReport, getReportsOverview,
  getRevenueReport, getRoomsSoldTonight, type GuestsData, type OccupancyData, type OverviewData, type RevenueData,
} from "./actions";
import { ErrorState } from "./_components/shells";
import { reportPeriodLabel, matchesReportContext, validateReportRange, type ReportRange } from "./_components/report-utils";
import { RevenueCard } from "./_components/bi/revenue-card";
import { CollectionsCard } from "./_components/bi/collections-card";
import { OccupancyTrendCard } from "./_components/bi/occupancy-trend-card";
import { RangeControl } from "@/components/ui/pen/range-control";
import { ExportButton } from "./_components/bi/export-button";
import { deltaText } from "./_components/bi/bi-format";
import { BI_CARD } from "./_components/bi/bi-styles";
import type { RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";

export interface ReportsClientProps {
  orgId: string;
  hotelId: string;
  timeZone: string;
  today: string;
  initialStartDate: string;
  initialEndDate: string;
}

const CONTEXT_TITLE = "Reports";
const CONTEXT_CHANGED = "The active property, settings or report dates changed. Reload this page to continue.";
/** Same page title as Rooms, Rates and Guests. */
const TITLE_CLASS = "text-2xl font-semibold tracking-[-0.02em] text-foreground";
/** One rhythm for every gap on the page: 16px on phones, 24px from `md`. */
const GAP = "gap-4 md:gap-6";
/** Figures fade in once when they replace the skeleton; nothing else on the page moves. */
const REVEAL = "animate-in fade-in-0 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none";

/** Gate before mounting observers: old property data disappears immediately on sign-out/org switch. */
export function ReportsClient(props: ReportsClientProps) {
  const identity = useAuth();
  if (!identity.isLoaded || !identity.userId || identity.orgId !== props.orgId) {
    return <div className="mx-auto w-full max-w-7xl space-y-2 pt-6 md:pt-8"><h1 className={TITLE_CLASS}>{CONTEXT_TITLE}</h1><p role="status" className="text-sm leading-5 text-muted-foreground">Loading the active property…</p></div>;
  }
  return <BiSession key={`${identity.userId}:${props.orgId}:${props.hotelId}`} {...props} />;
}

/** The URL carries the range, so a report can be linked, reloaded and stepped back to. */
function readRange(initial: ReportRange, today: string): ReportRange {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("startDate"), endDate = params.get("endDate");
  return startDate && endDate && !validateReportRange({ startDate, endDate }, today)
    ? { startDate, endDate }
    : initial;
}

function BiSession({ orgId, hotelId, timeZone, today, initialStartDate, initialEndDate }: ReportsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [range, setRange] = useState<ReportRange>(() => readRange({ startDate: initialStartDate, endDate: initialEndDate }, today));
  const scope = { orgId, hotelId };

  function changeRange(startDate: string, endDate: string) {
    setRange({ startDate, endDate });
    router.push(`${pathname}?${new URLSearchParams({ startDate, endDate })}`, { scroll: false });
  }

  // A stale or crafted link (including pre-BI ?tab= links) must never leave an
  // address bar that disagrees with the figures on screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stale = (params.get("startDate") !== null && params.get("startDate") !== range.startDate) ||
      (params.get("endDate") !== null && params.get("endDate") !== range.endDate) ||
      params.has("tab");
    if (stale) router.replace(`${pathname}?${new URLSearchParams({ startDate: range.startDate, endDate: range.endDate })}`, { scroll: false });
    // Runs once: later changes already write the URL through changeRange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server metadata is the only authority for tenant identity, including for older cached responses.
  const context = { ...range, orgId, hotelId, timeZone };
  const overview = useBiReport<OverviewData>("overview", scope, range, getReportsOverview, (data) => matchesReportContext({ tab: "overview", data }, { ...context, tab: "overview" }));
  const occupancy = useBiReport<OccupancyData>("occupancy", scope, range, getOccupancyReport, (data) => matchesReportContext({ tab: "occupancy", data }, { ...context, tab: "occupancy" }));
  const guests = useBiReport<GuestsData>("guests", scope, range, getGuestsReport, (data) => matchesReportContext({ tab: "guests", data }, { ...context, tab: "guests" }));
  const revenue = useBiReport<RevenueData>("revenue", scope, range, getRevenueReport, (data) => matchesReportContext({ tab: "revenue", data }, { ...context, tab: "revenue" }));
  const roomsSold = useBiReport<{ metric: RoomsSoldMetric; timeZone: string }>("rooms-sold", scope, range, () => getRoomsSoldTonight(scope));

  // Guests, receivables and rooms sold are no longer charted here; they are still
  // loaded so the CSV export keeps every figure it offered before.
  // Responses that pass the fetch guard already carry the right tenant and dates;
  // this render-side check only drops values cached by a superseded identity.
  const overviewData = overview.data && overview.data.meta.orgId === orgId ? overview.data : undefined;
  const occupancyData = occupancy.data && occupancy.data.meta.orgId === orgId ? occupancy.data : undefined;
  const guestsData = guests.data && guests.data.meta.orgId === orgId ? guests.data : undefined;
  const revenueData = revenue.data && revenue.data.meta.orgId === orgId ? revenue.data : undefined;

  const exportButton = <ExportButton range={range} overview={overviewData} occupancy={occupancyData} guests={guestsData} revenue={revenueData}
    roomsSold={roomsSold.data?.metric} disabled={overview.isPending} />;

  return <div className="mx-auto w-full max-w-7xl pt-6 md:pt-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className={TITLE_CLASS}>{CONTEXT_TITLE}</h1>
        <p className="text-sm leading-5 text-muted-foreground" aria-live="polite">
          {reportPeriodLabel(range)}
          {overviewData && <ComparisonText meta={overviewData.meta} />}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RangeControl range={range} today={today} onChange={changeRange} />
        {exportButton}
      </div>
    </header>

    <div className={cn("mt-6 flex flex-col md:mt-8", GAP)}>
      {overview.isPending
        ? <><KpiStripSkeleton /><CardSkeleton /></>
        : overviewData
          ? <div className={cn("flex flex-col", GAP, REVEAL)}>
            <KpiStrip data={overviewData} />
            <RevenueCard currency={overviewData.currency} current={overviewData.series} prior={overviewData.priorSeries} today={today} />
          </div>
          : <SectionError error={overview.error} onRetry={() => void overview.refetch()} />}
      <div className={cn("grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]", GAP)}>
        {occupancy.isPending
          ? <CardSkeleton />
          : occupancyData
            ? <OccupancyTrendCard className={REVEAL} daily={occupancyData.daily} coverage={occupancyData.coverage} />
            : <SectionError error={occupancy.error} onRetry={() => void occupancy.refetch()} />}
        {overview.isPending
          ? <CardSkeleton />
          : overviewData
            ? <CollectionsCard className={REVEAL} collected={overviewData.collected} byMethod={overviewData.byMethod} currency={overviewData.currency} />
            : null}
      </div>
    </div>
  </div>;
}

/**
 * Names the windows the deltas actually compare. A range that ends today is
 * compared on its completed nights only; a today-only range has no comparison.
 */
function ComparisonText({ meta }: { meta: OverviewData["meta"] }) {
  if (!meta.comparable) return null;
  const years = new Set([meta.startDate, meta.comparedEndDate, meta.priorStartDate, meta.priorEndDate].map((date) => date.slice(0, 4)));
  const pattern = years.size > 1 ? "MMM d, yyyy" : "MMM d";
  const windowLabel = (start: string, end: string) => `${formatDate(start, pattern)} – ${formatDate(end, pattern)}`;
  const prior = windowLabel(meta.priorStartDate, meta.priorEndDate);
  if (meta.comparedEndDate < meta.endDate) {
    return <span> · {windowLabel(meta.startDate, meta.comparedEndDate)} compared with {prior}. Tonight is not included until it ends.</span>;
  }
  return <span> · compared with {prior}</span>;
}

function useBiReport<T>(tab: string, scope: { orgId: string; hotelId: string }, range: ReportRange,
  fetcher: (startDate: string, endDate: string, scope: { orgId: string; hotelId: string }) => Promise<T>,
  /** Throws instead of caching a response that does not match the requested context. */
  validate?: (data: T) => boolean) {
  return useQuery({
    queryKey: qk.reports(scope.orgId, scope.hotelId, tab, range.startDate, range.endDate),
    queryFn: async ({ signal }): Promise<T> => {
      const data = await fetcher(range.startDate, range.endDate, scope);
      // Server actions cannot be transport-aborted; consuming the signal prevents a late
      // result from an unmounted tenant/date observer from reaching the screen.
      if (signal.aborted) throw new Error("Report request was cancelled.");
      if (validate && !validate(data)) throw new Error(CONTEXT_CHANGED);
      return data;
    },
    placeholderData: () => undefined,
    staleTime: 60_000,
    gcTime: 0,
    retry: false,
  });
}

interface KpiFigure {
  label: string;
  /** Formatted figure; null when it cannot be computed. */
  amount: string | null;
  delta: number | null;
  unit?: "%" | "pts";
}

/** Soft-foreground tokens mix in the page ink so 12px delta text clears WCAG AA (4.5:1) on the card. */
const DELTA_TONE = { up: "text-success-soft-foreground", down: "text-danger-soft-foreground", flat: "text-muted-foreground" } as const;
const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;

/**
 * The five headline figures in one surface, split by hairlines instead of five
 * separate cards. Revenue spans the row on phones; the rest sit two by two.
 */
const KPI_CELL = "@container flex min-w-0 flex-col gap-2 border-border/60 p-4 sm:p-6";
const KPI_LAYOUT = [
  "col-span-2 border-b lg:col-span-1 lg:border-b-0 lg:border-r",
  "border-b border-r lg:border-b-0",
  "border-b lg:border-b-0 lg:border-r",
  "border-r lg:border-r",
  "",
];

function KpiStrip({ data }: { data: OverviewData }) {
  // Money carries the cedi symbol so staff can tell it from counts at a glance.
  const money = (value: number) => formatCurrencySymbol(value, data.currency);
  const percent = (value: number | null) => value === null ? null : `${value.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
  const kpis: KpiFigure[] = [
    { label: "Room revenue", amount: money(data.revenue), delta: data.deltas.revenue },
    { label: "Occupancy", amount: percent(data.occupancy), delta: data.deltas.occupancy, unit: "pts" },
    { label: "ADR", amount: money(data.adr), delta: data.deltas.adr },
    { label: "RevPAR", amount: data.revpar === null ? null : money(data.revpar), delta: data.deltas.revpar },
    { label: "Room nights", amount: data.roomNights.toLocaleString("en"), delta: data.deltas.roomNights },
  ];
  return <Card className={cn(BI_CARD, "grid grid-cols-2 gap-0 p-0 sm:p-0 lg:grid-cols-5")}>
    {kpis.map((kpi, index) => {
      const change = deltaText(kpi.delta, kpi.unit);
      const Arrow = change ? DELTA_ICON[change.direction] : null;
      const at = change ? change.text.indexOf(" vs ") : -1;
      return <article key={kpi.label} aria-label={kpi.label} className={cn(KPI_CELL, KPI_LAYOUT[index])}>
        <p className="truncate text-xs font-medium leading-4 text-muted-foreground">{kpi.label}</p>
        {kpi.amount === null
          ? <p className="text-base font-medium leading-8 text-muted-foreground">Unavailable</p>
          : <p className="text-[28px] font-medium leading-8 tracking-[-0.01em] tabular-nums text-foreground">{kpi.amount}</p>}
        {change && Arrow
          ? <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs leading-4 tabular-nums text-muted-foreground">
            <span className={cn("flex items-center gap-1 font-medium", DELTA_TONE[change.direction])}>
              <Arrow size={12} strokeWidth={2.5} aria-hidden="true" />
              {change.text.slice(0, at)}
            </span>
            {/* Narrow cells all move the comparison to its own line, so every figure wraps the same way. */}
            <span className="whitespace-nowrap @max-[10rem]:basis-full">{change.text.slice(at + 1)}</span>
          </p>
          : <p className="text-xs leading-4 text-muted-foreground" aria-hidden="true">&nbsp;</p>}
      </article>;
    })}
  </Card>;
}

function KpiStripSkeleton() {
  return <Card className={cn(BI_CARD, "grid grid-cols-2 gap-0 p-0 sm:p-0 lg:grid-cols-5")} aria-hidden="true">
    {KPI_LAYOUT.map((layout, index) => <div key={index} className={cn(KPI_CELL, layout)}>
      <Skeleton className="h-4 w-20 rounded" />
      <Skeleton className="h-8 w-28 rounded" />
      <Skeleton className="h-4 w-12 rounded" />
    </div>)}
  </Card>;
}

function CardSkeleton() {
  return <Card className={cn(BI_CARD, "min-h-96")} aria-hidden="true">
    <Skeleton className="h-5 w-40 rounded" />
    <Skeleton className="h-4 w-56 max-w-full rounded" />
    <Skeleton className="w-full flex-1 rounded-xl" />
  </Card>;
}

function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <Card className={BI_CARD}><ErrorState message={errorText(error)} onRetry={onRetry} /></Card>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Check your connection and try again.";
}
