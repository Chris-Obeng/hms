"use client";

import * as React from "react";
import { Button, Chip, Pagination, Skeleton, Table } from "@heroui/react";
import { RotateCw, Wallet } from "lucide-react";
import { CalendarDate, today } from "@internationalized/date";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { formatDateInTimeZone } from "@/lib/format";
import type { HotelPayoutOverview, PayoutReservation } from "@/lib/payouts";
import { PaymentDateField } from "@/components/ui/payment-date-field";
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

const SCHEDULE_LABELS: Record<string, string> = {
  auto: "Automatic · T+1",
  weekly: "Weekly",
  monthly: "Monthly",
  manual: "Manual",
};

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
}

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: HotelPayoutOverview };

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "default";
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "success"
            ? "text-emerald-600"
            : "text-foreground"
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</p>
      ) : null}
    </div>
  );
}

export function PayoutsPanel({
  load,
  active = true,
  initialData,
  onGoToSetup,
  timeZone = "UTC",
}: Props) {
  // Default range = the last 30 days (inclusive of today), matching the
  // server's fallback window so a server-rendered first page isn't refetched.
  const todayCd = React.useMemo(() => today(timeZone), [timeZone]);
  const [range, setRange] = React.useState<{ start: CalendarDate; end: CalendarDate }>(
    () => ({ start: todayCd.subtract({ days: 29 }), end: todayCd })
  );

  const [state, setState] = React.useState<ViewState>(
    initialData ? { kind: "ready", data: initialData } : { kind: "loading" }
  );
  // Keep the current table on screen while a new range is fetched.
  const [refreshing, setRefreshing] = React.useState(false);
  const requestId = React.useRef(0);
  // The range we've already loaded, so re-showing the tab doesn't refetch and a
  // server-rendered first range is trusted until the user changes it.
  const rangeKey = `${cdToISO(range.start)}|${cdToISO(range.end)}`;
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
    void runLoad(range);
  }, [active, rangeKey, range, runLoad]);

  const retry = React.useCallback(() => void runLoad(range), [runLoad, range]);

  // First load, nothing to show yet.
  if (state.kind === "loading") return <PayoutsSkeleton />;

  if (state.kind === "error")
    return <ErrorState message={state.message} onRetry={retry} pending={refreshing} />;

  const { data } = state;

  // No Paystack subaccount connected → payment setup incomplete.
  if (!data.setupComplete) return <NotSetUpState onGoToSetup={onGoToSetup} />;

  const { summary, reservations } = data;
  const scheduleLabel = SCHEDULE_LABELS[summary.schedule ?? ""] ?? "Automatic · T+1";
  const rangeText = rangeLabel(summary.fromISO, summary.toISO, timeZone);

  return (
    <div className="space-y-5">
      {/* Schedule + date-range control */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="soft" color="default">{scheduleLabel}</Chip>
            {summary.destination ? <span className="text-caption text-muted-foreground">{summary.destination}</span> : null}
          </div>
          {data.error ? (
            <span className="text-[11px] text-amber-600">
              Payout status may be delayed
            </span>
          ) : null}
        </div>
        <PayoutRangeControl value={range} onChange={setRange} pending={refreshing} timeZone={timeZone} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Paid out"
          value={formatMoney(summary.paidOutMinor, summary.currency)}
          hint={`Settled to your bank · ${rangeText}`}
          tone="success"
        />
        <StatCard
          label="Awaiting payout"
          value={formatMoney(summary.awaitingMinor, summary.currency)}
          hint="In transit or not yet settled"
        />
        <StatCard
          label="Failed"
          value={formatMoney(summary.failedMinor, summary.currency)}
          hint="Needs review"
        />
      </div>

      {/* Reservations */}
      {reservations.length === 0 ? (
        <NoBookingsState rangeText={rangeText} />
      ) : (
        <ReservationList key={rangeKey} reservations={reservations} timeZone={timeZone} />
      )}
    </div>
  );
}

function PayoutRangeControl({
  value,
  onChange,
  pending,
  timeZone,
}: {
  value: { start: CalendarDate; end: CalendarDate };
  onChange: (range: { start: CalendarDate; end: CalendarDate }) => void;
  pending?: boolean;
  timeZone: string;
}) {
  // Past-only: a payout can never settle in the future.
  const maxCd = React.useMemo(() => today(timeZone), [timeZone]);
  const maxISO = cdToISO(maxCd);
  const startISO = cdToISO(value.start);
  const endISO = cdToISO(value.end);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {pending ? <RotateCw className="hidden size-3.5 animate-spin text-muted-foreground/60 sm:block" aria-label="Updating payouts" /> : null}
      <PaymentDateField
        label="From"
        value={startISO}
        max={endISO < maxISO ? endISO : maxISO}
        onSelect={(next) => onChange({ start: isoToCD(next), end: value.end })}
      />
      <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">–</span>
      <PaymentDateField
        label="To"
        value={endISO}
        min={startISO}
        max={maxISO}
        onSelect={(next) => onChange({ start: value.start, end: isoToCD(next) })}
      />
    </div>
  );
}

function PayoutsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function StateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card px-6 py-16 text-center shadow-sm">
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
        <RotateCw className="size-3.5" />
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
      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {pageRows.map((r) => (
          <ReservationCardMobile key={r.key} r={r} timeZone={timeZone} />
        ))}
      </div>

      {/* Desktop table */}
      <Table variant="secondary" className="hidden md:block">
        <Table.ScrollContainer>
          <Table.Content aria-label="Online reservations" className="min-w-[720px]">
            <Table.Header>
              <Table.Column isRowHeader>Guest</Table.Column>
              <Table.Column>Rooms</Table.Column>
              <Table.Column>Paid</Table.Column>
              <Table.Column>Amount</Table.Column>
              <Table.Column>Payout</Table.Column>
            </Table.Header>
            <Table.Body>
              {pageRows.map((r) => (
                <Table.Row key={r.key} id={r.key}>
                  <Table.Cell>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-medium text-foreground">
                        {r.guestName ?? "Guest"}
                      </span>
                      <span className="font-mono text-caption tracking-wide text-muted-foreground">
                        {r.reference}
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="tabular-nums text-muted-foreground">
                    {r.roomsCount}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-muted-foreground">
                    {formatDateInTimeZone(r.paidAt, timeZone)}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-body font-medium tabular-nums text-foreground">
                    {formatMoney(r.amountMinor, r.currency)}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col gap-0.5">
                      <PayoutStatusBadge status={r.status} />
                      {r.settledAt ? (
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatDateInTimeZone(r.settledAt, timeZone)}
                        </span>
                      ) : null}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

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
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
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
            Settled {formatDateInTimeZone(r.settledAt, timeZone)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
