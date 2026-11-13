"use client";

import * as React from "react";
import { Alert, Button, Card, Chip, ListBox, SearchField, Select, Skeleton, Tabs } from "@heroui/react";
import { ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";
import { formatCurrency, formatDateInTimeZone } from "@/lib/format";
import { getMethodLabel, PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { cn } from "@/lib/utils";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { PaymentsSettingsClient } from "@/app/dashboard/settings/payments/payments-client";
import { PayoutsPanel } from "@/components/payouts/payouts-panel";
import { PenKpi } from "@/components/ui/pen/pen-kpi";
import { RangeControl } from "@/components/ui/pen/range-control";
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

  // Pending debounced search. Every explicit filter change cancels it: those
  // handlers already send the current text, and a stale timer would replay the
  // filters captured when the text last changed.
  const searchTimer = React.useRef<number | undefined>(undefined);
  const cancelPendingSearch = () => window.clearTimeout(searchTimer.current);

  function applyRange(nextStart: string, nextEnd: string) {
    cancelPendingSearch();
    setStartDate(nextStart); setEndDate(nextEnd); setPage(1);
    router.replace(activityUrl({ tab: "activity", startDate: nextStart, endDate: nextEnd, page: 1 }), { scroll: false });
    void loadActivity({ startDate: nextStart, endDate: nextEnd, page: 1 });
  }

  function applyFilters() {
    cancelPendingSearch();
    setPage(1);
    router.replace(activityUrl({ tab: "activity", page: 1 }), { scroll: false });
    void loadActivity({ page: 1 });
  }

  // Search applies itself after a short pause; Enter applies at once. Only a
  // changed value arms the timer, so mount (and Strict Mode's re-run) doesn't.
  const lastSearch = React.useRef(search);
  React.useEffect(() => {
    if (search === lastSearch.current) return;
    lastSearch.current = search;
    searchTimer.current = window.setTimeout(() => applyFilters(), 400);
    return cancelPendingSearch;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text should re-arm the timer
  }, [search]);

  return <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8" data-payments>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Payments</h1>
      {tab !== "setup" && <RangeControl range={{ startDate, endDate }} today={today} onChange={applyRange} />}
    </header>

    <Tabs variant="secondary" selectedKey={tab} onSelectionChange={(key) => selectTab(key as Tab)} className="w-full gap-0">
      <Tabs.ListContainer className="border-border/70">
        <Tabs.List aria-label="Payment sections" className="gap-6">
          {(["activity", "payouts", ...(canConfigure ? ["setup"] : [])] as Tab[]).map((id) => (
            <Tabs.Tab key={id} id={id}
              className="h-12 w-auto flex-none px-0 text-sm font-medium text-muted-foreground data-[selected=true]:font-semibold data-[selected=true]:text-foreground">
              {id === "activity" ? "Activity" : id === "payouts" ? "Online payouts" : "Setup"}
              <Tabs.Indicator className="rounded-t-sm bg-primary" />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id="activity" className="mt-0 p-0 pt-6"><ActivityView
        activity={activity} error={error} loading={loading} currency={currency} timeZone={timeZone}
        status={status} method={method} search={search} page={page}
        onStatus={(value) => { cancelPendingSearch(); setStatus(value); setPage(1); router.replace(activityUrl({ tab: "activity", status: value, page: 1 }), { scroll: false }); void loadActivity({ status: value, page: 1 }); }}
        onMethod={(value) => { cancelPendingSearch(); setMethod(value); setPage(1); router.replace(activityUrl({ tab: "activity", method: value, page: 1 }), { scroll: false }); void loadActivity({ method: value, page: 1 }); }}
        onSearch={setSearch} onApply={applyFilters}
        onPage={(next) => { cancelPendingSearch(); setPage(next); router.replace(activityUrl({ tab: "activity", page: next }), { scroll: false }); void loadActivity({ page: next }); }}
        onOpenBooking={(id) => { setBookingId(id); setDrawerOpen(true); }}
      /></Tabs.Panel>
      <Tabs.Panel id="payouts" className="mt-0 p-0 pt-6"><PayoutsPanel load={getMyHotelPayouts} timeZone={timeZone} range={{ start: startDate, end: endDate }} /></Tabs.Panel>
      {canConfigure && <Tabs.Panel id="setup" className="mt-0 p-0 pt-6"><PaymentsSettingsClient initialData={initialSetup} /></Tabs.Panel>}
    </Tabs>
    <BookingDetailDrawer bookingId={bookingId} open={drawerOpen} onClose={() => { setDrawerOpen(false); setBookingId(null); }} currency={currency} />
  </div>;
}

function ActivityView({ activity, error, loading, currency, timeZone, status, method, search, page, onStatus, onMethod, onSearch, onApply, onPage, onOpenBooking }: {
  activity: PaymentActivityResult | null; error: string | null; loading: boolean; currency: string; timeZone: string;
  status: PaymentActivityStatus; method: string; search: string; page: number;
  onStatus: (value: PaymentActivityStatus) => void;
  onMethod: (value: string) => void; onSearch: (value: string) => void; onApply: () => void; onPage: (page: number) => void;
  onOpenBooking: (id: string) => void;
}) {
  const methods = [{ value: "all", label: "All methods" }, ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))];
  const totals = activity?.totals;

  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <PenKpi label="Collected" value={formatCurrency(totals?.successfulAmount ?? 0, currency)}
        hint={paymentsLabel(totals?.successfulCount ?? 0)} className="col-span-2 sm:col-span-1" />
      <PenKpi label="Online" value={formatCurrency(totals?.onlineAmount ?? 0, currency)} hint={paymentsLabel(totals?.onlineCount ?? 0)} />
      <PenKpi label="By staff" value={formatCurrency(totals?.staffAmount ?? 0, currency)} hint={paymentsLabel(totals?.staffCount ?? 0)} />
    </div>

    {error && (
      <Alert status="danger" className="rounded-2xl">
        <Alert.Indicator />
        <Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content>
      </Alert>
    )}

    <LedgerCard
      activity={activity} loading={loading} timeZone={timeZone}
      status={status} method={method} search={search} page={page} methods={methods}
      onStatus={onStatus} onMethod={onMethod} onSearch={onSearch} onApply={onApply} onPage={onPage} onOpenBooking={onOpenBooking}
    />
  </div>;
}

/** Shared column template for the ledger header band and rows (md and up). */
const LEDGER_GRID = "md:grid md:grid-cols-[8rem_minmax(0,1.4fr)_8rem_7rem_minmax(0,1fr)] md:items-center md:gap-4";

function LedgerCard({ activity, loading, timeZone, status, method, search, page, methods, onStatus, onMethod, onSearch, onApply, onPage, onOpenBooking }: {
  activity: PaymentActivityResult | null; loading: boolean; timeZone: string;
  status: PaymentActivityStatus; method: string; search: string; page: number;
  methods: { value: string; label: string }[];
  onStatus: (value: PaymentActivityStatus) => void;
  onMethod: (value: string) => void; onSearch: (value: string) => void; onApply: () => void; onPage: (page: number) => void;
  onOpenBooking: (id: string) => void;
}) {
  const rows = activity?.rows ?? [];
  return <Card className="gap-0 overflow-hidden rounded-3xl border border-border/60 p-0 shadow-[0_1px_2px_rgb(15_23_42/0.04)]" aria-label="Payment ledger">
    {/* Toolbar */}
    <div className="grid grid-cols-2 gap-2 p-4 sm:flex sm:items-center sm:px-6">
      <SearchField aria-label="Search payments" value={search} onChange={onSearch} onSubmit={onApply} className="col-span-2 min-w-0 sm:mr-auto sm:w-72">
        <SearchField.Group className="rounded-xl max-sm:h-11">
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search guest or reference" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <FilterSelect label="Payment status" value={status} onChange={(v) => onStatus(v as PaymentActivityStatus)}
        options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
      <FilterSelect label="Payment method" value={method} onChange={onMethod} options={methods} />
    </div>

    {/* Column header band */}
    <div aria-hidden="true" className={cn(LEDGER_GRID, "hidden border-y border-border/50 bg-secondary/40 px-6 py-2 text-2xs font-medium text-muted-foreground")}>
      <span>Time</span><span>Guest</span><span className="text-right">Amount</span><span>Status</span><span>Recorded by</span>
    </div>

    <div className={cn("transition-opacity duration-150", loading && "opacity-60")} aria-busy={loading}>
      {loading && !activity ? (
        <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
      ) : rows.length ? (
        <ul className="divide-y divide-border/50 border-t border-border/50 md:border-t-0">
          {rows.map((row) => {
            const online = onlineRow(row);
            const time = row.paidAt ? formatDateInTimeZone(row.paidAt, timeZone, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
            const open = row.bookingId ? () => onOpenBooking(row.bookingId!) : undefined;
            const phoneSummary = <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground">{row.guestName ?? "Guest"}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.amount, row.currency)}</span>
              </span>
              <span className="flex items-center justify-between gap-3">
                <span className="truncate text-xs text-muted-foreground">{time} · {online ? "Online" : getMethodLabel(row.method)}</span>
                <Chip size="sm" variant="soft" color={statusTone(row.status)}>{statusLabel(row.status)}</Chip>
              </span>
            </>;
            return <li key={row.id}
              onClick={open}
              className={cn(LEDGER_GRID, "flex flex-col gap-1 px-4 py-3 sm:px-6", open && "cursor-pointer transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/50")}>
              {/* Phones: guest + amount on top, method + status below. A real button
                  when the row opens a booking, so keyboard and screen-reader users can too. */}
              {open ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); open(); }}
                  className="flex w-full flex-col gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
                  {phoneSummary}
                </button>
              ) : <span className="flex flex-col gap-1 md:hidden">{phoneSummary}</span>}

              <div className="hidden min-w-0 md:block">
                <p className="text-sm tabular-nums text-foreground">{time}</p>
                <p className="mt-1 text-xs text-muted-foreground">{online ? "Online" : getMethodLabel(row.method)}</p>
              </div>
              <div className="hidden min-w-0 md:block">
                {open ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); open(); }}
                    className="max-w-full truncate rounded-sm text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {row.guestName ?? "Guest"}
                  </button>
                ) : <p className="truncate text-sm font-medium text-foreground">{row.guestName ?? "Guest"}</p>}
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{row.bookingReference ?? "—"}</p>
              </div>
              <p className="hidden text-right text-sm font-semibold tabular-nums text-foreground md:block">{formatCurrency(row.amount, row.currency)}</p>
              <div className="hidden md:block"><Chip size="sm" variant="soft" color={statusTone(row.status)}>{statusLabel(row.status)}</Chip></div>
              <p className="hidden truncate text-sm text-muted-foreground md:block">{online ? "Online" : row.recordedBy ?? "—"}</p>
            </li>;
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 border-t border-border/50 px-6 py-16 text-center md:border-t-0">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground"><ReceiptText className="size-5" aria-hidden="true" /></span>
          <p className="text-sm font-semibold text-foreground">No payments here</p>
          <p className="text-xs text-muted-foreground">Try another date range or filter.</p>
        </div>
      )}
    </div>

    {activity && (page > 1 || activity.hasNextPage) && <div className="flex items-center justify-between gap-3 border-t border-border/50 px-4 py-3 sm:px-6">
      <span className="text-xs tabular-nums text-muted-foreground">Page {page}</span>
      <div className="flex gap-2">
        <Button isIconOnly variant="secondary" aria-label="Previous page" className="rounded-xl max-md:size-11" isDisabled={page <= 1 || loading} onPress={() => onPage(page - 1)}><ChevronLeft className="size-4" /></Button>
        <Button isIconOnly variant="secondary" aria-label="Next page" className="rounded-xl max-md:size-11" isDisabled={!activity.hasNextPage || loading} onPress={() => onPage(page + 1)}><ChevronRight className="size-4" /></Button>
      </div>
    </div>}
  </Card>;
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[];
}) {
  return <Select aria-label={label} value={value} onChange={(v) => v && onChange(String(v))} className="min-w-0 sm:w-40">
    <Select.Trigger className="min-h-11 rounded-xl sm:min-h-10">
      <Select.Value />
      <Select.Indicator />
    </Select.Trigger>
    <Select.Popover>
      <ListBox>
        {options.map((o) => <ListBox.Item key={o.value} id={o.value} textValue={o.label}>{o.label}<ListBox.ItemIndicator /></ListBox.Item>)}
      </ListBox>
    </Select.Popover>
  </Select>;
}

function paymentsLabel(count: number): string {
  return `${count.toLocaleString("en")} ${count === 1 ? "payment" : "payments"}`;
}

/** Online payments stay aggregated as "Online" (never split by rail type); staff-collected rows name the tender. */
function onlineRow(row: { method: string | null }): boolean {
  return row.method === "paystack_link";
}
