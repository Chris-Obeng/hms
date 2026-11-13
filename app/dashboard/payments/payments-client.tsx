"use client";

import * as React from "react";
import { Tabs, Button, Chip } from "@heroui/react";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  Globe,
  ReceiptText,
  Search,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";
import { formatCurrency, formatDateInTimeZone } from "@/lib/format";
import { getMethodLabel, PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { PaymentsSettingsClient } from "@/app/dashboard/settings/payments/payments-client";
import { PayoutsPanel } from "@/components/payouts/payouts-panel";
import { PenKpi } from "@/components/ui/pen/pen-kpi";
import { RangeControl } from "@/components/ui/pen/range-control";
import { reportPeriodLabel } from "@/lib/report-dates";
import { getMyHotelPayouts } from "@/app/actions/payouts";
import { getPaymentActivity, type PaymentActivityResult, type PaymentActivityStatus } from "./actions";

type Tab = "activity" | "payouts" | "setup";
type SetupData = React.ComponentProps<typeof PaymentsSettingsClient>["initialData"];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "success", label: "Successful" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
] as const;

function statusLabel(status: string | null): string {
  return status === "success" ? "Successful" : status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
}

function statusTone(status: string | null): "success" | "warning" | "danger" | "default" {
  if (status === "success") return "success";
  if (status === "pending") return "warning";
  if (status === "failed" || status === "refunded") return "danger";
  return "default";
}

