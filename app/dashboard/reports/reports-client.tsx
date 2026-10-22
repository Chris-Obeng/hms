"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Button, Tabs } from "@heroui/react";
import { Download, RotateCw } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { getGuestsReport, getOccupancyReport, getRevenueReport, getReportsOverview } from "./actions";
import { PeriodControl } from "./_components/period-control";
import { OverviewTab } from "./_components/overview-tab";
import { RevenueTab } from "./_components/revenue-tab";
import { OccupancyTab } from "./_components/occupancy-tab";
import { GuestsTab } from "./_components/guests-tab";
import { ErrorState, TabSkeleton } from "./_components/shells";
import { reportRangeLabel, type ReportTab } from "./_components/report-utils";
import { buildReportCsv, canExportReport, downloadReportCsv, matchesReportContext, type ReportSnapshot } from "./_components/report-export";

export interface ReportsClientProps {
  orgId: string;
  hotelId: string;
  timeZone: string;
  today: string;
  initialStartDate: string;
  initialEndDate: string;
}

const TAB_LABELS: Record<ReportTab, string> = { overview: "Overview", revenue: "Room revenue", occupancy: "Occupancy", guests: "Guests & collections" };
const CONTEXT_CHANGED = "The active property, settings or report dates changed. Reload this page to continue.";

/** Gate before mounting a query observer: old property data disappears immediately on sign-out/org switch.
 * The keyed session also resets draft dates and selection if the property or staff identity changes. */
export function ReportsClient(props: ReportsClientProps) {
  const identity = useAuth();
  if (!identity.isLoaded || !identity.userId || identity.orgId !== props.orgId) {
    return <div data-reports><h1 className="text-page-title">Reports</h1><p role="status">Loading the active property…</p></div>;
  }
  return <ReportsSession key={`${identity.userId}:${props.orgId}:${props.hotelId}`} {...props} />;
}

function ReportsSession({ orgId, hotelId, timeZone, today, initialStartDate, initialEndDate }: ReportsClientProps) {
  const [range, setRange] = useState({ startDate: initialStartDate, endDate: initialEndDate });
  const [tab, setTab] = useState<ReportTab>("overview");
  const [exportMessage, setExportMessage] = useState("");
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
  const exportContext = { ...requestContext, isSuccess: report.isSuccess, isFetching: report.isFetching, isStale: report.isStale };
  const exportReady = canExportReport(snapshot, exportContext);
  const generated = meta ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: meta.timeZone }).format(new Date(meta.generatedAt)) : null;

  function exportCurrentReport() {
    try {
      const csv = buildReportCsv(snapshot, exportContext);
      downloadReportCsv(csv, tab, range);
      setExportMessage(`${TAB_LABELS[tab]} CSV downloaded for ${reportRangeLabel(range)}.`);
    } catch (error) { setExportMessage(error instanceof Error ? error.message : "Could not export this report. Try again."); }
  }

  return <div data-reports className="reports-page">
    <header className="reports-header">
      <div className="reports-heading"><h1>Reports</h1><p>Understand room performance, guest arrivals, and collections.</p></div>
      <div className="reports-toolbar">
        <PeriodControl {...range} today={today} onChange={(startDate, endDate) => { setRange({ startDate, endDate }); setExportMessage(""); }} />
        <div className="reports-actions">
          <Button variant="outline" className="reports-control" isDisabled={report.isFetching} onPress={() => { setExportMessage(""); void report.refetch(); }}>
            <RotateCw size={16} className={report.isFetching ? "reports-refreshing" : undefined} aria-hidden="true" />
            {report.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="secondary" className="reports-control" isDisabled={!exportReady} onPress={exportCurrentReport} aria-describedby="reports-export-hint">
            <Download size={16} aria-hidden="true" />Export CSV
          </Button>
        </div>
      </div>
    </header>
    <div className="reports-effective-period" aria-live="polite">
      <p><strong>{meta ? "Showing" : "Requested"} {reportRangeLabel(meta ?? range)}</strong> · {meta?.timeZone ?? timeZone}</p>
      {meta && <p>Compared with {reportRangeLabel({ startDate: meta.priorStartDate, endDate: meta.priorEndDate })} · Updated {generated}</p>}
    </div>
    <p id="reports-export-hint" className="reports-note">CSV includes the current tab, exact values, dates, currency, and report notes. Refresh is required before exporting an out-of-date report.</p>
    <p role="status" className="sr-only">{exportMessage || (report.isFetching ? "Updating report…" : "")}</p>
    <Tabs variant="secondary" selectedKey={tab} onSelectionChange={(key) => { setTab(key as ReportTab); setExportMessage(""); }} className="reports-tabs">
      <Tabs.ListContainer><Tabs.List aria-label="Report sections">
        {(Object.entries(TAB_LABELS) as [ReportTab, string][]).map(([key, label]) => <Tabs.Tab id={key} key={key}>{label}<Tabs.Indicator /></Tabs.Tab>)}
      </Tabs.List></Tabs.ListContainer>
      {(Object.keys(TAB_LABELS) as ReportTab[]).map((key) => <Tabs.Panel key={key} id={key} className="reports-tab-panel" aria-busy={tab === key && report.isFetching}>
        {tab !== key ? null : <>
          {report.isError && snapshot ? <div role="alert" className="reports-notice"><strong>Refresh failed. The report below may be out of date.</strong><p>Last loaded {generated}. Export is disabled. Refresh to try again.</p></div> : null}
          {report.isStale && !report.isFetching && !report.isError && snapshot ? <p role="status" className="reports-note">This report may be out of date. Refresh before exporting.</p> : null}
          {report.isPending ? <TabSkeleton /> : !snapshot ? <ErrorState message={report.data ? CONTEXT_CHANGED : report.error instanceof Error ? report.error.message : "Check your connection and retry."} onRetry={() => void report.refetch()} /> : <>
            <ReportContent snapshot={snapshot} />
            {meta && meta.warnings.length > 0 && <aside className="reports-notice" aria-label="Report notes">
              <h2>About these figures</h2><ul>{meta.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </aside>}
          </>}
        </>}
      </Tabs.Panel>)}
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
