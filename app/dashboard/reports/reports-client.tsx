"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Banknote, BedDouble, CalendarDays, ReceiptText, TrendingUp } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { formatDate } from "@/lib/format";
import { NotesDisclosure } from "@/components/ui/notes-disclosure";
import {
  getBiFreshness, getGuestsReport, getOccupancyReport, getReportsOverview,
  getRevenueReport, getRoomsSoldTonight, type GuestsData, type OccupancyData, type OverviewData, type RevenueData,
} from "./actions";
import { ErrorState } from "./_components/shells";
import { reportPeriodLabel, matchesReportContext, validateReportRange, type ReportRange } from "./_components/report-utils";
import { PenKpi, KpiSkeleton } from "@/components/ui/pen/pen-kpi";
import { Sparkline } from "./_components/bi/sparkline";
import { PenCard, PenRow } from "@/components/ui/pen/pen-card";
import { RevenueCard } from "./_components/bi/revenue-card";
import { CollectionsCard } from "./_components/bi/collections-card";
import { OccupancyTrendCard } from "./_components/bi/occupancy-trend-card";
import { RoomTypeCard } from "./_components/bi/room-type-card";
import { RoomsSoldCard } from "./_components/bi/rooms-sold-card";
import { SourcesCard } from "./_components/bi/sources-card";
import { GuestsCard } from "./_components/bi/guests-card";
import { BiFooter } from "./_components/bi/footer-cards";
import { RangeControl } from "@/components/ui/pen/range-control";
import { ExportButton } from "./_components/bi/export-button";
import { moneyAmount } from "./_components/bi/bi-format";
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

