"use client";

import * as React from "react";
import { Tabs, Button, Chip } from "@heroui/react";
import { CalendarDays, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";
import { formatCurrency, formatDateInTimeZone } from "@/lib/format";
import { getMethodLabel, PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { HeroSelectField } from "@/components/ui/hero-select";
import { PaymentDateField } from "@/components/ui/payment-date-field";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { PaymentsSettingsClient } from "@/app/dashboard/settings/payments/payments-client";
import { PayoutsPanel } from "@/components/payouts/payouts-panel";
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
    <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-page-title">Payments</h1>
        <p className="mt-1 max-w-xl text-body text-muted-foreground">See what was recorded, what will settle, and where guests pay.</p>
      </div>
    </header>

    <Tabs variant="secondary" selectedKey={tab} onSelectionChange={(key) => selectTab(key as Tab)} className="payments-tabs">
      <Tabs.ListContainer><Tabs.List aria-label="Payment sections">
        <Tabs.Tab id="activity">Payment activity<Tabs.Indicator /></Tabs.Tab>
        <Tabs.Tab id="payouts">Online payouts<Tabs.Indicator /></Tabs.Tab>
        {canConfigure && <Tabs.Tab id="setup">Setup<Tabs.Indicator /></Tabs.Tab>}
      </Tabs.List></Tabs.ListContainer>
      <Tabs.Panel id="activity" className="pt-5"><ActivityView
        activity={activity} error={error} loading={loading} startDate={startDate} endDate={endDate} today={today}
        status={status} method={method} search={search} page={page} onStartDate={(value) => applyRange(value, endDate)} onEndDate={(value) => applyRange(startDate, value)}
        onStatus={(value) => { setStatus(value); setPage(1); }} onMethod={(value) => { setMethod(value); setPage(1); }} onSearch={setSearch} onApply={applyFilters}
         onPage={(next) => { setPage(next); router.replace(activityUrl({ tab: "activity", page: next }), { scroll: false }); void loadActivity({ page: next }); }} onOpenBooking={(id) => { setBookingId(id); setDrawerOpen(true); }} currency={currency} timeZone={timeZone}
      /></Tabs.Panel>
     <Tabs.Panel id="payouts" className="pt-5"><PayoutsPanel load={getMyHotelPayouts} timeZone={timeZone} /></Tabs.Panel>
      {canConfigure && <Tabs.Panel id="setup" className="pt-5"><PaymentsSettingsClient initialData={initialSetup} /></Tabs.Panel>}
    </Tabs>
    <BookingDetailDrawer bookingId={bookingId} open={drawerOpen} onClose={() => { setDrawerOpen(false); setBookingId(null); }} currency={currency} />
     <p className="text-caption text-muted-foreground">Dates use the property timezone: {timeZone}</p>
   </div>;
}

function ActivityView({ activity, error, loading, startDate, endDate, today, status, method, search, page, onStartDate, onEndDate, onStatus, onMethod, onSearch, onApply, onPage, onOpenBooking, currency, timeZone }: {
  activity: PaymentActivityResult | null; error: string | null; loading: boolean; startDate: string; endDate: string; today: string; status: PaymentActivityStatus; method: string; search: string; page: number;
  onStartDate: (value: string) => void; onEndDate: (value: string) => void; onStatus: (value: PaymentActivityStatus) => void; onMethod: (value: string) => void; onSearch: (value: string) => void; onApply: () => void; onPage: (page: number) => void; onOpenBooking: (id: string) => void; currency: string; timeZone: string;
}) {
  const methods = [{ value: "all", label: "All methods" }, ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))];
  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
      <div className="payments-total-block rounded-2xl border border-border/60 bg-card p-5">
        <p className="text-label text-muted-foreground">Recorded for this day</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{formatCurrency(activity?.totals.successfulAmount ?? 0, currency)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{activity?.totals.successfulCount ?? 0} successful payments</p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-label text-muted-foreground">Date</p><p className="mt-1 text-sm font-medium">Choose the day to reconcile</p></div>
          <CalendarDays className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <PaymentDateField label="From" value={startDate} max={endDate > today ? today : endDate} onSelect={onStartDate} />
          <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">–</span>
          <PaymentDateField label="To" value={endDate} min={startDate} max={today} onSelect={onEndDate} />
        </div>
      </div>
    </div>
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
      <input value={search} onChange={(event) => onSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onApply(); }} placeholder="Search guest, booking, or Paystack reference" className="h-10 rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <HeroSelectField value={status} onValueChange={(value) => onStatus(value as PaymentActivityStatus)} options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} ariaLabel="Payment status" />
      <HeroSelectField value={method} onValueChange={onMethod} options={methods} ariaLabel="Payment method" />
      <Button variant="secondary" onPress={onApply} isPending={loading}>Apply</Button>
    </div>
    {error ? <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger" role="alert">{error}</div> : null}
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead><tr className="border-b border-border/60 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Paid at</th><th className="px-4 py-3">Guest</th><th className="px-4 py-3">Booking</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Recorded by</th><th className="px-4 py-3" /></tr></thead><tbody>
       {loading && !activity ? <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Loading payments…</td></tr> : activity?.rows.length ? activity.rows.map((row) => <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30"><td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">{row.paidAt ? formatDateInTimeZone(row.paidAt, timeZone, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</td><td className="px-4 py-3 font-medium">{row.guestName ?? "Guest"}</td><td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.bookingReference ?? "—"}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(row.amount, row.currency)}</td><td className="px-4 py-3 text-muted-foreground">{getMethodLabel(row.method)}</td><td className="px-4 py-3"><Chip size="sm" variant="soft" color={statusTone(row.status)}>{statusLabel(row.status)}</Chip></td><td className="px-4 py-3 text-muted-foreground">{row.recordedBy ?? (row.paystackReference ? "Online" : "—")}</td><td className="px-4 py-3">{row.bookingId && <Button isIconOnly variant="ghost" size="sm" aria-label={`View booking ${row.bookingReference ?? ""}`} onPress={() => onOpenBooking(row.bookingId!)}><Eye className="size-4" /></Button>}</td></tr>) : <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No payments match this view.</td></tr>}
      </tbody></table></div>
      {activity && <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Page {page} · {activity.totalCount.toLocaleString()} records</span><div className="flex gap-2"><Button variant="outline" size="sm" isDisabled={page <= 1 || loading} onPress={() => onPage(page - 1)}><ChevronLeft className="size-3.5" />Previous</Button><Button variant="outline" size="sm" isDisabled={!activity.hasNextPage || loading} onPress={() => onPage(page + 1)}>Next<ChevronRight className="size-3.5" /></Button></div></div>}
    </div>
  </div>;
}
