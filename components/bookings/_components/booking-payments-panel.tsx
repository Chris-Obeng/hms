"use client";

import * as React from "react";
import { Button, Input, toast } from "@heroui/react";
import { BanknoteArrowUp, CheckCircle2, Wallet, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { MiniStat } from "@/components/ui/mini-stat";
import { PaymentRow } from "./booking-payment-row";
import { formatCurrency } from "@/lib/format";
import { type FullBookingDetail } from "./booking-detail-types";
import { recordPayment } from "@/app/actions/bookings-detail";

interface BookingPaymentsPanelProps {
  booking: FullBookingDetail;
  currency: string;
  onBookingChanged?: () => void;
  onRefresh: () => void;
}

export function BookingPaymentsPanel({
  booking,
  currency,
  onBookingChanged,
  onRefresh,
}: BookingPaymentsPanelProps) {
  const [showPaymentForm, setShowPaymentForm] = React.useState(false);
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<
    "cash" | "pos" | "bank_transfer" | "mobile_money" | "card" | "other"
  >("cash");
  const [paymentNotes, setPaymentNotes] = React.useState("");
  const [savingPayment, setSavingPayment] = React.useState(false);
  // Grouped reservations credit a chosen line — record_payment_atomic settles one
  // booking id, so posting a group amount to the anchor would leave siblings unpaid.
  const [selectedLineId, setSelectedLineId] = React.useState("");

  const group = booking.group;
  // Group money is the SUM across sibling lines; a single booking uses its own row.
  const totalDue = group ? group.total : booking.totalAmount;
  const amountPaid = group ? group.amountPaid : booking?.amountPaid || 0;
  const outstandingBalance = group
    ? Math.max(0, group.outstanding)
    : Math.max(0, booking.outstandingBalance ?? booking.totalAmount - amountPaid);
  const isFullyPaid = outstandingBalance <= 0 && totalDue > 0;
  const paidPercent =
    totalDue > 0 ? Math.min(100, Math.round((amountPaid / totalDue) * 100)) : 0;

  // Lines that can still take a manual payment (grouped reservations only).
  const payableLines = group
    ? group.lines.filter(
        (l) => l.outstanding > 0 && !["cancelled", "checked_out"].includes(l.status ?? "")
      )
    : [];

  // A group follows its payable lines, not the anchor: a checked-out anchor can
  // still have an owing sibling, and a checked-out sibling must not hide the CTA.
  const canTakePayment = group
    ? payableLines.length > 0
    : !["cancelled", "checked_out"].includes(booking.status ?? "");

  const openPaymentForm = () => {
    if (group) {
      const first = payableLines[0];
      setSelectedLineId(first?.id ?? "");
      setPaymentAmount(first ? String(Math.round(first.outstanding * 100) / 100) : "");
    } else {
      const suggested = booking?.outstandingBalance
        ? String(Math.round(booking.outstandingBalance * 100) / 100)
        : "";
      setPaymentAmount(suggested);
    }
    setPaymentMethod("cash");
    setPaymentNotes("");
    setShowPaymentForm(true);
  };

  const onSelectLine = (id: string) => {
    setSelectedLineId(id);
    const line = group?.lines.find((l) => l.id === id);
    if (line) setPaymentAmount(String(Math.round(line.outstanding * 100) / 100));
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = group ? selectedLineId : booking.id;
    if (!targetId || !paymentAmount) return;

    setSavingPayment(true);
    const result = await recordPayment({
      bookingId: targetId,
      amount: parseFloat(paymentAmount),
      method: paymentMethod,
      notes: paymentNotes,
    });
    setSavingPayment(false);

    if (result.success) {
      toast.success("Payment recorded");
      setShowPaymentForm(false);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentNotes("");
      onRefresh();
      if (onBookingChanged) onBookingChanged();
    } else {
      toast.danger(result.error || "Failed to record payment");
    }
  };

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      {/* ── Balance card ────────────────────────────────────────── */}
      <section
        aria-label="Balance"
        className={cn(
          "rounded-2xl border p-4",
          isFullyPaid
            ? "border-emerald-500/25 bg-emerald-500/[0.04]"
            : "border-border/60 bg-card"
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {isFullyPaid ? "Balance settled" : "Outstanding balance"}
          </p>
          {isFullyPaid && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
              <CheckCircle2 className="size-3.5" />
              Paid in full
            </span>
          )}
        </div>

        <p className="mt-1 text-kpi text-foreground">
          {formatCurrency(isFullyPaid ? totalDue : outstandingBalance, currency)}
        </p>
        {!isFullyPaid && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            of {formatCurrency(totalDue, currency)} total
          </p>
        )}

        {/* Progress */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/80">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isFullyPaid ? "bg-emerald-500" : "bg-primary/70"
            )}
            style={{ width: `${Math.max(paidPercent, amountPaid > 0 ? 6 : 0)}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-[11px] tabular-nums">
          <MiniStat label="Total" value={formatCurrency(totalDue, currency)} strong />
          <MiniStat label="Paid" value={formatCurrency(amountPaid, currency)} className="text-emerald-600" />
          <MiniStat
            label="Due"
            value={isFullyPaid ? "—" : formatCurrency(outstandingBalance, currency)}
            className={cn(!isFullyPaid && "text-destructive")}
          />
        </div>

        <p className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground/80">
          <span>
            {group ? (
              <>
                {group.totalRooms} {group.totalRooms === 1 ? "room" : "rooms"} ·{" "}
                {formatCurrency(group.subtotal, currency)} +{" "}
                {formatCurrency(group.taxAmount, currency)} tax
              </>
            ) : (
              <>
                {booking.roomRate
                  ? `${formatCurrency(booking.roomRate, currency)}/night`
                  : "—"}{" "}
                · {formatCurrency(booking.subtotal, currency)} +{" "}
                {booking.taxAmount ? formatCurrency(booking.taxAmount, currency) : "0"} tax
              </>
            )}
          </span>
        </p>
      </section>

      {/* ── Per-line charges (grouped reservations) ─────────────── */}
      {group && (
        <section aria-label="Charges by room" className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
          <p className="border-b border-border/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            Charges by room
          </p>
          <div className="divide-y divide-border/40 px-4">
            {group.lines.map((l) => {
              const qty = Math.max(1, l.roomsCount ?? 1);
              const linePaid = l.outstanding <= 0 && l.totalAmount > 0;
              return (
                <div key={l.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {qty > 1 ? `${qty} × ` : ""}
                      {l.roomTypeName ?? "Room"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {linePaid ? (
                        <span className="text-emerald-600">Paid</span>
                      ) : (
                        <>{formatCurrency(l.outstanding, currency)} due</>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                    {formatCurrency(l.totalAmount, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Record payment ──────────────────────────────────────── */}
      {showPaymentForm ? (
        <form
          onSubmit={handleRecordPayment}
          className="space-y-3.5 rounded-2xl border border-border/60 bg-card p-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-foreground">Record payment</span>
            <button
              type="button"
              aria-label="Close payment form"
              onClick={() => setShowPaymentForm(false)}
              className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {group && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Apply to room *
              </label>
              <HeroSelectField
                value={selectedLineId}
                onValueChange={onSelectLine}
                options={payableLines.map((l) => ({
                  value: l.id,
                  label: `${l.roomTypeName ?? "Room"} · ${formatCurrency(l.outstanding, currency)} due`,
                }))}
                ariaLabel="Room line to credit"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Amount ({currency}) *
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="h-9 rounded-xl text-sm tabular-nums"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Method *
              </label>
              <HeroSelectField
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "pos", label: "POS" },
                  { value: "mobile_money", label: "Mobile Money" },
                  { value: "bank_transfer", label: "Bank Transfer" },
                  { value: "card", label: "Card" },
                  { value: "other", label: "Other" },
                ]}
                ariaLabel="Payment method"
              />
            </div>
          </div>

          <Input
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
            placeholder="Reference or note (optional)"
            className="h-9 rounded-xl text-sm"
          />

          <div className="flex items-center justify-end gap-2 pt-0.5">
            <Button
              variant="tertiary"
              size="sm"
              className="h-9 rounded-xl px-3.5 text-xs"
              onPress={() => setShowPaymentForm(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isPending={savingPayment}
              isDisabled={!paymentAmount || Number(paymentAmount) <= 0 || (!!group && !selectedLineId)}
              className="h-9 rounded-xl bg-amber-700 px-4 text-xs font-semibold text-white hover:bg-amber-800 active:scale-[0.98]"
            >
              {savingPayment ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </form>
      ) : (
        canTakePayment &&
        !isFullyPaid && (
          <Button
            variant="outline"
            onPress={openPaymentForm}
            className="h-11 w-full rounded-xl border-amber-500/40 bg-amber-500/[0.04] text-[13px] font-semibold text-amber-700 shadow-xs transition-colors hover:border-amber-500/60 hover:bg-amber-500/10 active:scale-[0.99]"
          >
            <BanknoteArrowUp className="size-4 text-amber-600" />
            Take payment
          </Button>
        )
      )}

      {/* ── History ─────────────────────────────────────────────── */}
      <section aria-label="Payment history">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          History{booking.payments.length > 0 ? ` · ${booking.payments.length}` : ""}
        </p>
        {booking.payments.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
            <div className="divide-y divide-border/40 px-3">
              {booking.payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} currency={currency} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-8 text-center">
            <Wallet className="mb-2 size-6 text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground/60">No payments recorded yet</p>
          </div>
        )}
      </section>
    </div>
  );
}