export function PaymentsClient({
  hotelId, currency, timeZone, today, initialTab, initialActivity, activityError, canConfigure, initialFilters, initialSetup,
}: {
  hotelId: string;
  currency: string;
  timeZone: string;
  today: string;
  initialTab: Tab;
  initialActivity: PaymentActivityResult | null;
  activityError: string | null;
  canConfigure: boolean;
  initialFilters: { status: PaymentActivityStatus; method: string; search: string };
  initialSetup: SetupData;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [activity, setActivity] = React.useState<PaymentActivityResult | null>(initialActivity);
  const [error, setError] = React.useState(activityError);
  const [loading, setLoading] = React.useState(false);
  const [startDate, setStartDate] = React.useState(initialActivity?.startDate ?? today);
  const [endDate, setEndDate] = React.useState(initialActivity?.endDate ?? today);
  const [status, setStatus] = React.useState<PaymentActivityStatus>(initialFilters.status);
  const [method, setMethod] = React.useState(initialFilters.method);
  const [search, setSearch] = React.useState(initialFilters.search);
  const [page, setPage] = React.useState(initialActivity?.page ?? 1);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const requestId = React.useRef(0);

  function activityUrl(next: Partial<{ tab: Tab; startDate: string; endDate: string; status: PaymentActivityStatus; method: string; search: string; page: number }> = {}) {
    const params = new URLSearchParams();
    params.set("tab", next.tab ?? tab);
    params.set("startDate", next.startDate ?? startDate);
    params.set("endDate", next.endDate ?? endDate);
    params.set("status", next.status ?? status);
    params.set("method", next.method ?? method);
    if ((next.search ?? search).trim()) params.set("search", (next.search ?? search).trim());
    const nextPage = next.page ?? page;
    if (nextPage > 1) params.set("page", String(nextPage));
    return `/dashboard/payments?${params.toString()}`;
  }

  const loadActivity = React.useCallback(async (next?: Partial<{ startDate: string; endDate: string; page: number; status: PaymentActivityStatus; method: string; search: string }>) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const result = await getPaymentActivity({ startDate, endDate, page, status, method, search, ...next });
    if (currentRequest !== requestId.current) return;
    if (result.success) setActivity(result.data);
    else setError(result.error);
    setLoading(false);
  }, [endDate, method, page, search, startDate, status]);

  React.useEffect(() => {
    const supabase = createClient();
    const refresh = createCoalescer();
    const channel = supabase.channel(`hotel:${hotelId}:payments-page`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `hotel_id=eq.${hotelId}` }, () => refresh.schedule(() => void loadActivity()))
      .subscribe(onRealtimeStatus({ label: "payments", hotelId, table: "payments" }));
    return () => { refresh.cancel(); supabase.removeChannel(channel); };
  }, [hotelId, loadActivity]);

  function selectTab(next: Tab) {
    setTab(next);
    router.replace(next === "activity" ? activityUrl({ tab: next }) : `/dashboard/payments?tab=${next}`, { scroll: false });
  }

  function applyRange(nextStart: string, nextEnd: string) {
    setStartDate(nextStart); setEndDate(nextEnd); setPage(1);
    router.replace(activityUrl({ tab: "activity", startDate: nextStart, endDate: nextEnd, page: 1 }), { scroll: false });
    void loadActivity({ startDate: nextStart, endDate: nextEnd, page: 1 });
  }

  function applyFilters() {
    setPage(1);
    router.replace(activityUrl({ tab: "activity", page: 1 }), { scroll: false });
    void loadActivity({ page: 1 });
  }

  return <div className="payments-page mx-auto w-full max-w-7xl space-y-6" data-payments>
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-2xl">Payments</h1>
      </div>
      {/* The chip sits alone top-right; choosing dates applies them. */}
      <div className="max-sm:hidden">
        <RangeControl range={{ startDate, endDate }} today={today} onChange={applyRange} />
      </div>
    </header>

    <Tabs variant="secondary" selectedKey={tab} onSelectionChange={(key) => selectTab(key as Tab)} className="payments-tabs w-full">
      <Tabs.ListContainer><Tabs.List aria-label="Payment sections">
        <Tabs.Tab id="activity">Payment activity<Tabs.Indicator /></Tabs.Tab>
        <Tabs.Tab id="payouts">Online payouts<Tabs.Indicator /></Tabs.Tab>
        {canConfigure && <Tabs.Tab id="setup">Setup<Tabs.Indicator /></Tabs.Tab>}
      </Tabs.List></Tabs.ListContainer>
      <Tabs.Panel id="activity" className="pt-6"><ActivityView
        activity={activity} error={error} loading={loading} startDate={startDate} endDate={endDate} today={today} currency={currency} timeZone={timeZone}
        status={status} method={method} search={search} page={page}
        onApplyRange={applyRange}
        onStatus={(value) => { setStatus(value); setPage(1); router.replace(activityUrl({ tab: "activity", status: value, page: 1 }), { scroll: false }); void loadActivity({ status: value, page: 1 }); }}
        onMethod={(value) => { setMethod(value); setPage(1); router.replace(activityUrl({ tab: "activity", method: value, page: 1 }), { scroll: false }); void loadActivity({ method: value, page: 1 }); }}
        onSearch={setSearch} onApply={applyFilters}
        onPage={(next) => { setPage(next); router.replace(activityUrl({ tab: "activity", page: next }), { scroll: false }); void loadActivity({ page: next }); }}
        onOpenBooking={(id) => { setBookingId(id); setDrawerOpen(true); }}
      /></Tabs.Panel>
      <Tabs.Panel id="payouts" className="pt-6"><PayoutsPanel load={getMyHotelPayouts} timeZone={timeZone} range={{ start: startDate, end: endDate }} /></Tabs.Panel>
      {canConfigure && <Tabs.Panel id="setup" className="pt-6"><PaymentsSettingsClient initialData={initialSetup} /></Tabs.Panel>}
    </Tabs>
    <BookingDetailDrawer bookingId={bookingId} open={drawerOpen} onClose={() => { setDrawerOpen(false); setBookingId(null); }} currency={currency} />
  </div>;
}

