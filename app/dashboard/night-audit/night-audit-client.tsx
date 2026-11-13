"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Alert, AlertDialog, Button, Card, Chip, Disclosure, Label, TextArea, TextField, toast } from "@heroui/react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { executeNightAudit } from "./actions";
import { DateNavigator } from "@/app/dashboard/_components/date-card";
import { DonutRing } from "@/components/ui/pen/donut-ring";
import { MIN_AUDIT_DATE, type NightAuditSummary } from "@/lib/night-audit/summary";
import { PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { OTHER_PAYMENT_METHOD_COLOR, PAYMENT_METHOD_COLORS } from "@/lib/payment-method-colors";
import { formatCurrencySymbol, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Same quiet surface as the Rooms, Rates and Reports cards. */
const CARD = "min-w-0 gap-4 rounded-3xl border border-border/60 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-6";

function timestamp(value: string | null, timeZone: string | null): string {
  if (!value) return "Timestamp not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timeZone ?? "UTC" }).format(new Date(value));
}

/** Bounds the navigation lock so a failed push cannot leave every control disabled forever. */
const NAVIGATION_TIMEOUT_MS = 15_000;

type AttentionItem =
  | { kind: "arrival" | "departure"; id: string; title: string; detail: string; href: string }
  | { kind: "charge"; id: string; title: string; detail: string; href: string };

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
  /** Exact amount with the currency, for the permanent record in the close dialog. */
  const money = (value: number | null) => value === null || !summary.currency ? "Unavailable" : formatCurrencySymbol(value, summary.currency, { exact: true });
  /** Page figures carry the cedi symbol, without decimals, so staff can tell money from counts. */
  const amount = (value: number | null) => value === null || !summary.currency ? null : formatCurrencySymbol(value, summary.currency);
  const unresolved = (summary.pendingArrivals ?? 0) + (summary.pendingDepartures ?? 0);
  const blockers = unresolved + (summary.rateIssues ?? 0) + (summary.paymentIssues ?? 0);
  const waitingForMidnight = !summary.isClosed && blockers === 0 && summary.auditDate >= summary.propertyToday;
  const canClose = !summary.isClosed && blockers === 0 && summary.auditDate < summary.propertyToday && canRunAudit;

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
        : "Nothing outstanding.";

  const tenderSegments = [...summary.paymentsByMethod]
    .filter((method) => method.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((method) => ({
      key: method.method, amount: method.amount,
      label: PAYMENT_METHOD_LABELS[method.method] ?? method.method.replaceAll("_", " "),
      color: PAYMENT_METHOD_COLORS[method.method] ?? OTHER_PAYMENT_METHOD_COLOR,
    }));
  const tenderTotal = tenderSegments.reduce((sum, segment) => sum + segment.amount, 0);

  /** The one signature on this page: a status dot in front of the day's state. */
  const statusDot = summary.isClosed ? "bg-success" : blockers > 0 || waitingForMidnight ? "bg-warning" : "bg-primary";
  const figures: { label: string; value: string | null; hint?: string }[] = [
    { label: "Room revenue", value: amount(roomRevenueInclTax), hint: "Including tax" },
    { label: "Room nights", value: summary.roomNights?.toLocaleString("en") ?? null },
    { label: "ADR", value: amount(summary.adr) },
    { label: "Collected", value: amount(summary.collections), hint: `${summary.paymentCount ?? 0} ${summary.paymentCount === 1 ? "payment" : "payments"}` },
  ];

  const statusLine = busy ? (isExecuting ? "Recording the close…" : "Loading this day…") : statusDetail;

  return <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8" aria-busy={busy}>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Night audit</h1>
      </div>
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

    {/* The close: the day's state, its one action, and whatever still blocks it. */}
    <Card className={cn(CARD, "transition-opacity duration-150 ease-[var(--ease-out-ui)]", busy && "opacity-60")}>
      <section aria-labelledby="close-status" className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", statusDot)} />
              <h2 id="close-status" className="text-lg font-semibold text-foreground">{statusHeading}</h2>
              {summary.source === "legacy_audit_log" && <Chip size="sm" variant="soft">Imported</Chip>}
            </div>
            {/* The heading itself is not a live region; announce the new state after a close. */}
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {summary.isClosed ? "This day is closed." : waitingForMidnight ? "This day is still in progress." : blockers > 0 ? `${blockers} items still need resolving before this day can close.` : "This day is ready to close."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{statusLine}</p>
            <p role="status" className="sr-only">{busy ? (isExecuting ? "Recording the close…" : "Loading this day…") : ""}</p>
            {!canRunAudit && !summary.isClosed && <p className="mt-1 text-sm text-muted-foreground">A manager or super admin can close the day.</p>}
          </div>
          {summary.isClosed
            ? <Button variant="secondary" className="w-full shrink-0 rounded-xl max-md:h-11 sm:w-auto"
              onPress={() => router.push(`/dashboard/reports?startDate=${summary.auditDate}&endDate=${summary.auditDate}`)}>
              View report <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            : <Button variant="primary" className="w-full shrink-0 rounded-xl font-semibold max-md:h-11 sm:w-auto" isDisabled={waitingForMidnight || !canClose || busy} onPress={() => setDialogOpen(true)}>
              Close {formatDate(summary.auditDate, "MMM d")}
            </Button>}
        </div>

        {summary.lastAudit?.notes && <figure className="rounded-2xl bg-secondary/70 px-4 py-3">
          <figcaption className="text-xs font-medium text-muted-foreground">Handover note</figcaption>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{summary.lastAudit.notes}</p>
        </figure>}

        {attention.length > 0 && <ul aria-label="Needs attention" className="-mx-2 divide-y divide-border/60 border-t border-border/60 pt-2">
          {attention.map((item) => <li key={item.id}>
            <Link href={item.href}
              className="group flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/60">
              <span className={cn("size-2 shrink-0 rounded-full", item.kind === "charge" ? "bg-danger" : "bg-warning")} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{item.detail}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            </Link>
          </li>)}
          {attentionHidden > 0 && <li className="px-2 pt-3 text-xs text-muted-foreground">{attentionHidden} more not shown</li>}
        </ul>}
      </section>
    </Card>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-6">
      {/* The day in figures: one surface split by hairlines, two by two. */}
      <Card className={cn(CARD, "grid grid-cols-2 gap-0 p-0 sm:p-0")}>
        {figures.map((figure, index) => <article key={figure.label} aria-label={figure.label}
          className={cn("flex min-w-0 flex-col justify-center gap-2 border-border/60 p-4 sm:p-6", index % 2 === 0 && "border-r", index < 2 && "border-b")}>
          <p className="truncate text-xs font-medium leading-4 text-muted-foreground">{figure.label}</p>
          {figure.value === null
            ? <p className="text-base font-medium leading-8 text-muted-foreground">Unavailable</p>
            : <p className="truncate text-[28px] font-medium leading-8 tracking-[-0.01em] tabular-nums text-foreground">{figure.value}</p>}
          <p className="truncate text-xs leading-4 text-muted-foreground">{figure.hint ?? "\u00a0"}</p>
        </article>)}
      </Card>

      <Card className={CARD}>
        <section aria-labelledby="payments-taken" className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="payments-taken" className="text-md font-semibold leading-6 text-foreground">Payments taken</h2>
              <p className="mt-1 text-xs leading-4 text-muted-foreground">By payment method</p>
            </div>
            <Button size="sm" variant="ghost" className="-mr-2 rounded-lg text-muted-foreground max-md:h-11"
              onPress={() => router.push(`/dashboard/payments?tab=activity&startDate=${summary.auditDate}&endDate=${summary.auditDate}`)}>
              View all <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {summary.paymentIssues ? <p className="py-6 text-sm text-muted-foreground">Unavailable until payments in other currencies are reconciled.</p>
            : tenderTotal === 0 ? <p className="py-6 text-sm text-muted-foreground">No payments this day.</p>
              : <div className="flex items-center gap-6">
                <DonutRing size={112} segments={tenderSegments} total={tenderTotal}
                  ariaLabel={`Payments taken this day by method: ${tenderSegments.map((segment) => `${segment.label} ${amount(segment.amount)}`).join(", ")}.`} />
                <ul className="min-w-0 flex-1 divide-y divide-border/60">
                  {tenderSegments.map((segment) => <li key={segment.key} className="flex min-h-10 items-center gap-2 py-2 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: segment.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{segment.label}</span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">{amount(segment.amount)}</span>
                  </li>)}
                </ul>
              </div>}
        </section>
      </Card>
    </div>

    {summary.warnings.length > 0 && (
      <Disclosure>
        <Disclosure.Heading>
          <Button slot="trigger" variant="ghost" size="sm" className="-ml-3 gap-2 text-xs font-medium text-muted-foreground">
            About these figures
            <Disclosure.Indicator />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="px-0 pb-0 pt-2">
            <ul className="list-disc space-y-2 pl-4 text-xs leading-5 text-muted-foreground">
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
