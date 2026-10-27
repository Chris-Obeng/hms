"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "@heroui/react";
import { qk } from "@/lib/query-keys";
import { formatDate } from "@/lib/format";
import { NotesDisclosure } from "@/components/ui/notes-disclosure";
import { getGuestsReport, getOccupancyReport, getRevenueReport, getReportsOverview } from "./actions";
import { PeriodControl } from "./_components/period-control";
import { ErrorState, TabSkeleton } from "./_components/shells";
import { reportPeriodLabel, matchesReportContext, validateReportRange, type ReportRange, type ReportSnapshot, type ReportTab } from "./_components/report-utils";

const OverviewTab = dynamic(() => import("./_components/overview-tab").then((mod) => mod.OverviewTab), { loading: () => <TabSkeleton /> });
const RevenueTab = dynamic(() => import("./_components/revenue-tab").then((mod) => mod.RevenueTab), { loading: () => <TabSkeleton /> });
const OccupancyTab = dynamic(() => import("./_components/occupancy-tab").then((mod) => mod.OccupancyTab), { loading: () => <TabSkeleton /> });
const GuestsTab = dynamic(() => import("./_components/guests-tab").then((mod) => mod.GuestsTab), { loading: () => <TabSkeleton /> });

export interface ReportsClientProps {
  orgId: string;
  hotelId: string;
  timeZone: string;
  today: string;
  initialStartDate: string;
  initialEndDate: string;
}

const TABS: { key: ReportTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "revenue", label: "Room revenue" },
  { key: "occupancy", label: "Occupancy" },
  { key: "guests", label: "Guests & collections" },
];
const CONTEXT_CHANGED = "The active property, settings or report dates changed. Reload this page to continue.";

/** Gate before mounting a query observer: old property data disappears immediately on sign-out/org switch.
 * The keyed session also resets draft dates and selection if the property or staff identity changes. */
export function ReportsClient(props: ReportsClientProps) {
  const identity = useAuth();
  if (!identity.isLoaded || !identity.userId || identity.orgId !== props.orgId) {
    return <div className="mx-auto w-full max-w-6xl space-y-4"><h1 className="text-page-title">Reports</h1><p role="status" className="text-body text-muted-foreground">Loading the active property…</p></div>;
  }
  return <ReportsSession key={`${identity.userId}:${props.orgId}:${props.hotelId}`} {...props} />;
}

function isReportTab(value: string | null): value is ReportTab {
  return value !== null && TABS.some(({ key }) => key === value);
}

/** Every link into a tab carries the same three params, so the server can bypass the router cache for them. */
function tabHref(tab: ReportTab, range: ReportRange): string {
  return `?${new URLSearchParams({ tab, startDate: range.startDate, endDate: range.endDate }).toString()}`;
}