function ActivityView({ activity, error, loading, startDate, endDate, today, currency, timeZone, status, method, search, page, onApplyRange, onStatus, onMethod, onSearch, onApply, onPage, onOpenBooking }: {
  activity: PaymentActivityResult | null; error: string | null; loading: boolean; startDate: string; endDate: string; today: string; currency: string; timeZone: string;
  status: PaymentActivityStatus; method: string; search: string; page: number;
  onApplyRange: (start: string, end: string) => void; onStatus: (value: PaymentActivityStatus) => void;
  onMethod: (value: string) => void; onSearch: (value: string) => void; onApply: () => void; onPage: (page: number) => void;
  onOpenBooking: (id: string) => void;
}) {
  const methods = [{ value: "all", label: "All methods" }, ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))];
  const rangeLabel = reportPeriodLabel({ startDate, endDate });
  const totals = activity?.totals;

  return <div className="space-y-4">
    {/* Desktop: the range chip owns the dates and the strip states the totals. */}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-sm:hidden">
      <PenKpi label="Collected" value={moneyLabel(totals?.successfulAmount ?? 0, currency)} icon={Banknote} hint={rangeLabel} />
      <PenKpi label="Online payments" value={moneyLabel(totals?.onlineAmount ?? 0, currency)} icon={Globe} hint={`${(totals?.onlineCount ?? 0).toLocaleString("en")} payments`} />
      <PenKpi label="Collected by staff" value={moneyLabel(totals?.staffAmount ?? 0, currency)} icon={Wallet} hint={`${(totals?.staffCount ?? 0).toLocaleString("en")} payments`} />
    </div>
    {/* Mobile: full-width collected figure, then the channel split. */}
    <div className="sm:hidden">
      <PenKpi label="Collected" value={moneyLabel(totals?.successfulAmount ?? 0, currency)} icon={Banknote} hint={rangeLabel} mobile className="w-full min-w-0 shrink" />
      <div className="mt-4 grid grid-cols-2 gap-4">
        <PenKpi label="Online payments" value={moneyLabel(totals?.onlineAmount ?? 0, currency)} icon={Globe} hint={`${(totals?.onlineCount ?? 0).toLocaleString("en")} payments`} mobile className="w-full min-w-0 shrink" />
        <PenKpi label="Collected by staff" value={moneyLabel(totals?.staffAmount ?? 0, currency)} icon={Wallet} hint={`${(totals?.staffCount ?? 0).toLocaleString("en")} payments`} mobile className="w-full min-w-0 shrink" />
      </div>
    </div>

    {error ? <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger" role="alert"><CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></div> : null}

    <LedgerCard
      activity={activity} loading={loading} timeZone={timeZone}
      startDate={startDate} endDate={endDate} today={today}
      status={status} method={method} search={search} page={page}
      methods={methods}
      onApplyRange={onApplyRange} onStatus={onStatus} onMethod={onMethod}
      onSearch={onSearch} onApply={onApply} onPage={onPage} onOpenBooking={onOpenBooking}
    />
  </div>;
}

