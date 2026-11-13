"use client";

import * as React from "react";
import { Button, Pagination, Skeleton } from "@heroui/react";
import { Banknote, RotateCw, TriangleAlert, Wallet, XCircle } from "lucide-react";
import { CalendarDate, today } from "@internationalized/date";
import { formatMoney } from "@/lib/money";
import { formatDateInTimeZone } from "@/lib/format";
import type { HotelPayoutOverview, PayoutReservation } from "@/lib/payouts";
import { PenKpi } from "@/components/ui/pen/pen-kpi";
import { PayoutStatusBadge } from "./payout-status-badge";

/**
 * Shared payout view for both surfaces (hotel Payouts tab + platform hotel
 * detail). It does no auth and knows no hotel id: it takes a bound loader that
 * returns an already-scoped overview, so the caller owns the security boundary.
 */
type PayoutResult =
  | { success: true; data: HotelPayoutOverview }
  | { success: false; error: string };

/** CalendarDate → yyyy-mm-dd, the wire format both payout server actions take. */
function cdToISO(cd: CalendarDate): string {
  return `${cd.year}-${String(cd.month).padStart(2, "0")}-${String(cd.day).padStart(2, "0")}`;
}

function isoToCD(value: string): CalendarDate {
  const [year, month, day] = value.split("-").map(Number);
  return new CalendarDate(year, month, day);
}

/** Human label for a from/to ISO pair, e.g. "12 Aug – 10 Sep 2026". */
function rangeLabel(fromISO: string, toISO: string, timeZone: string): string {
  return `${formatDateInTimeZone(fromISO, timeZone, { day: "2-digit", month: "short" })} – ${formatDateInTimeZone(toISO, timeZone, { day: "2-digit", month: "short", year: "numeric" })}`;
}

interface Props {
  /** Bound server action: date range → payout overview for one hotel. */
  load: (range: { from: string; to: string }) => Promise<PayoutResult>;
  /** Defer the first fetch until the containing tab is shown. Default true. */
  active?: boolean;
  initialData?: HotelPayoutOverview;
  /** Hotel side links back to the Settings tab when the bank isn't connected. */
  onGoToSetup?: () => void;
  /** Property timezone used for calendar bounds and payout timestamps. */
  timeZone?: string;
  /** Optional externally owned window (ISO dates) from the page header chip. */
  range?: { start: string; end: string };
}

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: HotelPayoutOverview };

const PAYOUT_COLUMNS = [
  { label: "Reservation", width: "1fr" },
  { label: "Paid", width: "120px" },
  { label: "Rooms", width: "70px", align: "right" as const },
  { label: "Amount", width: "140px", align: "right" as const },
  { label: "Settles", width: "120px" },
  { label: "Status", width: "130px" },
];

