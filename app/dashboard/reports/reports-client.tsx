"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Card, Chip, Skeleton } from "@heroui/react";
import { ArrowDownRight, ArrowUpRight, Banknote, BedDouble, CalendarDays, Minus, ReceiptText, TrendingUp, type LucideIcon } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { formatDate } from "@/lib/format";
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
import { deltaText, moneyAmount } from "./_components/bi/bi-format";
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

const CONTEXT_TITLE = "Business Intelligence";
const CONTEXT_CHANGED = "The active property, settings or report dates changed. Reload this page to continue.";
/** Large title: tight leading and negative tracking that grows with the size. */
const TITLE_CLASS = "text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground md:text-[28px] md:leading-8 md:tracking-[-0.02em]";
/** One rhythm for every gap on the page: 16px on phones, 24px from `md`. */
const GAP = "gap-4 md:gap-6";

/** Gate before mounting observers: old property data disappears immediately on sign-out/org switch. */
export function ReportsClient(props: ReportsClientProps) {
  const identity = useAuth();
  if (!identity.isLoaded || !identity.userId || identity.orgId !== props.orgId) {
    return <div className="mx-auto w-full max-w-7xl space-y-2"><h1 className={TITLE_CLASS}>{CONTEXT_TITLE}</h1><p role="status" className="text-sm leading-5 text-muted-foreground">Loading the active property…</p></div>;
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

  return <div className="mx-auto w-full max-w-7xl">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className={TITLE_CLASS}>{CONTEXT_TITLE}</h1>
        <p className="text-sm leading-5 text-muted-foreground" aria-live="polite">
          {reportPeriodLabel(range)}
          {overviewData && overviewData.meta.priorStartDate !== overviewData.meta.startDate
            && <span> · compared with {formatDate(overviewData.meta.priorStartDate, "MMM d")} – {formatDate(overviewData.meta.priorEndDate, "MMM d")}</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RangeControl range={range} today={today} onChange={changeRange} />
        {exportButton}
      </div>
    </header>

    <div className={cn("mt-6 flex flex-col md:mt-8", GAP)}>
      {overview.isPending
        ? <><KpiStripSkeleton /><RowSkeleton /></>
        : overviewData
          ? <>
            <KpiStrip data={overviewData} />
            <div className={cn("grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]", GAP)}>
              <RevenueCard title="Room revenue" caption={`Net room charges, excluding tax · ${overviewData.currency}`} currency={overviewData.currency}
                current={overviewData.series} prior={overviewData.priorSeries} />
              <CollectionsCard collected={overviewData.collected} byMethod={overviewData.byMethod} currency={overviewData.currency} />
            </div>
          </>
          : <SectionError error={overview.error} onRetry={() => void overview.refetch()} />}
      {occupancy.isPending
        ? <CardSkeleton />
        : occupancyData
          ? <OccupancyTrendCard daily={occupancyData.daily} coverage={occupancyData.coverage} delta={occupancyData.deltas.occupancy} />
          : <SectionError error={occupancy.error} onRetry={() => void occupancy.refetch()} />}
    </div>
  </div>;
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
  icon: LucideIcon;
  /** Formatted amount without the currency code; null when the figure cannot be computed. */
  amount: string | null;
  /** Currency code set as a quiet prefix, so the number carries the weight. */
  currency?: string;
  delta: number | null;
  unit?: "%" | "pts";
}

/**
 * Two columns on phones (revenue spans both), 3 + 3 then 2 + 2 + 2 on tablets,
 * and one row of five from `xl`. No card is ever left alone on a row.
 */
const KPI_SPANS = [
  "col-span-2 md:col-span-3 xl:col-span-1",
  "col-span-1 md:col-span-3 xl:col-span-1",
  "col-span-1 md:col-span-2 xl:col-span-1",
  "col-span-1 md:col-span-2 xl:col-span-1",
  "col-span-1 md:col-span-2 xl:col-span-1",
];
const KPI_GRID = cn("grid grid-cols-2 md:grid-cols-6 xl:grid-cols-5", GAP);
const DELTA_COLOR = { up: "success", down: "danger", flat: "default" } as const;
const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;

function KpiStrip({ data }: { data: OverviewData }) {
  const money = (value: number) => moneyAmount(value, data.currency, { maximumFractionDigits: 0 });
  const percent = (value: number | null) => value === null ? null : `${value.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
  const kpis: KpiFigure[] = [
    { label: "Room revenue", icon: Banknote, amount: money(data.revenue), currency: data.currency, delta: data.deltas.revenue },
    { label: "Occupancy", icon: BedDouble, amount: percent(data.occupancy), delta: data.deltas.occupancy, unit: "pts" },
    { label: "ADR", icon: ReceiptText, amount: money(data.adr), currency: data.currency, delta: data.deltas.adr },
    { label: "RevPAR", icon: TrendingUp, amount: data.revpar === null ? null : money(data.revpar), currency: data.currency, delta: data.deltas.revpar },
    { label: "Room nights", icon: CalendarDays, amount: data.roomNights.toLocaleString("en"), delta: data.deltas.roomNights },
  ];
  return <div className={KPI_GRID}>
    {kpis.map((kpi, index) => {
      const change = deltaText(kpi.delta, kpi.unit);
      const Arrow = change ? DELTA_ICON[change.direction] : null;
      const at = change ? change.text.indexOf(" vs ") : -1;
      return <Card key={kpi.label} render={(props) => <article {...props} />} aria-label={kpi.label} className={cn(BI_CARD, KPI_SPANS[index])}>
        <Card.Header className="flex-row items-center justify-between gap-2">
          <Card.Description className="truncate text-xs font-medium leading-4 text-muted-foreground">{kpi.label}</Card.Description>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0485F714] text-[var(--pen-accent)]" aria-hidden="true">
            <kpi.icon size={16} />
          </span>
        </Card.Header>
        <Card.Content className="gap-4">
          {/* Values sit on the same row in every card; cards without a comparison simply end after the value. */}
          <p className="flex min-h-8 flex-wrap items-baseline gap-x-1 tabular-nums">
            {kpi.amount === null
              ? <span className="text-base font-medium leading-8 text-muted-foreground">Unavailable</span>
              : <>
                {kpi.currency && <span className="text-sm font-medium leading-5 text-muted-foreground">{kpi.currency}</span>}
                <span className="text-2xl font-semibold leading-8 tracking-[-0.02em] text-foreground xl:text-[28px]">{kpi.amount}</span>
              </>}
          </p>
          {change && Arrow && <p className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-muted-foreground">
            <Chip size="sm" variant="soft" color={DELTA_COLOR[change.direction]} className="gap-1 font-semibold tabular-nums">
              <Arrow size={12} strokeWidth={2.5} aria-hidden="true" />
              <Chip.Label>{change.text.slice(0, at)}</Chip.Label>
            </Chip>
            {/* Phones always put the comparison on its own line, so every card wraps the same way. */}
            <span className="max-md:basis-full">{change.text.slice(at + 1)}</span>
          </p>}
        </Card.Content>
      </Card>;
    })}
  </div>;
}

function KpiStripSkeleton() {
  return <div className={KPI_GRID} aria-hidden="true">
    {KPI_SPANS.map((span, index) => <Card key={index} className={cn(BI_CARD, span)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20 rounded" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-28 rounded" />
      <Skeleton className="h-6 w-32 rounded-full" />
    </Card>)}
  </div>;
}

/** Stands in for the revenue and collections row at its loaded proportions. */
function RowSkeleton() {
  return <div className={cn("grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]", GAP)} aria-hidden="true">
    <CardSkeleton />
    <CardSkeleton />
  </div>;
}

function CardSkeleton() {
  return <Card className={cn(BI_CARD, "min-h-80")} aria-hidden="true">
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
