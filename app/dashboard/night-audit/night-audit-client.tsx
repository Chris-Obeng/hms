"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Alert, AlertDialog, Button, Chip, Disclosure, Label, TextArea, TextField, toast } from "@heroui/react";
import { ArrowRight, CheckCircle2, ChevronRight, CircleCheckBig, Clock, TriangleAlert } from "lucide-react";
import { executeNightAudit } from "./actions";
import { DateNavigator } from "@/app/dashboard/_components/date-card";
import { PenKpi } from "@/components/ui/pen/pen-kpi";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
import { DonutRing } from "@/components/ui/pen/donut-ring";
import { MIN_AUDIT_DATE, type NightAuditSummary } from "@/lib/night-audit/summary";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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

  const tenderSegments = [...summary.paymentsByMethod]
    .filter((method) => method.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((method) => ({ key: method.method, amount: method.amount, color: TENDER_COLORS[method.method] ?? "var(--muted-foreground)" }));
  const tenderTotal = tenderSegments.reduce((sum, segment) => sum + segment.amount, 0);

  const StatusIcon = summary.isClosed ? CheckCircle2 : blockers > 0 ? TriangleAlert : waitingForMidnight ? Clock : CircleCheckBig;
  const statusTone = summary.isClosed
    ? "bg-emerald-500/10 text-emerald-600"
    : blockers > 0 || waitingForMidnight
      ? "bg-amber-500/12 text-amber-700"
      : "bg-primary/10 text-primary";
  const staffTotal = staff.reduce((sum, method) => sum + method.amount, 0);

  return <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8" aria-busy={busy}>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Night audit</h1>
      <DateNavigator
        selectedDate={new Date(`${summary.auditDate}T00:00:00`)}
        onDateChange={(date) => navigate(format(date, "yyyy-MM-dd"))}
        todayDateStr={summary.propertyToday}
        minDateStr={MIN_AUDIT_DATE}
        maxDateStr={summary.propertyToday}
        isDisabled={busy}
      />
    </header>

    {error && !confirmOpen && (
      <Alert status="danger" role="alert" className="rounded-2xl">
        <Alert.Indicator />
        <Alert.Content><Alert.Description className="text-destructive">{error}</Alert.Description></Alert.Content>
      </Alert>
    )}

    {/* Close status */}
    <PenCard className={cn("transition-opacity duration-150", busy && "opacity-60")}>
      <section aria-labelledby="close-status" className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span aria-hidden="true" className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", statusTone)}>
          <StatusIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="close-status" className="text-lg font-semibold tracking-tight text-foreground">{statusHeading}</h2>
            {summary.source === "legacy_audit_log" && <Chip size="sm" variant="soft">Imported</Chip>}
          </div>
          {/* The heading itself is not a live region; announce the new state after a close. */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {summary.isClosed ? "This day is closed." : waitingForMidnight ? "This day is still in progress." : blockers > 0 ? `${blockers} items still need resolving before this day can close.` : "This day is ready to close."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{busy ? (isExecuting ? "Recording the close…" : "Loading this day…") : statusDetail}</p>
          <p role="status" className="sr-only">{busy ? (isExecuting ? "Recording the close…" : "Loading this day…") : ""}</p>
          {!canRunAudit && !summary.isClosed && <p className="mt-1 text-sm text-muted-foreground">A manager or super admin can close the day.</p>}
          {summary.lastAudit?.notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-secondary/70 px-3 py-2 text-sm text-foreground">{summary.lastAudit.notes}</p>}
        </div>
        {summary.isClosed
          ? <Button variant="secondary" className="w-full shrink-0 rounded-xl sm:w-auto"
            onPress={() => router.push(`/dashboard/reports?startDate=${summary.auditDate}&endDate=${summary.auditDate}`)}>
            View report <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          : <Button variant="primary" className="w-full shrink-0 rounded-xl font-semibold sm:w-auto" isDisabled={waitingForMidnight || !canClose || busy} onPress={() => setDialogOpen(true)}>
            Close {formatDate(summary.auditDate, "MMM d")}
          </Button>}
      </section>
    </PenCard>

    {/* Day figures */}
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <PenKpi label="Room revenue" value={money(roomRevenueInclTax)} hint="Incl. taxes" />
      <PenKpi label="Room nights" value={summary.roomNights?.toLocaleString() ?? "Unavailable"} hint="Stayed" />
      <PenKpi label="ADR" value={money(summary.adr)} hint="Per room night" />
      <PenKpi label="Collected" value={money(summary.collections)} hint={`${summary.paymentCount ?? 0} ${summary.paymentCount === 1 ? "payment" : "payments"}`} />
    </div>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-6">
      <PenCard className="gap-2">
        <PenCardHead title="Needs attention"
          actions={blockers > 0 ? <Chip size="sm" variant="soft" color="warning" className="tabular-nums">{blockers}</Chip> : undefined} />
        {attention.length === 0
          ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" /> Nothing outstanding.
          </div>
          : <ul className="-mx-2 divide-y divide-border/50">
            {attention.map((item) => <li key={item.id}>
              <Link href={item.href}
                className="group flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/60">
                <span className={cn("size-2 shrink-0 rounded-full", item.kind === "charge" ? "bg-destructive" : "bg-amber-500")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{item.detail}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>)}
            {attentionHidden > 0 && <li className="px-2 pt-3 text-xs text-muted-foreground">{attentionHidden} more not shown</li>}
          </ul>}
      </PenCard>

      <PenCard>
        <PenCardHead title="Payments taken"
          actions={<Button size="sm" variant="ghost" className="rounded-lg text-muted-foreground"
            onPress={() => router.push(`/dashboard/payments?tab=activity&startDate=${summary.auditDate}&endDate=${summary.auditDate}`)}>
            View all <ArrowRight className="size-4" aria-hidden="true" />
          </Button>} />
        {summary.paymentIssues ? <p className="py-6 text-sm text-muted-foreground">Unavailable until payments in other currencies are reconciled.</p>
          : tenderTotal === 0 ? <p className="py-6 text-sm text-muted-foreground">No payments this day.</p>
            : <div className="flex items-center gap-6">
              <DonutRing size={136} valueSize={14} labelSize={10}
                segments={tenderSegments} total={tenderTotal}
                value={money(summary.collections)}
                label={`${summary.paymentCount ?? 0} ${summary.paymentCount === 1 ? "payment" : "payments"}`}
                ariaLabel={`Payments taken this day: ${money(summary.collections)} across ${summary.paymentCount ?? 0} payments.`} />
              <ul className="min-w-0 flex-1 space-y-3">
                {tenderSegments.map((segment) => {
                  const source = summary.paymentsByMethod.find((method) => method.method === segment.key);
                  return <li key={segment.key} className="flex items-center gap-2 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: segment.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{TENDER_SHORT_LABELS[segment.key] ?? segment.key.replaceAll("_", " ")}</span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">{moneyWhole(source?.amount ?? segment.amount)}</span>
                  </li>;
                })}
              </ul>
            </div>}
        {tenderTotal > 0 && !summary.paymentIssues && (
          <div className="flex justify-between gap-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
            <span>Online <span className="font-medium tabular-nums text-foreground">{money(online?.amount ?? 0)}</span></span>
            <span>By staff <span className="font-medium tabular-nums text-foreground">{money(staffTotal)}</span></span>
          </div>
        )}
      </PenCard>
    </div>

    {summary.warnings.length > 0 && (
      <Disclosure className="rounded-2xl border border-border/60 bg-card px-4">
        <Disclosure.Heading>
          <Button slot="trigger" variant="ghost" fullWidth
            className="h-12 justify-between rounded-xl px-0 text-sm font-medium text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-transparent [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground">
            About these figures
            <Disclosure.Indicator />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="px-0 pb-4 pt-0">
            <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
              {summary.warnings.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    )}

    <AlertDialog.Backdrop isOpen={confirmOpen} onOpenChange={setDialogOpen} isDismissable={!isExecuting}>
      <AlertDialog.Container placement="center" size="md"><AlertDialog.Dialog className="rounded-3xl sm:max-w-lg">
        <AlertDialog.Header><AlertDialog.Heading className="text-lg font-semibold">Close {formatDate(summary.auditDate, "EEEE, MMM d")}?</AlertDialog.Heading></AlertDialog.Header>
        <AlertDialog.Body className="space-y-4">
          <p className="text-sm text-muted-foreground">These figures are recorded permanently and cannot be changed later.</p>
          <dl className="divide-y divide-border/50 rounded-2xl bg-secondary/60 px-4">
            <div className="flex justify-between gap-3 py-3 text-sm"><dt className="text-muted-foreground">Room revenue</dt><dd className="font-medium tabular-nums text-foreground">{money(roomRevenueInclTax)}</dd></div>
            <div className="flex justify-between gap-3 py-3 text-sm"><dt className="text-muted-foreground">Room nights</dt><dd className="font-medium tabular-nums text-foreground">{summary.roomNights?.toLocaleString() ?? "Unavailable"}</dd></div>
            <div className="flex justify-between gap-3 py-3 text-sm"><dt className="text-muted-foreground">Collected</dt><dd className="font-medium tabular-nums text-foreground">{money(summary.collections)}</dd></div>
          </dl>
          <TextField fullWidth value={notes} onChange={setNotes} isDisabled={isExecuting}>
            <Label>Handover note</Label>
            <TextArea rows={3} maxLength={1000} placeholder="Anything the next shift should know" className="resize-none" />
          </TextField>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </AlertDialog.Body>
        <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
          <Button slot="close" variant="tertiary" isDisabled={isExecuting} className="rounded-xl">Cancel</Button>
          <Button variant="primary" isPending={isExecuting} isDisabled={!canClose || busy} onPress={closeDate} className="rounded-xl font-semibold">Close {formatDate(summary.auditDate, "MMM d")}</Button>
        </AlertDialog.Footer>
      </AlertDialog.Dialog></AlertDialog.Container>
    </AlertDialog.Backdrop>
  </div>;
}