export function PayoutsPanel({
  load,
  active = true,
  initialData,
  onGoToSetup,
  timeZone = "UTC",
  range,
}: Props) {
  // Default range = the last 30 days (inclusive of today), matching the
  // server's fallback window so a server-rendered first page isn't refetched.
  const todayCd = React.useMemo(() => today(timeZone), [timeZone]);
  const [ownRange] = React.useState<{ start: CalendarDate; end: CalendarDate }>(
    () => ({ start: todayCd.subtract({ days: 29 }), end: todayCd })
  );
  const effective = React.useMemo(
    () =>
      range
        ? { start: isoToCD(range.start), end: isoToCD(range.end) }
        : ownRange,
    [range, ownRange]
  );

  const [state, setState] = React.useState<ViewState>(
    initialData ? { kind: "ready", data: initialData } : { kind: "loading" }
  );
  // Keep the current table on screen while a new range is fetched.
  const [refreshing, setRefreshing] = React.useState(false);
  const requestId = React.useRef(0);
  // The range we've already loaded, so re-showing the tab doesn't refetch and a
  // server-rendered first range is trusted until the user changes it.
  const rangeKey = `${cdToISO(effective.start)}|${cdToISO(effective.end)}`;
  const loadedKey = React.useRef<string | null>(initialData ? rangeKey : null);

  const runLoad = React.useCallback(
    async (r: { start: CalendarDate; end: CalendarDate }) => {
      const currentRequest = ++requestId.current;
      setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));
      setRefreshing(true);
      const result = await load({ from: cdToISO(r.start), to: cdToISO(r.end) });
      if (currentRequest !== requestId.current) return;
      if (result.success) setState({ kind: "ready", data: result.data });
      else setState({ kind: "error", message: result.error });
      setRefreshing(false);
    },
    [load]
  );

  React.useEffect(() => {
    if (!active) return;
    if (loadedKey.current === rangeKey) return;
    loadedKey.current = rangeKey;
    void runLoad(effective);
  }, [active, rangeKey, effective, runLoad]);

  const retry = React.useCallback(() => void runLoad(effective), [runLoad, effective]);

  // First load, nothing to show yet.
  if (state.kind === "loading") return <PayoutsSkeleton />;

  if (state.kind === "error")
    return <ErrorState message={state.message} onRetry={retry} pending={refreshing} />;

  const { data } = state;

  // No Paystack subaccount connected → payment setup incomplete.
  if (!data.setupComplete) return <NotSetUpState onGoToSetup={onGoToSetup} />;

  const { summary, reservations } = data;
  const windowLabel = rangeLabel(summary.fromISO, summary.toISO, timeZone);

  return (
    <div className="space-y-4">
      {/* Stats: paid out, awaiting, failed. No schedule or destination info —
          Paystack's automatic T+1 is the default, not a user choice. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PenKpi label="Paid out" value={formatMoney(summary.paidOutMinor, summary.currency)} icon={Banknote} hint={`Settled to your bank · ${windowLabel}`} />
        <PenKpi label="Awaiting payout" value={formatMoney(summary.awaitingMinor, summary.currency)} icon={TriangleAlert} chipTone="warning" hint="In transit or not yet settled" />
        <PenKpi label="Failed" value={formatMoney(summary.failedMinor, summary.currency)} icon={XCircle} chipTone="danger" hint="Needs review" />
      </div>
      {data.error ? (
        <p className="text-[11px] text-amber-600">Payout status may be delayed</p>
      ) : null}

      {/* Reservations */}
      {reservations.length === 0 ? (
        <NoBookingsState rangeText={windowLabel} />
      ) : (
        <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_2px_4px_rgb(0_0_0/0.04)]" aria-label="Payout reservations">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-[15px] font-semibold text-foreground">Payout reservations</h2>
              <p className="text-xs text-muted-foreground">Charges in the window and where each settles.</p>
            </div>
            <p className="shrink-0 font-mono text-xs text-muted-foreground">{reservations.length.toLocaleString("en")} reservations</p>
          </header>
          <ReservationList key={rangeKey} reservations={reservations} timeZone={timeZone} />
        </section>
      )}
    </div>
  );
}

function PayoutsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-[104px] rounded-3xl" />
        <Skeleton className="h-[104px] rounded-3xl" />
        <Skeleton className="h-[104px] rounded-3xl" />
      </div>
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  );
}

function StateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl bg-card px-6 py-16 text-center shadow-[0_2px_4px_rgb(0_0_0/0.04)]">
      {children}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  pending,
}: {
  message: string;
  onRetry: () => void;
  pending?: boolean;
}) {
  return (
    <StateShell>
      <Wallet className="mb-3 size-10 text-muted-foreground/30" aria-hidden />
      <p className="text-body font-medium text-foreground">Couldn&rsquo;t load payout status</p>
      <p className="mt-1 max-w-[320px] text-caption text-muted-foreground/70">
        Paystack didn&rsquo;t respond. Your payouts are unaffected — this is only the view.
      </p>
      <p className="mt-1 max-w-[320px] truncate text-[11px] text-muted-foreground/50">{message}</p>
      <Button size="sm" variant="outline" className="mt-4 rounded-xl" isPending={pending} onPress={onRetry}>
        <RotateCw className="size-4" />
        Retry
      </Button>
    </StateShell>
  );
}

function NotSetUpState({ onGoToSetup }: { onGoToSetup?: () => void }) {
  return (
    <StateShell>
      <Wallet className="mb-3 size-10 text-muted-foreground/30" aria-hidden />
      <p className="text-body font-medium text-foreground">Payments not set up</p>
      <p className="mt-1 max-w-[320px] text-caption text-muted-foreground/70">
        Connect a Paystack bank account to take online bookings and receive payouts.
      </p>
      {onGoToSetup ? (
        <Button size="sm" className="mt-4 rounded-xl" onPress={onGoToSetup}>
          Go to setup
        </Button>
      ) : null}
    </StateShell>
  );
}

function NoBookingsState({ rangeText }: { rangeText: string }) {
  return (
    <StateShell>
      <Wallet className="mb-3 size-10 text-muted-foreground/30" aria-hidden />
      <p className="text-body font-medium text-foreground">No online bookings</p>
      <p className="mt-1 max-w-[320px] text-caption text-muted-foreground/70">
        No paid website reservations for {rangeText}. Try a wider date range.
      </p>
    </StateShell>
  );
}