function moneyLabel(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LEDGER_COLUMNS = [
  { label: "Payment", width: "192px" },
  { label: "Guest / booking", width: "1fr" },
  { label: "Amount", width: "140px", align: "right" as const },
  { label: "Status", width: "120px" },
  { label: "Recorded by", width: "152px" },
  { label: "", width: "56px" },
];

function LedgerCard({ activity, loading, timeZone, startDate, endDate, today, status, method, search, page, methods, onApplyRange, onStatus, onMethod, onSearch, onApply, onPage, onOpenBooking }: {
  activity: PaymentActivityResult | null; loading: boolean; timeZone: string;
  startDate: string; endDate: string; today: string;
  status: PaymentActivityStatus; method: string; search: string; page: number;
  methods: { value: string; label: string }[];
  onApplyRange: (start: string, end: string) => void; onStatus: (value: PaymentActivityStatus) => void;
  onMethod: (value: string) => void; onSearch: (value: string) => void; onApply: () => void; onPage: (page: number) => void;
  onOpenBooking: (id: string) => void;
}) {
  return <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_2px_4px_rgb(0_0_0/0.04)]" aria-label="Payment ledger">
    <header className="flex items-center justify-between gap-4">
      <h2 className="text-md font-semibold text-foreground">Payment ledger</h2>
      <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{activity ? `${activity.totalCount.toLocaleString("en")} records` : "—"}</p>
    </header>

    {activity && <div className="sm:hidden">
      <RangeControl range={{ startDate, endDate }} today={today} onChange={onApplyRange} />
    </div>}

    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
      <div className="relative sm:col-span-2 md:col-span-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
        <input type="search" value={search} onChange={(event) => onSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onApply(); }} placeholder="Search guest, booking, or reference…" aria-label="Search payments" className="h-11 w-full rounded-xl border border-border/70 bg-card pl-9 pr-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 sm:h-10 sm:text-sm [@media(hover:hover)_and_(pointer:fine)]:hover:border-border" />
      </div>
      <HeroSelectField value={status} triggerClassName="min-h-11 sm:min-h-10" onValueChange={(value) => onStatus(value as PaymentActivityStatus)} options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} ariaLabel="Payment status" />
      <HeroSelectField value={method} triggerClassName="min-h-11 sm:min-h-10" onValueChange={onMethod} options={methods} ariaLabel="Payment method" />
      <Button variant="primary" onPress={onApply} isPending={loading} className="ui-press h-11 rounded-xl text-xs font-semibold sm:col-span-2 sm:h-10 md:col-span-1">Search</Button>
    </div>

    {/* Desktop table */}
    <div className="rounded-3xl bg-secondary p-1 pt-0 max-md:hidden">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Payment ledger records</caption>
        <thead><tr>
          {LEDGER_COLUMNS.map((column, index) => <th key={column.label + index} scope="col"
            className={cn("border-b border-border/70 px-4 py-3 text-left text-xs font-medium text-muted-foreground", column.align === "right" && "text-right")}>
            {column.label}
          </th>)}
        </tr></thead>
        <tbody>
          {loading && !activity ? <tr><td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">Loading payments…</td></tr>
            : activity?.rows.length ? activity.rows.map((row) => <tr key={row.id} className="border-b border-border/50 bg-card last:border-b-0">
              <td className="whitespace-nowrap px-4 py-3 align-top">
                <p className="font-medium tabular-nums">{row.paidAt ? formatDateInTimeZone(row.paidAt, timeZone, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</p>
                <p className="mt-1 text-2xs text-muted-foreground">{onlineRow(row) ? "Online" : getMethodLabel(row.method)}</p>
              </td>
              <td className="px-4 py-3 align-top">
                <p className="font-medium">{row.guestName ?? "Guest"}</p>
                <p className="mt-1 font-mono text-2xs text-muted-foreground">{row.bookingReference ?? "No booking reference"}</p>
              </td>
              <td className="px-4 py-3 text-right align-top font-mono font-semibold tabular-nums">{formatCurrency(row.amount, row.currency)}</td>
              <td className="px-4 py-3 align-top"><Chip size="sm" variant="soft" color={statusTone(row.status)}>{statusLabel(row.status)}</Chip></td>
              <td className="px-4 py-3 align-top text-xs text-muted-foreground">{onlineRow(row) ? "Online" : row.recordedBy ?? "—"}</td>
              <td className="px-4 py-3 text-right align-top">{row.bookingId && <Button isIconOnly variant="ghost" size="sm" className="size-8 rounded-lg" aria-label={`View booking ${row.bookingReference ?? ""}`} onPress={() => onOpenBooking(row.bookingId!)}><Eye className="size-4" /></Button>}</td>
            </tr>)
            : <tr><td colSpan={6} className="px-4 py-16 text-center"><div className="mx-auto flex max-w-xs flex-col items-center"><span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><ReceiptText className="size-5" aria-hidden="true" /></span><p className="mt-3 text-sm font-semibold">No payments match this view</p><p className="mt-1 text-sm text-muted-foreground">Try another date range, status, or search term.</p></div></td></tr>}
        </tbody>
      </table>
    </div>

    {/* Mobile compact rows */}
    {activity && <div className="md:hidden">
      {activity.rows.length ? activity.rows.map((row, index) => <div key={row.id}>
        {index > 0 && <div className="h-px bg-border/50" aria-hidden="true" />}
        <div className="flex flex-col gap-2 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{row.guestName ?? "Guest"}</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.amount, row.currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xs text-muted-foreground">{onlineRow(row) ? "Online" : getMethodLabel(row.method)}</span>
            <Chip size="sm" variant="soft" color={statusTone(row.status)}>{statusLabel(row.status)}</Chip>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-2xs text-muted-foreground">{row.bookingReference ?? "—"}</span>
            {row.bookingId && <button type="button" className="ui-press inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-2xs font-medium text-[var(--pen-accent)] outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenBooking(row.bookingId!)}>
              View booking <Eye className="size-3" aria-hidden="true" />
            </button>}
          </div>
        </div>
      </div>) : <p className="py-10 text-center text-sm text-muted-foreground">No payments match this view.</p>}
    </div>}

    {activity && <div className="flex flex-col gap-3 border-t border-border/50 px-1 pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>Page {page} · {activity.totalCount.toLocaleString("en")} records</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="ui-press min-h-11 rounded-xl sm:min-h-8" isDisabled={page <= 1 || loading} onPress={() => onPage(page - 1)}><ChevronLeft className="size-4" />Previous</Button>
        <Button variant="outline" size="sm" className="ui-press min-h-11 rounded-xl sm:min-h-8" isDisabled={!activity.hasNextPage || loading} onPress={() => onPage(page + 1)}>Next<ChevronRight className="size-4" /></Button>
      </div>
    </div>}
  </section>;
}

/** Online payments stay aggregated as "Online" (never split by rail type); staff-collected rows name the tender. */
function onlineRow(row: { method: string | null }): boolean {
  return row.method === "paystack_link";
}