/** Gate before mounting observers: old property data disappears immediately on sign-out/org switch. */
export function ReportsClient(props: ReportsClientProps) {
  const identity = useAuth();
  if (!identity.isLoaded || !identity.userId || identity.orgId !== props.orgId) {
    return <div className="mx-auto w-full max-w-7xl space-y-4"><h1 className="text-page-title">{CONTEXT_TITLE}</h1><p role="status" className="text-body text-muted-foreground">Loading the active property…</p></div>;
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
  const freshness = useBiReport<{ lastCloseAt: string | null; timeZone: string }>("freshness", scope, range, () => getBiFreshness(scope));

  // Responses that pass the fetch guard already carry the right tenant and dates;
  // this render-side check only drops values cached by a superseded identity.
  const overviewData = overview.data && overview.data.meta.orgId === orgId ? overview.data : undefined;
  const occupancyData = occupancy.data && occupancy.data.meta.orgId === orgId ? occupancy.data : undefined;
  const guestsData = guests.data && guests.data.meta.orgId === orgId ? guests.data : undefined;
  const revenueData = revenue.data && revenue.data.meta.orgId === orgId ? revenue.data : undefined;

  return <div className="bi-page mx-auto w-full max-w-7xl">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.3px] text-foreground max-md:text-xl">{CONTEXT_TITLE}</h1>
        <p className="mt-1 max-md:text-xs text-sm text-muted-foreground" aria-live="polite">
          {reportPeriodLabel(range)}
          {overviewData && overviewData.meta.priorStartDate !== overviewData.meta.startDate
            && <span className="text-muted-foreground/80"> · compared with {formatDate(overviewData.meta.priorStartDate, "MMM d")} – {formatDate(overviewData.meta.priorEndDate, "MMM d")}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 max-sm:hidden">
        <RangeControl range={range} today={today} onChange={changeRange} />
        <ExportButton range={range} overview={overviewData} occupancy={occupancyData} guests={guestsData} revenue={revenueData}
          roomsSold={roomsSold.data?.metric} disabled={overview.isPending} />
      </div>
    </header>
    {/* Mobile range + export controls */}
    <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:hidden">
      <RangeControl range={range} today={today} onChange={changeRange} />
      <ExportButton range={range} overview={overviewData} occupancy={occupancyData} guests={guestsData} revenue={revenueData}
        roomsSold={roomsSold.data?.metric} disabled={overview.isPending} />
    </div>

    <div className="mt-6 space-y-4">
      {overview.isError && !overviewData
        ? <ErrorState message={errorText(overview.error)} onRetry={() => void overview.refetch()} />
        : <KpiStrip data={overviewData} pending={overview.isPending} />}
      {overview.isPending
        ? <SectionSkeleton />
        : overviewData
          ? <PenRow
            wide={<RevenueCard title="Room revenue" caption={`Net room charges, excluding tax · ${overviewData.currency}`} currency={overviewData.currency} current={overviewData.series} prior={overviewData.priorSeries} />}
            narrow={<CollectionsCard collected={overviewData.collected} byMethod={overviewData.byMethod} />}
          />
          : <SectionError error={overview.error} onRetry={() => void overview.refetch()} />}
      {occupancy.isPending
        ? <SectionSkeleton />
        : occupancyData
          ? <OccupancyTrendCard daily={occupancyData.daily} average={overviewData?.occupancy ?? null} delta={occupancyData.deltas.occupancy} />
          : <SectionError error={occupancy.error} onRetry={() => void occupancy.refetch()} />}
      {occupancy.isPending
        ? <SectionSkeleton />
        : occupancyData
          ? <PenRow
            wide={<RoomTypeCard data={occupancyData} />}
            narrow={roomsSold.data
              ? <RoomsSoldCard metric={roomsSold.data.metric} tonight={roomsSold.data.metric.date} />
              : <PenCard><h2 className="text-[15px] font-semibold text-foreground">Rooms sold</h2><ErrorState message={errorText(roomsSold.error)} onRetry={() => void roomsSold.refetch()} /></PenCard>}
          />
          : null}
      {overview.isPending || guests.isPending
        ? <SectionSkeleton />
        : overviewData
          ? <PenRow
            wide={<SourcesCard sources={overviewData.sources} currency={overviewData.currency} />}
            narrow={guestsData
              ? <GuestsCard data={guestsData} />
              : <PenCard><h2 className="text-[15px] font-semibold text-foreground">Guests</h2><ErrorState message={errorText(guests.error)} onRetry={() => void guests.refetch()} /></PenCard>}
          />
          : null}
      <BiFooter
        outstanding={revenueData ? revenueData.outstanding : null}
        outstandingCount={revenueData ? revenueData.outstandingCount : null}
        currency={revenueData?.currency ?? "GHS"}
        lastCloseAt={freshness.data?.lastCloseAt ?? null}
        generatedAt={revenueData?.meta.generatedAt ?? new Date().toISOString()}
        timeZone={timeZone}
        className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]"
      />
      <NotesDisclosure items={overviewData?.meta.warnings ?? []} />
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

function KpiStrip({ data, pending }: { data?: OverviewData; pending: boolean }) {
  if (!data) return pending ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 max-lg:hidden">
    {[0, 1, 2, 3, 4].map((index) => <KpiSkeleton key={index} />)}
  </div> : null;

  const money = (value: number) => `${data.currency} ${moneyAmount(value, data.currency, { maximumFractionDigits: 0 })}`;
  const percent = (value: number | null) => value === null ? "Unavailable" : `${value.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
  const kpis = [
    { label: "Room revenue", value: money(data.revenue), icon: Banknote, delta: data.deltas.revenue, values: data.series.map((point) => point.revenue) },
    { label: "Occupancy", value: percent(data.occupancy), icon: BedDouble, delta: data.deltas.occupancy, unit: "pts" as const, values: data.series.map((point) => point.occupancy) },
    { label: "ADR", value: money(data.adr), icon: ReceiptText, delta: data.deltas.adr, values: data.series.map((point) => point.adr) },
    { label: "RevPAR", value: data.revpar === null ? "Unavailable" : money(data.revpar), icon: TrendingUp, delta: data.deltas.revpar, values: data.series.map((point) => point.revpar) },
    { label: "Room nights", value: data.roomNights.toLocaleString("en"), icon: CalendarDays, delta: data.deltas.roomNights, values: data.series.map((point) => point.roomNights) },
  ];
  return <>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 max-lg:hidden">
      {kpis.map((kpi) => <PenKpi key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} delta={kpi.delta} unit={kpi.unit}>
        <Sparkline values={kpi.values} />
      </PenKpi>)}
    </div>
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:hidden">
      {kpis.map((kpi) => <PenKpi key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} delta={kpi.delta} unit={kpi.unit} mobile />)}
    </div>
  </>;
}

function SectionSkeleton() {
  return <PenCard className="h-[280px] justify-center" aria-hidden="true">
    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
    <div className="h-48 w-full animate-pulse rounded-xl bg-muted" />
  </PenCard>;
}

function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <PenCard><ErrorState message={errorText(error)} onRetry={onRetry} /></PenCard>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Check your connection and try again.";
}
