"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button, Chip, toast } from "@heroui/react";
import { CheckCircle2, ChevronLeft, ChevronRight, Moon, RefreshCw } from "lucide-react";
import { executeNightAudit } from "./actions";
import { MIN_AUDIT_DATE, type NightAuditSummary } from "@/lib/night-audit/summary";
import { formatCurrency } from "@/lib/format";

function shiftDay(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timestamp(value: string | null, timeZone: string | null): string {
  if (!value) return "Timestamp not recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "long", timeZone: timeZone ?? "UTC",
  }).format(new Date(value));
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <section className="card-default min-w-0 p-4">
    <h2 className="text-label text-muted-foreground">{label}</h2>
    <p className="mt-2 break-words text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-2 text-caption text-muted-foreground">{detail}</p>
  </section>;
}

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
  const [isNavigating, startNavigation] = React.useTransition();
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const busy = isExecuting || isNavigating;
  const money = (value: number | null) => value === null || !summary.currency ? "Unavailable" : formatCurrency(value, summary.currency);
  const unresolved = (summary.pendingArrivals ?? 0) + (summary.pendingDepartures ?? 0);
  const blocked = !summary.canClose || !canRunAudit || busy;

  function navigate(date: string) {
    if (date && date >= MIN_AUDIT_DATE && date <= summary.propertyToday && date !== summary.auditDate) {
      setError(null);
      startNavigation(() => router.push(`/dashboard/night-audit?date=${date}`));
    }
  }

  async function closeDate() {
    setIsExecuting(true);
    setError(null);
    try {
      const result = await executeNightAudit(summary.auditDate, notes);
      if (!result.success) {
        setError(result.error);
        return;
      }
      // Only the persisted server receipt can change the displayed close state.
      setSummary(result.summary);
      setConfirmOpen(false);
      toast.success(result.message);
      router.refresh();
    } catch {
      setError("The close result could not be confirmed. Refresh this business date to check its receipt before retrying.");
    } finally {
      setIsExecuting(false);
    }
  }

  return <div className="mx-auto max-w-6xl space-y-5" aria-busy={busy}>
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div>
        <h1 className="flex items-center gap-2 text-page-title"><Moon className="size-5" /> Night Audit</h1>
        <p className="mt-1 text-body text-muted-foreground">Business-date review · <strong className="text-foreground">{summary.auditDate}</strong></p>
        <p className="mt-1 text-caption text-muted-foreground">{summary.timeZone ?? "Legacy timezone not recorded"} · Property date now: {summary.propertyToday}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" isIconOnly className="size-11" aria-label="Previous business date"
          isDisabled={busy || summary.auditDate <= MIN_AUDIT_DATE} onPress={() => navigate(shiftDay(summary.auditDate, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <input type="date" aria-label="Business date" value={summary.auditDate}
          min={MIN_AUDIT_DATE} max={summary.propertyToday} disabled={busy}
          onChange={(event) => navigate(event.target.value)}
          className="h-11 min-w-0 rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
        <Button variant="outline" isIconOnly className="size-11" aria-label="Next business date"
          isDisabled={busy || summary.auditDate >= summary.propertyToday} onPress={() => navigate(shiftDay(summary.auditDate, 1))}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" className="min-h-11" isDisabled={busy} onPress={() => startNavigation(() => router.refresh())}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>
    </header>

    {busy && <p role="status" className="text-sm text-muted-foreground">{isExecuting ? "Confirming durable close…" : "Loading business date…"}</p>}
    {error && !confirmOpen && <p role="alert" className="rounded-lg border border-danger/40 p-4 text-sm">{error}</p>}

    <section className="card-default space-y-2 p-4" aria-label="Review status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip color={summary.isClosed ? "success" : "warning"} variant="soft">
          {summary.isClosed ? <CheckCircle2 className="size-4" /> : null}
          {summary.source === "legacy_audit_log" ? "Legacy close recorded" : summary.isClosed ? "Review closed" : "Unclosed preview"}
        </Chip>
        {!summary.isClosed && canRunAudit && <Button className="min-h-11" isDisabled={blocked} onPress={() => setConfirmOpen(true)}>Close business-date review</Button>}
      </div>
      {summary.lastAudit ? <>
        <p className="text-sm">Business date <strong>{summary.auditDate}</strong> recorded{summary.lastAudit.staffName ? ` by ${summary.lastAudit.staffName}` : ""}.</p>
        <p className="text-caption text-muted-foreground">Actor timestamp: {timestamp(summary.lastAudit.at, summary.timeZone)}</p>
        {summary.lastAudit.notes && <p className="whitespace-pre-wrap break-words text-sm">{summary.lastAudit.notes}</p>}
      </> : <>
        <p className="text-sm text-muted-foreground">Closing captures the reconciled net nightly charges and successful collections once. It does not resolve bookings or post a ledger.</p>
        {summary.auditDate === summary.propertyToday && <p className="text-sm">This property calendar day is still in progress. Close is available after local midnight.</p>}
        {!canRunAudit && <p className="text-sm">An active manager must close this review.</p>}
        {(unresolved > 0 || (summary.rateIssues ?? 0) + (summary.paymentIssues ?? 0) > 0) && <p className="text-sm">Close is blocked until all operations and reconciliation issues below are resolved.</p>}
      </>}
    </section>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Net room revenue" value={money(summary.roomRevenue)} detail="Stored nightly room charges, excluding tax; checked-in / checked-out stays." />
      <Stat label="Stayed room nights" value={summary.roomNights?.toLocaleString() ?? "Unavailable"} detail="Room quantities for this date; checkout day excluded." />
      <Stat label="Successful collections" value={money(summary.collections)} detail="Payment timestamps within this property calendar day; separate from stay revenue." />
      <Stat label="Average daily rate" value={money(summary.adr)} detail="Net nightly room revenue ÷ stayed room nights. No rate when there are no room nights." />
    </div>

    <section className="card-default space-y-2 p-4">
      <h2 className="text-section">Scope and availability</h2>
      <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      {summary.capturedAt && <p className="text-caption text-muted-foreground">{summary.isClosed ? "Persisted snapshot" : "Preview captured"}: {timestamp(summary.capturedAt, summary.timeZone)}</p>}
    </section>

    {unresolved > 0 && <section className="card-default space-y-3 p-4">
      <h2 className="text-section">Unresolved operations ({unresolved})</h2>
      <p className="text-sm text-muted-foreground">{summary.pendingArrivals} arrival(s) and {summary.pendingDepartures} departure(s) due on or before {summary.auditDate}. There is no override policy; resolve these in the booking workflow.</p>
      <ul className="divide-y divide-border">{summary.unresolvedBookings.map((booking) => <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="min-w-0"><p className="break-words text-sm font-medium">{booking.guestName} · {booking.reference}</p><p className="text-caption text-muted-foreground">{booking.type === "pending_arrival" ? "Arrival" : "Departure"} · Room {booking.roomNumber ?? "unassigned"}</p></div>
        <a className="inline-flex min-h-11 items-center text-sm font-medium underline" href={`/dashboard/bookings/${booking.id}`}>Manage booking</a>
      </li>)}</ul>
      {unresolved > summary.unresolvedBookings.length && <p className="text-caption">Showing {summary.unresolvedBookings.length} of {unresolved}; the close gate checks all bookings.</p>}
    </section>}

    {(summary.rateIssues ?? 0) > 0 && <section className="card-default space-y-3 p-4">
      <h2 className="text-section">Nightly charge reconciliation ({summary.rateIssues})</h2>
      <p className="text-sm text-muted-foreground">Every stay needs complete nightly records matching its net room subtotal, room quantity and property currency. Resolve adjustments in the booking records; this review does not invent an allocation.</p>
      <ul>{summary.rateIssueBookings.map((booking) => <li key={booking.id}><a className="inline-flex min-h-11 items-center underline" href={`/dashboard/bookings/${booking.id}`}>{booking.reference}</a></li>)}</ul>
      {(summary.rateIssues ?? 0) > summary.rateIssueBookings.length && <p className="text-caption">Showing {summary.rateIssueBookings.length} of {summary.rateIssues}; all are checked before close.</p>}
    </section>}

    {summary.paymentsByMethod.length > 0 && summary.paymentIssues === 0 && <section className="card-default p-4">
      <h2 className="text-section">Collections by method</h2>
      <dl className="mt-3 space-y-2">{summary.paymentsByMethod.map((method) => <div className="flex flex-wrap justify-between gap-2 text-sm" key={method.method}>
        <dt>{method.method.replaceAll("_", " ")} · {method.count} payment(s)</dt><dd className="tabular-nums">{money(method.amount)}</dd>
      </div>)}</dl>
    </section>}

    <AlertDialog.Backdrop isOpen={confirmOpen} onOpenChange={setConfirmOpen} isDismissable={!isExecuting}>
      <AlertDialog.Container><AlertDialog.Dialog className="max-w-lg">
        <AlertDialog.Header><AlertDialog.Heading>Close review for {summary.auditDate}?</AlertDialog.Heading></AlertDialog.Header>
        <AlertDialog.Body className="space-y-4">
          <p className="text-sm">The database rechecks all blockers and captures the figures at close. A repeat request returns the original receipt. Closed summaries are immutable; reopening is not supported.</p>
          <dl className="space-y-2 text-sm"><div className="flex justify-between gap-2"><dt>Net room revenue</dt><dd>{money(summary.roomRevenue)}</dd></div><div className="flex justify-between gap-2"><dt>Successful collections</dt><dd>{money(summary.collections)}</dd></div></dl>
          <label className="block text-sm">Handover notes (optional)<textarea className="textarea mt-2 w-full" rows={3} maxLength={1000} value={notes} disabled={isExecuting} onChange={(event) => setNotes(event.target.value)} /></label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </AlertDialog.Body>
        <AlertDialog.Footer><Button slot="close" className="min-h-11" variant="tertiary" isDisabled={isExecuting}>Cancel</Button><Button className="min-h-11" isPending={isExecuting} isDisabled={blocked} onPress={closeDate}>Confirm close</Button></AlertDialog.Footer>
      </AlertDialog.Dialog></AlertDialog.Container>
    </AlertDialog.Backdrop>
  </div>;
}
