"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button, toast } from "@heroui/react";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Globe, ReceiptText, Wallet } from "lucide-react";
import { executeNightAudit } from "./actions";
import { PaymentDateField } from "@/components/ui/payment-date-field";
import { PenKpi } from "@/components/ui/pen/pen-kpi";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
import { DonutRing } from "@/components/ui/pen/donut-ring";
import { NotesDisclosure } from "@/components/ui/notes-disclosure";
import { Textarea } from "@/components/ui/textarea";
import { MIN_AUDIT_DATE, type NightAuditSummary } from "@/lib/night-audit/summary";
import { formatCurrency, formatDate } from "@/lib/format";

function shiftDay(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timestamp(value: string | null, timeZone: string | null): string {
  if (!value) return "Timestamp not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timeZone ?? "UTC" }).format(new Date(value));
}

/** Bounds the navigation lock so a failed push cannot leave every control disabled forever. */
const NAVIGATION_TIMEOUT_MS = 15_000;

type AttentionItem =
  | { kind: "arrival" | "departure"; id: string; title: string; detail: string; href: string }
  | { kind: "charge"; id: string; title: string; detail: string; href: string };

/** Design-file tender palette: online stays aggregated; staff-collected splits by type. */
const TENDER_COLORS: Record<string, string> = {
  paystack_link: "var(--pen-accent)",
  cash: "#94a3b8",
  mobile_money: "#14b8a6",
  card: "#f59e0b",
  bank_transfer: "#8b5cf6",
  pos: "#f59e0b",
};

const TENDER_SHORT_LABELS: Record<string, string> = {
  paystack_link: "Online",
  cash: "Cash",
  mobile_money: "MoMo",
  card: "Card",
  bank_transfer: "Bank",
  pos: "POS",
};

export function NightAuditClient({ initialSummary, roomRevenueInclTax, canRunAudit }: {
  initialSummary: NightAuditSummary;
  roomRevenueInclTax: number | null;
  canRunAudit: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = React.useState(initialSummary);
  const [previousInitial, setPreviousInitial] = React.useState(initialSummary);
  if (previousInitial !== initialSummary) {
    setPreviousInitial(initialSummary);
    setSummary(initialSummary);
  }
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [isNavigating, setIsNavigating] = React.useState(false);
  const navigationTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => () => { if (navigationTimer.current) clearTimeout(navigationTimer.current); }, []);
  const busy = isExecuting || isNavigating;
  const money = (value: number | null) => value === null || !summary.currency ? "Unavailable" : formatCurrency(value, summary.currency);
  const moneyWhole = (value: number) => value.toLocaleString("en", { maximumFractionDigits: 0 });
  const unresolved = (summary.pendingArrivals ?? 0) + (summary.pendingDepartures ?? 0);
  const blockers = unresolved + (summary.rateIssues ?? 0) + (summary.paymentIssues ?? 0);
  const waitingForMidnight = !summary.isClosed && blockers === 0 && summary.auditDate >= summary.propertyToday;
  const canClose = !summary.isClosed && blockers === 0 && summary.auditDate < summary.propertyToday && canRunAudit;
  const online = summary.paymentsByMethod.find((method) => method.method === "paystack_link");
  const staff = summary.paymentsByMethod.filter((method) => method.method !== "paystack_link");

  function navigate(date: string) {
    if (!date || date < MIN_AUDIT_DATE || date > summary.propertyToday || date === summary.auditDate || isNavigating) return;
    setError(null);
    setIsNavigating(true);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    navigationTimer.current = setTimeout(() => setIsNavigating(false), NAVIGATION_TIMEOUT_MS);
    router.push(`/dashboard/night-audit?date=${date}`);
  }

  /** Opening the dialog on a new date must not replay the previous attempt's error. */
  function setDialogOpen(next: boolean) {
    if (!isExecuting) setConfirmOpen(next);
    setError(null);
  }

  async function closeDate() {
    if (isExecuting) return;
    setIsExecuting(true);
    setError(null);
    try {
      const result = await executeNightAudit(summary.auditDate, notes);
      if (!result.success) { setError(result.error); return; }
      // Only the persisted server receipt can change the displayed close state.
      setSummary(result.summary);
      setConfirmOpen(false);
      setError(null);
      toast.success(result.message);
      router.refresh();
    } catch {
      setError("The close result could not be confirmed. Refresh this business date to check its receipt before retrying.");
    } finally {
      setIsExecuting(false);
    }
  }

  const attention: AttentionItem[] = [
    ...summary.unresolvedBookings.map((booking): AttentionItem => ({
      kind: booking.type === "pending_arrival" ? "arrival" : "departure",
      id: `${booking.type}:${booking.id}`,
      title: booking.guestName,
      detail: `${booking.type === "pending_arrival" ? "Not checked in" : "Not checked out"} · ${booking.reference}${booking.roomNumber ? ` · Room ${booking.roomNumber}` : ""}`,
      href: `/dashboard/bookings/${booking.id}`,
    })),
    ...summary.rateIssueBookings.map((booking): AttentionItem => ({
      kind: "charge", id: `charge:${booking.id}`, title: booking.reference,
      detail: "Nightly charges do not match the room subtotal", href: `/dashboard/bookings/${booking.id}`,
    })),
  ];
  const attentionHidden = blockers - attention.length;

  const statusHeading = summary.isClosed
    ? "Closed"
    : waitingForMidnight ? "Waiting for midnight" : blockers > 0 ? `Blocked · ${blockers} to resolve` : "Ready to close";
  const statusDetail = summary.isClosed
    ? `Recorded${summary.lastAudit?.staffName ? ` by ${summary.lastAudit.staffName}` : ""} · ${timestamp(summary.lastAudit?.at ?? null, summary.timeZone)}`
    : waitingForMidnight
      ? "This day is still in progress in the property's timezone. It can be closed after midnight."
      : blockers > 0
        ? `${summary.pendingArrivals ?? 0} arrival${summary.pendingArrivals === 1 ? "" : "s"}, ${summary.pendingDepartures ?? 0} departure${summary.pendingDepartures === 1 ? "" : "s"} and ${(summary.rateIssues ?? 0) + (summary.paymentIssues ?? 0)} charge issue${(summary.rateIssues ?? 0) + (summary.paymentIssues ?? 0) === 1 ? "" : "s"} open. Resolve them to close the day.`
        : "All close checks passed.";
  const statusDot = summary.isClosed ? "bg-[var(--success)]" : blockers > 0 || waitingForMidnight ? "bg-[var(--warning)]" : "bg-muted-foreground";

  const tenderSegments = [...summary.paymentsByMethod]
    .filter((method) => method.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((method) => ({ key: method.method, amount: method.amount, color: TENDER_COLORS[method.method] ?? "var(--muted-foreground)" }));
  const tenderTotal = tenderSegments.reduce((sum, segment) => sum + segment.amount, 0);

  return <div className="daily-close-page mx-auto w-full max-w-7xl space-y-5" aria-busy={busy}>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.3px] text-foreground max-md:text-xl">Night audit</h1>
        <p className="mt-1 max-md:text-xs text-sm text-muted-foreground">Review {formatDate(summary.auditDate, "EEEE, MMM d, yyyy")} and record it.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" isIconOnly className="size-9 rounded-[10px]" aria-label="Previous day" isDisabled={busy || summary.auditDate <= MIN_AUDIT_DATE}
          onPress={() => navigate(shiftDay(summary.auditDate, -1))}><ChevronLeft className="size-4" /></Button>
        <PaymentDateField label="Business date" value={summary.auditDate} min={MIN_AUDIT_DATE} max={summary.propertyToday} onSelect={navigate} />
        <Button variant="outline" isIconOnly className="size-9 rounded-[10px]" aria-label="Next day" isDisabled={busy || summary.auditDate >= summary.propertyToday}
          onPress={() => navigate(shiftDay(summary.auditDate, 1))}><ChevronRight className="size-4" /></Button>
      </div>
    </header>

    {busy && <p role="status" className="text-[13px] text-muted-foreground">{isExecuting ? "Recording the close…" : "Loading this day…"}</p>}
    {error && !confirmOpen && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</p>}

    {/* Close status band */}
    <section className="space-y-1.5 border-b border-border/60 pb-5" aria-labelledby="close-status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${statusDot}`} aria-hidden="true" />
            <h2 id="close-status" className="text-base font-semibold text-foreground">{statusHeading}</h2>
            {summary.source === "legacy_audit_log" && <span className="text-caption text-muted-foreground">Imported</span>}
          </div>
          {/* The heading itself is not a live region; announce the new state after a close. */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {summary.isClosed ? "This day is closed." : waitingForMidnight ? "This day is still in progress." : blockers > 0 ? `${blockers} items still need resolving before this day can close.` : "This day is ready to close."}
          </p>
          <p className="max-md:text-xs text-[13px] text-muted-foreground">{statusDetail}</p>
          {!canRunAudit && !summary.isClosed && <p className="max-md:text-xs text-[13px] text-muted-foreground">A manager or super admin can close the day.</p>}
          {summary.lastAudit?.notes && <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted/50 px-3 py-2 max-md:text-xs text-[13px]">{summary.lastAudit.notes}</p>}
        </div>
        {summary.isClosed
          ? <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
            href={`/dashboard/reports?startDate=${summary.auditDate}&endDate=${summary.auditDate}`}>View in reports <ArrowRight className="size-3.5" aria-hidden="true" /></a>
          : <Button className="min-h-9 rounded-full px-5 text-sm font-medium" isDisabled={waitingForMidnight || !canClose || busy} onPress={() => setDialogOpen(true)}>
            Close {formatDate(summary.auditDate, "MMM d")}
          </Button>}
      </div>
    </section>

    {/* Day stats */}
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <PenKpi label="Room revenue" value={money(roomRevenueInclTax)} icon={Wallet} hint="incl. taxes" className="max-sm:col-span-2" />
      <PenKpi label="Room nights" value={summary.roomNights?.toLocaleString() ?? "Unavailable"} icon={CalendarDays} hint="stayed" />
      <PenKpi label="ADR" value={money(summary.adr)} icon={ReceiptText} hint="revenue ÷ room nights" />
      <PenKpi label="Collected by staff" value={money(staff.reduce((sum, method) => sum + method.amount, 0))} icon={Wallet} hint={staff.length > 0 ? `${staff.reduce((sum, method) => sum + method.count, 0)} payments` : "none"} />
      <PenKpi label="Online payments" value={money(online?.amount ?? 0)} icon={Globe} hint={online ? `${online.count} payments` : "none"} />
    </div>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_432px]">
      <PenCard>
        <PenCardHead title="Needs attention" caption={blockers > 0 ? "Resolve these before closing." : undefined}
          actions={blockers > 0 ? <span className="rounded-full bg-[#F5A5241F] px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[var(--warning)]">{blockers}</span> : undefined} />
        {attention.length === 0
          ? <div className="flex items-center gap-2.5 pt-2 text-[13px] text-muted-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" aria-hidden="true" /> Nothing outstanding.
          </div>
          : <ul>
            {attention.map((item, index) => <li key={item.id}>
              {index > 0 && <div className="h-px bg-border/50" aria-hidden="true" />}
              <a href={item.href} className="group flex items-center gap-3 py-3">
                <span className={`size-[7px] shrink-0 rounded-full ${item.kind === "charge" ? "bg-[var(--danger)]" : "bg-[var(--warning)]"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">{item.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.detail}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--pen-accent)]">
                  {item.kind === "charge" ? "Review" : "Manage"}
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </a>
            </li>)}
            {attentionHidden > 0 && <li className="pt-1 text-caption text-muted-foreground">{attentionHidden} more not shown; the close checks every booking.</li>}
          </ul>}
      </PenCard>

      <PenCard className="gap-3.5">
        <PenCardHead title="Taken this day" caption={summary.currency ? `Successful payments · ${summary.currency}` : undefined}
          actions={<a className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            href={`/dashboard/payments?tab=activity&startDate=${summary.auditDate}&endDate=${summary.auditDate}`}>Payments <ArrowRight className="size-3" aria-hidden="true" /></a>} />
        {summary.paymentIssues ? <p className="py-6 text-[13px] text-muted-foreground">Collections are unavailable until payments in other currencies are reconciled.</p>
          : tenderTotal === 0 ? <p className="py-6 text-[13px] text-muted-foreground">No payments recorded for this day.</p>
            : <div className="flex items-center gap-5">
              <DonutRing size={150} valueSize={15} labelSize={10}
                segments={tenderSegments} total={tenderTotal}
                value={money(summary.collections)}
                label={`collected · ${summary.paymentCount ?? 0}`}
                ariaLabel={`Payments taken this day: ${money(summary.collections)} across ${summary.paymentCount ?? 0} payments.`} />
              <ul className="min-w-0 flex-1 space-y-2">
                {tenderSegments.map((segment) => {
                  const source = summary.paymentsByMethod.find((method) => method.method === segment.key);
                  return <li key={segment.key} className="flex items-center gap-2 text-xs">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: segment.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{TENDER_SHORT_LABELS[segment.key] ?? segment.key.replaceAll("_", " ")}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{moneyWhole(source?.amount ?? segment.amount)}</span>
                  </li>;
                })}
              </ul>
            </div>}
        <p className="text-[11px] text-muted-foreground">Money received today — includes deposits for future stays, so it differs from room revenue.</p>
      </PenCard>
    </div>

    <NotesDisclosure title="About this close" items={summary.warnings} />

    <AlertDialog.Backdrop isOpen={confirmOpen} onOpenChange={setDialogOpen} isDismissable={!isExecuting}>
      <AlertDialog.Container><AlertDialog.Dialog className="max-w-lg">
        <AlertDialog.Header><AlertDialog.Heading>Close {formatDate(summary.auditDate, "EEEE, MMM d")}?</AlertDialog.Heading></AlertDialog.Header>
        <AlertDialog.Body className="space-y-4">
          <p className="text-[13px] text-muted-foreground">These figures are recorded permanently and cannot be changed later. The server re-checks every booking first; asking twice returns the original record.</p>
          <dl className="divide-y divide-border/50 rounded-lg border border-border/50">
            <div className="flex justify-between gap-3 px-3 py-2 text-[13px]"><dt className="text-muted-foreground">Room revenue (incl. taxes)</dt><dd className="tabular-nums">{money(roomRevenueInclTax)}</dd></div>
            <div className="flex justify-between gap-3 px-3 py-2 text-[13px]"><dt className="text-muted-foreground">Room nights</dt><dd className="tabular-nums">{summary.roomNights?.toLocaleString() ?? "Unavailable"}</dd></div>
            <div className="flex justify-between gap-3 px-3 py-2 text-[13px]"><dt className="text-muted-foreground">Collected</dt><dd className="tabular-nums">{money(summary.collections)}</dd></div>
          </dl>
          <div className="space-y-1.5">
            <label htmlFor="handover-notes" className="text-label text-muted-foreground">Handover note <span className="font-normal">(optional)</span></label>
            <Textarea id="handover-notes" rows={3} maxLength={1000} value={notes} disabled={isExecuting} onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything the next shift should know" className="min-h-20 resize-none text-[13px]" />
          </div>
          {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
        </AlertDialog.Body>
        <AlertDialog.Footer>
          <Button slot="close" className="min-h-9" variant="tertiary" isDisabled={isExecuting}>Cancel</Button>
          <Button className="min-h-9" isPending={isExecuting} isDisabled={!canClose || busy} onPress={closeDate}>Close {formatDate(summary.auditDate, "MMM d")}</Button>
        </AlertDialog.Footer>
      </AlertDialog.Dialog></AlertDialog.Container>
    </AlertDialog.Backdrop>
  </div>;
}
