"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button, Chip, toast } from "@heroui/react";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Moon } from "lucide-react";
import { executeNightAudit } from "./actions";
import { PaymentDateField } from "@/components/ui/payment-date-field";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { SectionCard } from "@/components/ui/section-card";
import { NotesDisclosure } from "@/components/ui/notes-disclosure";
import { SegmentedDonut, type DonutSegment } from "@/components/ui/segmented-donut";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
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

const TENDER_COLORS: Record<string, string> = {
  cash: "var(--chart-1)", card: "var(--chart-2)", mobile_money: "var(--chart-3)",
  bank_transfer: "var(--chart-4)", pos: "var(--chart-5)", paystack_link: "var(--chart-5)",
};

export function NightAuditClient({ initialSummary, canRunAudit }: {
  initialSummary: NightAuditSummary;
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
  const unresolved = (summary.pendingArrivals ?? 0) + (summary.pendingDepartures ?? 0);
  const blockers = unresolved + (summary.rateIssues ?? 0) + (summary.paymentIssues ?? 0);
  const waitingForMidnight = !summary.isClosed && blockers === 0 && summary.auditDate >= summary.propertyToday;
  const canClose = !summary.isClosed && blockers === 0 && summary.auditDate < summary.propertyToday && canRunAudit;
  const cash = summary.paymentsByMethod.find((method) => method.method === "cash");
  const electronic = summary.paymentsByMethod.filter((method) => method.method !== "cash");

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

  const ranked = [...summary.paymentsByMethod].sort((a, b) => b.amount - a.amount);
  const segments: DonutSegment[] = ranked.slice(0, 3).map((method) => ({
    key: method.method, label: PAYMENT_METHOD_LABELS[method.method] ?? method.method.replaceAll("_", " "),
    value: method.amount, color: TENDER_COLORS[method.method] ?? "var(--muted-foreground)",
  }));
  const others = ranked.slice(3);
  if (others.length > 0) segments.push({ key: "other", label: "Other", value: others.reduce((sum, method) => sum + method.amount, 0), color: "var(--muted-foreground)" });

  return <div className="mx-auto w-full max-w-6xl space-y-5" aria-busy={busy}>
    <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-page-title"><Moon className="size-5 text-muted-foreground" aria-hidden="true" /> Daily close</h1>
        <p className="mt-1 text-body text-muted-foreground">Review {formatDate(summary.auditDate, "EEEE, MMM d, yyyy")} and record it.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" isIconOnly className="size-9" aria-label="Previous day" isDisabled={busy || summary.auditDate <= MIN_AUDIT_DATE}
          onPress={() => navigate(shiftDay(summary.auditDate, -1))}><ChevronLeft className="size-4" /></Button>
        <PaymentDateField label="Business date" value={summary.auditDate} min={MIN_AUDIT_DATE} max={summary.propertyToday} onSelect={navigate} />
        <Button variant="outline" isIconOnly className="size-9" aria-label="Next day" isDisabled={busy || summary.auditDate >= summary.propertyToday}
          onPress={() => navigate(shiftDay(summary.auditDate, 1))}><ChevronRight className="size-4" /></Button>
      </div>
    </header>

    {busy && <p role="status" className="text-[13px] text-muted-foreground">{isExecuting ? "Recording the close…" : "Loading this day…"}</p>}
    {error && !confirmOpen && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</p>}

    <section className={`rounded-xl border px-4 py-4 ${canClose || summary.isClosed ? "border-border/60 bg-card" : waitingForMidnight ? "border-border/60 bg-card" : "border-amber-500/30 bg-amber-50/60"}`} aria-labelledby="close-status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {summary.isClosed
              ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
              : blockers > 0 ? <CircleAlert className="size-4 text-amber-600" aria-hidden="true" /> : null}
            <h2 id="close-status" className="text-section">
              {summary.isClosed ? "Closed" : waitingForMidnight ? "Waiting for midnight" : blockers > 0 ? `Blocked · ${blockers} to resolve` : "Ready to close"}
            </h2>
            {summary.source === "legacy_audit_log" && <Chip size="sm" variant="soft" color="default">Imported</Chip>}
          </div>
          {/* The heading itself is not a live region; announce the new state after a close. */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {summary.isClosed ? "This day is closed." : waitingForMidnight ? "This day is still in progress." : blockers > 0 ? `${blockers} items still need resolving before this day can close.` : "This day is ready to close."}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {summary.isClosed
              ? `Recorded${summary.lastAudit?.staffName ? ` by ${summary.lastAudit.staffName}` : ""} · ${timestamp(summary.lastAudit?.at ?? null, summary.timeZone)}`
              : waitingForMidnight
                ? "This day is still in progress in the property's timezone. It can be closed after midnight."
                : blockers > 0
                  ? `${summary.pendingArrivals ?? 0} arrival${summary.pendingArrivals === 1 ? "" : "s"}, ${summary.pendingDepartures ?? 0} departure${summary.pendingDepartures === 1 ? "" : "s"} and ${(summary.rateIssues ?? 0) + (summary.paymentIssues ?? 0)} charge issue${(summary.rateIssues ?? 0) + (summary.paymentIssues ?? 0) === 1 ? "" : "s"} open.`
                  : "Everything scheduled for this day is settled. Closing records the figures below permanently."}
          </p>
          {!canRunAudit && !summary.isClosed && <p className="mt-1 text-[13px] text-muted-foreground">A manager or super admin can close the day.</p>}
          {summary.lastAudit?.notes && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/50 px-3 py-2 text-[13px]">{summary.lastAudit.notes}</p>}
        </div>
        {summary.isClosed
          ? <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
            href={`/dashboard/reports?startDate=${summary.auditDate}&endDate=${summary.auditDate}`}>View in reports <ArrowRight className="size-3.5" aria-hidden="true" /></a>
          : waitingForMidnight
            ? <Button className="min-h-9" isDisabled>Close {formatDate(summary.auditDate, "MMM d")}</Button>
            : <Button className="min-h-9" isDisabled={!canClose || busy} onPress={() => setDialogOpen(true)}>Close {formatDate(summary.auditDate, "MMM d")}</Button>}
      </div>
    </section>

    <StatStrip label="This day" columns={5}>
      <Stat label="Room revenue" value={money(summary.roomRevenue)} hint="excl. tax" tone={summary.roomRevenue === null ? "unavailable" : "default"} />
      <Stat label="Room nights" value={summary.roomNights?.toLocaleString() ?? "Unavailable"} hint="stayed" />
      <Stat label="ADR" value={money(summary.adr)} hint="revenue ÷ room nights" />
      <Stat label="Cash collected" value={money(cash?.amount ?? 0)} hint={cash ? `${cash.count} payment${cash.count === 1 ? "" : "s"}` : "none"} />
      <Stat label="Card & mobile" value={money(electronic.reduce((sum, method) => sum + method.amount, 0))}
        hint={electronic.length > 0 ? `${electronic.reduce((sum, method) => sum + method.count, 0)} payments` : "none"} />
    </StatStrip>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <SectionCard title="Needs attention" caption={blockers > 0 ? "Resolve these before closing." : undefined}
        action={blockers > 0 ? <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-amber-700">{blockers}</span> : undefined}>
        {attention.length === 0
          ? <div className="flex items-center gap-2.5 px-4 pb-4 pt-1 text-[13px] text-muted-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" /> Nothing outstanding.
          </div>
          : <ul className="divide-y divide-border/50 border-t border-border/50">
            {attention.map((item) => <li key={item.id}>
              <a href={item.href} className="group flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-muted/40">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.title}</span>
                  <span className="block truncate text-caption text-muted-foreground">{item.detail}</span>
                </span>
                <span className="shrink-0 text-caption font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  {item.kind === "charge" ? "Review" : "Manage"}
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            </li>)}
            {attentionHidden > 0 && <li className="px-4 py-2.5 text-caption text-muted-foreground">{attentionHidden} more not shown; the close checks every booking.</li>}
          </ul>}
      </SectionCard>

      <SectionCard title="Taken this day" caption={summary.currency ? `Successful payments · ${summary.currency}` : undefined}
        action={<a className="inline-flex min-h-8 items-center text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href={`/dashboard/payments?tab=activity&startDate=${summary.auditDate}&endDate=${summary.auditDate}`}>Payments <ArrowRight className="ml-1 size-3" aria-hidden="true" /></a>}>
        {summary.paymentIssues ? <p className="px-4 pb-4 text-[13px] text-muted-foreground">Collections are unavailable until payments in other currencies are reconciled.</p>
          : segments.length === 0 ? <p className="px-4 pb-4 text-[13px] text-muted-foreground">No payments recorded for this day.</p>
            : <div className="px-4 pb-4"><SegmentedDonut label="Payments taken this day" heading="Collected" value={money(summary.collections)}
              delta={summary.paymentCount ? `${summary.paymentCount} payments` : undefined} segments={segments} /></div>}
      </SectionCard>
    </div>

    <NotesDisclosure title="About this close" items={summary.warnings} />

    <AlertDialog.Backdrop isOpen={confirmOpen} onOpenChange={setDialogOpen} isDismissable={!isExecuting}>
      <AlertDialog.Container><AlertDialog.Dialog className="max-w-lg">
        <AlertDialog.Header><AlertDialog.Heading>Close {formatDate(summary.auditDate, "EEEE, MMM d")}?</AlertDialog.Heading></AlertDialog.Header>
        <AlertDialog.Body className="space-y-4">
          <p className="text-[13px] text-muted-foreground">These figures are recorded permanently and cannot be changed later. The server re-checks every booking first; asking twice returns the original record.</p>
          <dl className="divide-y divide-border/50 rounded-lg border border-border/50">
            <div className="flex justify-between gap-3 px-3 py-2 text-[13px]"><dt className="text-muted-foreground">Room revenue</dt><dd className="tabular-nums">{money(summary.roomRevenue)}</dd></div>
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