function ReservationList({ reservations, timeZone }: { reservations: PayoutReservation[]; timeZone: string }) {
  const PAGE_SIZE = 10;
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(reservations.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const startIdx = (current - 1) * PAGE_SIZE;
  const pageRows = reservations.slice(startIdx, startIdx + PAGE_SIZE);
  const showPagination = reservations.length > PAGE_SIZE;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden rounded-[20px] bg-secondary p-1 pt-0 md:block">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <caption className="sr-only">Payout reservations</caption>
          <thead><tr>
            {PAYOUT_COLUMNS.map((column, index) => <th key={column.label + index} scope="col"
              className={`border-b border-border/70 px-4 py-3 text-left text-xs font-medium text-muted-foreground ${column.align === "right" ? "text-right" : ""}`}>
              {column.label}
            </th>)}
          </tr></thead>
          <tbody>
            {pageRows.map((r) => <tr key={r.key} className="border-b border-border/50 bg-card last:border-b-0">
              <td className="px-4 py-3 align-top">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium text-foreground">{r.guestName ?? "Guest"}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{r.reference}</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 align-top">{r.paidAt ? formatDateInTimeZone(r.paidAt, timeZone, { month: "short", day: "numeric" }) : "—"}</td>
              <td className="px-4 py-3 text-right align-top font-mono tabular-nums text-muted-foreground">{r.roomsCount}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right align-top font-mono font-semibold tabular-nums text-foreground">{formatMoney(r.amountMinor, r.currency)}</td>
              <td className="whitespace-nowrap px-4 py-3 align-top">{r.settledAt ? formatDateInTimeZone(r.settledAt, timeZone, { month: "short", day: "numeric" }) : "—"}</td>
              <td className="px-4 py-3 align-top"><PayoutStatusBadge status={r.status} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {pageRows.map((r) => (
          <ReservationCardMobile key={r.key} r={r} timeZone={timeZone} />
        ))}
      </div>

      {showPagination ? (
        <ReservationPagination
          page={current}
          totalPages={totalPages}
          startIdx={startIdx}
          pageSize={PAGE_SIZE}
          total={reservations.length}
          onPage={setPage}
        />
      ) : null}
    </>
  );
}

function ReservationPagination({
  page,
  totalPages,
  startIdx,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  startIdx: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <Pagination className="justify-between gap-4">
      <Pagination.Summary className="order-2 text-caption tabular-nums text-muted-foreground sm:order-1">
        {startIdx + 1}–{Math.min(startIdx + pageSize, total)} of {total.toLocaleString()}
      </Pagination.Summary>
      <Pagination.Content className="order-1 sm:order-2">
        <Pagination.Item>
          <Pagination.Previous
            onPress={() => onPage(page - 1)}
            isDisabled={page <= 1}
            aria-label="Previous page"
          >
            <Pagination.PreviousIcon />
          </Pagination.Previous>
        </Pagination.Item>
        <Pagination.Item>
          <Pagination.Link isActive aria-current="page" aria-label={`Page ${page} of ${totalPages}`}>
            {page}
          </Pagination.Link>
        </Pagination.Item>
        <Pagination.Item>
          <span className="px-1 text-xs tabular-nums text-muted-foreground">of {totalPages}</span>
        </Pagination.Item>
        <Pagination.Item>
          <Pagination.Next
            onPress={() => onPage(page + 1)}
            isDisabled={page >= totalPages}
            aria-label="Next page"
          >
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}

function ReservationCardMobile({ r, timeZone }: { r: PayoutReservation; timeZone: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-[0_2px_4px_rgb(0_0_0/0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-foreground">
            {r.guestName ?? "Guest"}
          </p>
          <p className="font-mono text-caption tracking-wide text-muted-foreground">
            {r.reference}
          </p>
        </div>
        <PayoutStatusBadge status={r.status} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-body font-semibold tabular-nums text-foreground">
            {formatMoney(r.amountMinor, r.currency)}
          </span>
          <span className="text-caption text-muted-foreground">
            Paid {formatDateInTimeZone(r.paidAt, timeZone)}
            {r.roomsCount > 1 ? ` · ${r.roomsCount} rooms` : ""}
          </span>
        </div>
        {r.settledAt ? (
          <span className="text-[11px] text-muted-foreground/60">
            Settles {formatDateInTimeZone(r.settledAt, timeZone)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
