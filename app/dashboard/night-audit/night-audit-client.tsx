"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  format,
  parseISO,
  subDays,
} from "date-fns";
import {
  Moon,
  CheckCircle2,
  AlertTriangle,
  BedDouble,
  CalendarArrowDown,
  CalendarArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Lock,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AlertDialog, Button, Chip, ProgressBar, toast } from "@heroui/react";
import { NightAuditSummary, RateDriftReport, executeNightAudit } from "./actions";
import { formatCurrency, formatCurrencyCompact, formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface NightAuditClientProps {
  initialSummary: NightAuditSummary;
  canRunAudit: boolean;
  rateDrift: RateDriftReport;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
  paystack: "Online (Paystack)",
  other: "Other",
};

// ── Small building blocks ──────────────────────────────────────────

function KpiCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-default p-4 min-w-0">
      <p className="text-label text-muted-foreground">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-card px-3 py-2.5 min-w-0">
      <div className="p-1.5 rounded-lg bg-muted/20 shrink-0">
        <Icon className={cn("size-4", tone)} />
      </div>
      <div className="min-w-0">
        <p className="text-caption text-muted-foreground leading-tight truncate">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────

export function NightAuditClient({
  initialSummary,
  canRunAudit,
  rateDrift,
}: NightAuditClientProps) {
  const router = useRouter();
  const [summary, setSummary] = React.useState(initialSummary);
  const [syncedSummary, setSyncedSummary] = React.useState(initialSummary);
  if (syncedSummary !== initialSummary) {
    setSyncedSummary(initialSummary);
    setSummary(initialSummary);
  }
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [isNavigating, startNavigation] = React.useTransition();
  const [auditNotes, setAuditNotes] = React.useState("");

  const navigateToDate = (d: Date) => {
    const next = format(d, "yyyy-MM-dd");
    if (next === summary.auditDate) return;
    startNavigation(() => {
      router.push(`/dashboard/night-audit?date=${next}`);
    });
  };

  const auditDay = React.useMemo(() => parseISO(summary.auditDate + "T00:00:00"), [summary.auditDate]);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const viewingToday = summary.auditDate === todayStr;
  const hasUnresolved = summary.unresolvedBookings.length > 0;
  const hasDrift = !rateDrift.unavailable && rateDrift.rows.length > 0;

  const handleRunAudit = async () => {
    try {
      setIsExecuting(true);
      const res = await executeNightAudit(summary.auditDate, auditNotes.trim() || undefined);
      if (res.success) {
        toast.success(res.message ?? "Day closed");
        setConfirmOpen(false);
        setSummary((prev) => ({
          ...prev,
          isClosed: true,
          lastAudit: {
            staffName: null,
            notes: auditNotes.trim() || null,
            at: new Date().toISOString(),
          },
        }));
        router.refresh();
      } else {
        toast.danger(res.error ?? "Failed to close the day");
      }
    } catch {
      toast.danger("Failed to complete Night Audit");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="size-10 rounded-xl bg-foreground text-background flex items-center justify-center shrink-0">
            <Moon className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-page-title text-foreground">Night Audit</h1>
            <p className="text-body text-muted-foreground mt-0.5">
              Daily reconciliation &amp; close-out for{" "}
              <span className="font-semibold text-foreground">
                {format(auditDay, "EEEE, MMM d, yyyy")}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          {/* Date navigation */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              isIconOnly
              size="sm"
              aria-label="Previous day"
              onPress={() => navigateToDate(subDays(auditDay, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <input
              type="date"
              value={summary.auditDate}
              max={todayStr}
              onChange={(e) => {
                if (!e.target.value) return;
                navigateToDate(parseISO(e.target.value + "T00:00:00"));
              }}
              className="h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
              aria-label="Audit date"
            />
            <Button
              variant="outline"
              isIconOnly
              size="sm"
              aria-label="Next day"
              isDisabled={viewingToday}
              onPress={() => navigateToDate(addDays(auditDay, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            {!viewingToday && (
              <Button variant="ghost" size="sm" onPress={() => navigateToDate(new Date())}>
                Today
              </Button>
            )}
          </div>

          {/* Status / action */}
          {summary.isClosed ? (
            <Chip color="success" variant="soft" className="gap-1.5 px-3 py-1.5 text-sm font-medium shrink-0">
              <CheckCircle2 className="size-4" />
              Closed
            </Chip>
          ) : canRunAudit ? (
            <Button
              variant="primary"
              size="md"
              className="gap-2"
              onPress={() => setConfirmOpen(true)}
            >
              <ShieldCheck className="size-4" />
              Close Day
            </Button>
          ) : (
            <Chip color="warning" variant="soft" className="gap-1.5 px-3 py-1.5 text-sm font-medium shrink-0">
              <Lock className="size-3.5" />
              Manager closes day
            </Chip>
          )}
        </div>
      </div>

      {(isNavigating || isExecuting) && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted/40" role="status" aria-label="Loading">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-gold" />
        </div>
      )}

      {/* ── KPI grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Occupancy">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-kpi text-foreground">{summary.occupancyRate}%</span>
            <span className="text-caption text-muted-foreground tabular-nums">
              {summary.occupiedRooms}/{summary.totalRooms} rooms
            </span>
          </div>
          <ProgressBar
            aria-label={`Occupancy ${summary.occupancyRate}%`}
            value={summary.occupancyRate}
            maxValue={100}
            className="mt-2"
          >
            <ProgressBar.Track className="h-1.5">
              <ProgressBar.Fill className="bg-gold" />
            </ProgressBar.Track>
          </ProgressBar>
          <p className="text-caption text-muted-foreground mt-1.5">
            {summary.vacantRooms} vacant · {summary.outOfService} out of service
          </p>
        </KpiCard>

        <KpiCard label="Est. room revenue">
          <p className="text-kpi text-foreground">
            {formatCurrencyCompact(summary.estimatedRoomRevenue, summary.currency)}
          </p>
          <p className="text-caption text-muted-foreground mt-1">
            From stays active on this date
          </p>
        </KpiCard>

        <KpiCard label="Collected today">
          <p className="text-kpi text-foreground">
            {formatCurrencyCompact(summary.totalPaymentsToday, summary.currency)}
          </p>
          {summary.paymentsByMethod.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {summary.paymentsByMethod.slice(0, 3).map((m) => (
                <li key={m.method} className="flex items-center justify-between gap-2 text-caption">
                  <span className="text-muted-foreground truncate">
                    {METHOD_LABELS[m.method] ?? m.method}
                  </span>
                  <span className="tabular-nums text-foreground font-medium shrink-0">
                    {formatCurrencyCompact(m.amount, summary.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-muted-foreground mt-1">No payments recorded</p>
          )}
        </KpiCard>

        <KpiCard label="ADR · RevPAR">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-kpi text-foreground">
              {formatCurrencyCompact(summary.adrToday, summary.currency)}
            </span>
            <span className="text-caption text-muted-foreground">/</span>
            <span className="text-sm font-semibold text-muted-foreground tabular-nums">
              {formatCurrencyCompact(summary.revparToday, summary.currency)}
            </span>
          </div>
          <p className="text-caption text-muted-foreground mt-1">
            Avg daily rate / revenue per room
          </p>
        </KpiCard>
      </div>

      {/* ── Day operations strip ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={CalendarArrowDown}
          label="Arrivals due"
          value={summary.pendingArrivals}
          tone="text-amber-600"
        />
        <StatTile
          icon={CalendarArrowUp}
          label="Departures due"
          value={summary.pendingDepartures}
          tone="text-rose-600"
        />
        <StatTile icon={Users} label="In-house guests" value={summary.inHouseCount} tone="text-emerald-600" />
        <StatTile icon={BedDouble} label="Rooms occupied" value={summary.occupiedRooms} tone="text-blue-600" />
      </div>

      {/* ── Closed confirmation ────────────────────────────────── */}
      {summary.isClosed && summary.lastAudit && (
        <div className="card-default p-4 flex items-start gap-3 border-emerald-500/25 bg-emerald-500/5">
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-foreground">
              Day closed{summary.lastAudit.staffName ? ` by ${summary.lastAudit.staffName}` : ""}
            </p>
            <p className="text-caption text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Clock3 className="size-3" />
              {formatDateTime(summary.lastAudit.at)}
            </p>
            {summary.lastAudit.notes && (
              <p className="text-body text-muted-foreground mt-1.5 whitespace-pre-wrap break-words">
                “{summary.lastAudit.notes}”
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Unresolved same-day operations ─────────────────────── */}
      {hasUnresolved && !summary.isClosed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="min-w-0 w-full">
            <p className="text-sm font-semibold text-foreground">
              Resolve before closing ({summary.unresolvedBookings.length})
            </p>
            <p className="text-caption text-amber-700 mt-0.5">
              These arrivals or departures are still open for this date.
            </p>

            <ul className="mt-3 divide-y divide-border/50 rounded-xl border border-border/60 bg-background overflow-hidden">
              {summary.unresolvedBookings.map((item) => (
                <li
                  key={item.id}
                  className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 hover:bg-accent/30 transition-colors"
                >
                  <Chip
                    size="sm"
                    color={item.type === "pending_arrival" ? "warning" : "danger"}
                    variant="soft"
                    className="shrink-0"
                  >
                    {item.type === "pending_arrival" ? "Arrival" : "Departure"}
                  </Chip>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-sm font-medium text-foreground truncate">{item.guestName}</p>
                    <p className="text-caption text-muted-foreground truncate">
                      {item.reference} · Room {item.roomNumber ?? "unassigned"}
                    </p>
                  </div>
                  <a
                    href={`/dashboard/bookings/${item.id}`}
                    className="text-xs font-medium text-gold hover:underline shrink-0 py-1"
                  >
                    Manage →
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Rate reconciliation (nights vs booking room charge) ── */}
      {hasDrift && (
        <div className="card-default p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-muted/20 shrink-0">
              <Scale className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 w-full">
              <p className="text-sm font-semibold text-foreground">
                Rate reconciliation ({rateDrift.total})
              </p>
              <p className="text-caption text-muted-foreground mt-0.5">
                The nightly rates recorded on these bookings do not add up to the room charge.
                A discount, a comped night or a tax adjustment explains most of them — closing
                the day is not blocked.
              </p>

              <ul className="mt-3 divide-y divide-border/50 rounded-xl border border-border/60 bg-background overflow-hidden">
                {rateDrift.rows.map((row) => (
                  <li
                    key={row.booking_id}
                    className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 hover:bg-accent/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1 basis-44">
                      <p className="text-sm font-medium text-foreground truncate">{row.reference}</p>
                      <p className="text-caption text-muted-foreground truncate">
                        {formatDate(row.check_in)} — {formatDate(row.check_out)}
                      </p>
                    </div>
                    <Chip
                      size="sm"
                      color={row.nights_recorded === row.nights_expected ? "default" : "warning"}
                      variant="soft"
                      className="shrink-0"
                    >
                      {row.nights_recorded}/{row.nights_expected} nights
                    </Chip>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums shrink-0",
                        row.difference_minor < 0
                          ? "text-amber-600"
                          : "text-foreground"
                      )}
                      title="Recorded nights minus the room charge on the booking"
                    >
                      {row.difference_minor > 0 ? "+" : ""}
                      {formatMoney(row.difference_minor, row.currency)}
                    </p>
                    <a
                      href={`/dashboard/bookings/${row.booking_id}`}
                      className="text-xs font-medium text-gold hover:underline shrink-0 py-1"
                    >
                      Open →
                    </a>
                  </li>
                ))}
              </ul>

              {rateDrift.total > rateDrift.rows.length && (
                <p className="text-caption text-muted-foreground mt-2">
                  Showing the {rateDrift.rows.length} most recent of {rateDrift.total}.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Open-day summary CTA (manager only) ────────────────── */}
      {!summary.isClosed && canRunAudit && (
        <div className="card-default p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-section text-foreground">End of day</h2>
            <p className="text-caption text-muted-foreground mt-1">
              Closing records{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatCurrency(summary.estimatedRoomRevenue, summary.currency)}
              </span>{" "}
              room revenue and{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatCurrency(summary.totalPaymentsToday, summary.currency)}
              </span>{" "}
              collected payments to the permanent audit log.
            </p>
          </div>
          <Button variant="primary" size="md" className="gap-2 shrink-0" onPress={() => setConfirmOpen(true)}>
            <ShieldCheck className="size-4" />
            Run Night Audit
          </Button>
        </div>
      )}

      {/* ── Confirm dialog ─────────────────────────────────────── */}
      <AlertDialog.Backdrop isOpen={confirmOpen} onOpenChange={setConfirmOpen} isDismissable={!isExecuting}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="max-w-lg">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning">
                <Moon className="size-5" />
              </AlertDialog.Icon>
              <AlertDialog.Heading>Close day {summary.auditDate}?</AlertDialog.Heading>
            </AlertDialog.Header>

            <AlertDialog.Body className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border/60 p-3 text-sm">
                <dt className="text-muted-foreground">Room revenue</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {formatCurrency(summary.estimatedRoomRevenue, summary.currency)}
                </dd>
                <dt className="text-muted-foreground">Collected payments</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {formatCurrency(summary.totalPaymentsToday, summary.currency)}
                </dd>
                <dt className="text-muted-foreground">Occupancy</dt>
                <dd className="text-right font-semibold tabular-nums">{summary.occupancyRate}%</dd>
                <dt className="text-muted-foreground">Open arrivals / departures</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {summary.pendingArrivals} / {summary.pendingDepartures}
                </dd>
              </dl>

              {hasUnresolved && (
                <p className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  {summary.unresolvedBookings.length} same-day booking(s) are still unresolved. You can still
                  close the day, but resolve them first if possible.
                </p>
              )}

              <label className="block">
                <span className="text-label text-muted-foreground mb-1 block">Handover notes (optional)</span>
                <textarea
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  placeholder="Anything the morning shift should know…"
                  maxLength={1000}
                  rows={3}
                  className="textarea w-full resize-none text-sm"
                  disabled={isExecuting}
                />
              </label>

              <p className="text-caption text-muted-foreground">
                This entry is permanent and cannot be undone.
              </p>
            </AlertDialog.Body>

            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" isDisabled={isExecuting}>
                Cancel
              </Button>
              <Button variant="primary" isPending={isExecuting} onPress={handleRunAudit}>
                Confirm &amp; Close
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
