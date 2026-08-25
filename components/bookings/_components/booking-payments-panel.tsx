"use client";

import * as React from "react";
import { Button, Input, toast } from "@heroui/react";
import { BanknoteArrowUp, CheckCircle2, Wallet, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
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

  const amountPaid = booking?.amountPaid || 0;
  const outstandingBalance = booking
    ? Math.max(0, booking.outstandingBalance ?? booking.totalAmount - amountPaid)
    : 0;
  const isFullyPaid = outstandingBalance <= 0 && booking.totalAmount > 0;
  const paidPercent =
    booking.totalAmount > 0
      ? Math.min(100, Math.round((amountPaid / booking.totalAmount) * 100))
      : 0;

  const openPaymentForm = () => {
    const suggested = booking?.outstandingBalance
      ? String(Math.round(booking.outstandingBalance * 100) / 100)
      : "";
    setPaymentAmount(suggested);
    setPaymentMethod("cash");
    setPaymentNotes("");
    setShowPaymentForm(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking.id || !paymentAmount) return;

    setSavingPayment(true);
    const result = await recordPayment({
      bookingId: booking.id,
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {isFullyPaid ? "Balance settled" : "Outstanding balance"}
          </p>
          {isFullyPaid && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Paid in full
            </span>
          )}
        </div>

        <p className="mt-1 text-kpi text-foreground">
          {formatCurrency(isFullyPaid ? booking.totalAmount : outstandingBalance, currency)}
        </p>
        {!isFullyPaid && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            of {formatCurrency(booking.totalAmount, currency)} total
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
          <MiniStat label="Total" value={formatCurrency(booking.totalAmount, currency)} strong />
          <MiniStat label="Paid" value={formatCurrency(amountPaid, currency)} className="text-emerald-600 dark:text-emerald-400" />
          <MiniStat
            label="Due"
            value={isFullyPaid ? "—" : formatCurrency(outstandingBalance, currency)}
            className={cn(!isFullyPaid && "text-destructive")}
          />
        </div>

        <p className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground/80">
          <span>
            {booking.roomRate
              ? `${formatCurrency(booking.roomRate, currency)}/night`
              : "—"}{" "}
            · {formatCurrency(booking.subtotal, currency)} +{" "}
            {booking.taxAmount ? formatCurrency(booking.taxAmount, currency) : "0"} tax
          </span>
        </p>
      </section>

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
              isDisabled={!paymentAmount || Number(paymentAmount) <= 0}
              className="h-9 rounded-xl bg-foreground px-4 text-xs font-semibold text-background hover:bg-foreground/90 active:scale-[0.98]"
            >
              {savingPayment ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </form>
      ) : (
        !["cancelled", "checked_out"].includes(booking.status ?? "") &&
        !isFullyPaid && (
          <Button
            variant="outline"
            onPress={openPaymentForm}
            className="h-11 w-full rounded-xl border-border/70 bg-background text-[13px] font-semibold text-foreground shadow-xs transition-colors hover:border-foreground/30 hover:bg-muted/40 active:scale-[0.99]"
          >
            <BanknoteArrowUp className="size-4 text-primary" />
            Take payment
          </Button>
        )
      )}

      {/* ── History ─────────────────────────────────────────────── */}
      <section aria-label="Payment history">
        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
          History{booking.payments.length > 0 ? ` · ${booking.payments.length}` : ""}
        </p>
        {booking.payments.length > 0 ? (
          <div className="space-y-2">
            {booking.payments.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} currency={currency} />
            ))}
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

function MiniStat({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-[13px]",
          strong ? "font-semibold text-foreground" : "font-medium",
          className ?? "text-foreground/80"
        )}
      >
        {value}
      </p>
    </div>
  );
}