function ReportsSession({ orgId, hotelId, timeZone, today, initialStartDate, initialEndDate }: ReportsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  // A crafted or stale link must never open a range the server would reject.
  const readRange = (): ReportRange => {
    const params = new URLSearchParams(window.location.search);
    const startDate = params.get("startDate"), endDate = params.get("endDate");
    return startDate && endDate && !validateReportRange({ startDate, endDate }, today) ? { startDate, endDate } : { startDate: initialStartDate, endDate: initialEndDate };
  };
  const readTab = (): ReportTab => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return isReportTab(tab) ? tab : "overview";
  };
  const [range, setRange] = useState(readRange);
  const [tab, setTab] = useState<ReportTab>(readTab);
  const requestContext = { ...range, orgId, hotelId, tab, timeZone };
  const report = useQuery({
    queryKey: qk.reports(orgId, hotelId, tab, range.startDate, range.endDate),
    queryFn: async ({ signal }): Promise<ReportSnapshot> => {
      let snapshot: ReportSnapshot;
      const scope = { orgId, hotelId };
      switch (tab) {
        case "overview": snapshot = { tab, data: await getReportsOverview(range.startDate, range.endDate, scope) }; break;
        case "revenue": snapshot = { tab, data: await getRevenueReport(range.startDate, range.endDate, scope) }; break;
        case "occupancy": snapshot = { tab, data: await getOccupancyReport(range.startDate, range.endDate, scope) }; break;
        case "guests": snapshot = { tab, data: await getGuestsReport(range.startDate, range.endDate, scope) }; break;
      }
      // Server actions cannot be transport-aborted; consuming the signal prevents a late result
      // from an unmounted tenant/date observer from entering its cache or returning to the screen.
      if (signal.aborted) throw new Error("Report request was cancelled.");
      if (!matchesReportContext(snapshot, requestContext)) throw new Error(CONTEXT_CHANGED);
      return snapshot;
    },
    placeholderData: () => undefined,
    staleTime: 60_000,
    gcTime: 0,
    retry: false,
  });
  const snapshot = matchesReportContext(report.data, requestContext) ? report.data : undefined;
  const meta = snapshot?.data.meta;

  /** The URL carries the view, so a report can be linked, reloaded and stepped back to.
   * A forced navigation bypasses the router cache, so the server always re-renders the
   * destination params and a crafted link cannot open a rejected range. */
  function syncUrl(next: { tab?: ReportTab; startDate?: string; endDate?: string }) {
    const destination = tabHref(next.tab ?? tab, {
      startDate: next.startDate ?? range.startDate,
      endDate: next.endDate ?? range.endDate,
    });
    router.push(`${pathname}${destination}`, { scroll: false });
  }
  function selectTab(next: ReportTab) {
    setTab(next);
    syncUrl({ tab: next });
  }
  function changeRange(startDate: string, endDate: string) {
    setRange({ startDate, endDate });
    syncUrl({ startDate, endDate });
  }

  // A crafted link that failed validation opened the server default; say so in the URL
  // rather than leaving an address bar that disagrees with the figures on screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stale = (params.get("tab") ?? tab) !== tab ||
      (params.get("startDate") !== null && params.get("startDate") !== range.startDate) ||
      (params.get("endDate") !== null && params.get("endDate") !== range.endDate);
    if (stale) router.replace(`${pathname}${tabHref(tab, range)}`, { scroll: false });
    // Runs once: later changes already write the URL through syncUrl.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const comparison = meta && (meta.priorStartDate !== meta.startDate)
    ? `vs ${formatDate(meta.priorStartDate, "MMM d")} – ${formatDate(meta.priorEndDate, "MMM d")}`
    : null;
  const notes = [...(meta?.warnings ?? [])];

  return <div className="mx-auto w-full max-w-6xl space-y-5">
    <header className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-page-title">Reports</h1>
        <p className="mt-1 text-body text-muted-foreground" aria-live="polite">
          {reportPeriodLabel(range)}{comparison && <span className="text-muted-foreground/80"> · {comparison}</span>}
        </p>
      </div>
      <PeriodControl {...range} today={today} onChange={changeRange} />
    </header>

    <p role="status" className="sr-only">{report.isFetching ? "Updating report…" : ""}</p>
    <Tabs selectedKey={tab} onSelectionChange={(key) => selectTab(key as ReportTab)} className="reports-tabs">
      <Tabs.ListContainer className="-mx-1 overflow-x-auto px-1 no-scrollbar">
        <Tabs.List aria-label="Report sections">
          {TABS.map(({ key, label }) => <Tabs.Tab key={key} id={key}
            className="flex-none whitespace-nowrap px-1 pb-2.5 pt-2 text-[13.5px] font-medium text-muted-foreground [&[data-selected=true]]:font-semibold [&[data-selected=true]]:text-foreground">
            {label}<Tabs.Indicator />
          </Tabs.Tab>)}
        </Tabs.List>
      </Tabs.ListContainer>
      {TABS.map(({ key }) => {
        const active = tab === key;
        // Panels stay in the a11y tree so tab-panel relationships hold, but only the
        // selected one renders content: the header's "Updating…" status must mean the
        // active panel, not a background refetch of a tab that is no longer shown.
        return <Tabs.Panel key={key} id={key} className="pt-4" aria-busy={active && report.isFetching}>
          <div inert={!active ? true : undefined}>
            {active && <>
              {report.isError && snapshot ? <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-[13px]">
                <p>Couldn’t refresh this report. Showing the last result.</p>
                <button type="button" className="min-h-8 font-medium text-foreground underline underline-offset-4" onClick={() => void report.refetch()}>Try again</button>
              </div> : null}
              {report.isPending ? <TabSkeleton /> : !snapshot ? <ErrorState message={report.data ? CONTEXT_CHANGED : report.error instanceof Error ? report.error.message : "Check your connection and try again."} onRetry={() => void report.refetch()} /> : <>
                <ReportContent snapshot={snapshot} />
                <div className="mt-4"><NotesDisclosure items={notes} /></div>
              </>}
            </>}
          </div>
        </Tabs.Panel>;
      })}
    </Tabs>
  </div>;
}

function ReportContent({ snapshot }: { snapshot: ReportSnapshot }) {
  switch (snapshot.tab) {
    case "overview": return <OverviewTab data={snapshot.data} />;
    case "revenue": return <RevenueTab data={snapshot.data} />;
    case "occupancy": return <OccupancyTab data={snapshot.data} />;
    case "guests": return <GuestsTab data={snapshot.data} />;
  }
}
