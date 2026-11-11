"use client";

import * as React from "react";
import { Input, toast } from "@heroui/react";
import { Banknote, CircleDollarSign, CreditCard, Landmark, Smartphone, Wallet, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getMethodLabel } from "@/lib/booking-status";
import { type FullBookingDetail } from "./booking-detail-types";
import { recordPayment } from "@/app/actions/bookings-detail";

interface BookingPaymentsPanelProps {
  booking: FullBookingDetail;
  currency: string;
  onBookingChanged?: () => void;
  onRefresh: () => void;
  /** Drawer owns the "Record payment" footer; the panel renders its own CTA when standalone. */
  formOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
}

function PaymentMethodIcon({ method }: { method: string | null }) {
  const className = "size-3.5 text-muted-foreground/60";
  switch (method) {
    case "cash": return <Banknote className={className} />;
    case "pos":
    case "card": return <CreditCard className={className} />;
    case "mobile_money": return <Smartphone className={className} />;
    case "bank_transfer": return <Landmark className={className} />;
    default: return <CircleDollarSign className={className} />;
  }
}

export function getBookingPaymentAvailability(booking: FullBookingDetail) {
  const group = booking.group;
  const totalDue = group ? group.total : booking.totalAmount;
  const amountPaid = group ? group.amountPaid : booking?.amountPaid || 0;
  const outstandingBalance = group
    ? Math.max(0, group.outstanding)
    : Math.max(0, booking.outstandingBalance ?? booking.totalAmount - amountPaid);
  const isFullyPaid = outstandingBalance <= 0 && totalDue > 0;
  const payableLines = group
    ? group.lines.filter(
        (l) => l.outstanding > 0 && !["cancelled", "checked_out"].includes(l.status ?? "")
      )
    : [];
  const canTakePayment = group
    ? payableLines.length > 0
    : !["cancelled", "checked_out"].includes(booking.status ?? "");

  return { group, totalDue, amountPaid, outstandingBalance, isFullyPaid, payableLines, canTakePayment };
}

/**
 * Payment bands per the design: soft balance block (no progress bar), charges
 * rows, payment history, and the record form opened from the footer CTA.
 */
export function BookingPaymentsPanel({
  booking,
  currency,
  onBookingChanged,
  onRefresh,
  formOpen,
  onFormOpenChange,
}: BookingPaymentsPanelProps) {
  const controlled = formOpen !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const showForm = controlled ? formOpen : internalOpen;
  const setShowForm = (open: boolean) => {
    if (controlled) onFormOpenChange?.(open);
    else setInternalOpen(open);
  };

  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<
    "cash" | "pos" | "bank_transfer" | "mobile_money" | "card" | "other"
  >("cash");
  const [paymentNotes, setPaymentNotes] = React.useState("");
  const [savingPayment, setSavingPayment] = React.useState(false);
  // Grouped reservations credit a chosen line — record_payment_atomic settles one
  // booking id, so posting a group amount to the anchor would leave siblings unpaid.
  const [selectedLineId, setSelectedLineId] = React.useState("");

  const {
    group,
    totalDue,
    amountPaid,
    outstandingBalance,
    isFullyPaid,
    payableLines,
    canTakePayment,
  } = getBookingPaymentAvailability(booking);

  const prefillFormFields = () => {
    if (group) {
      const first = payableLines[0];
      setSelectedLineId(first?.id ?? "");
      setPaymentAmount(first ? String(Math.round(first.outstanding * 100) / 100) : "");
    } else {
      const suggested = outstandingBalance > 0
        ? String(Math.round(outstandingBalance * 100) / 100)
        : "";
      setPaymentAmount(suggested);
    }
    setPaymentMethod("cash");
    setPaymentNotes("");
  };

  // Prefill whenever a controlled drawer footer opens the form or switches bookings.
  const formSessionKey = showForm ? booking.id : null;
  const [initializedKey, setInitializedKey] = React.useState<string | null>(null);
  if (formSessionKey !== initializedKey) {
    setInitializedKey(formSessionKey);
    if (formSessionKey !== null) {
      prefillFormFields();
    }
  }

  const openForm = () => {
    prefillFormFields();
    setShowForm(true);
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
      setShowForm(false);
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
    <div className="flex min-h-full flex-col">
      {/* Balance band */}
      <section aria-label="Balance" className="border-b border-border/60 px-6 py-5">
        <div className={cn(
          "flex flex-col gap-2 rounded-2xl bg-secondary px-5 py-4",
          isFullyPaid && "bg-[var(--success)]/[0.06]",
        )}>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {isFullyPaid ? "Balance settled" : "Balance due"}
            </p>
            <span className="min-w-0 flex-1" aria-hidden="true" />
            {isFullyPaid ? (
              <span className="rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--success)]">Paid in full</span>
            ) : amountPaid > 0 ? (
              <span className="rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--warning)]">Partial</span>
            ) : null}
          </div>
          <p className="font-mono text-[26px] font-semibold leading-none tracking-[-0.5px] text-foreground tabular-nums">
            {formatCurrency(isFullyPaid ? totalDue : outstandingBalance, currency)}
          </p>
          <p className="max-md:text-xs text-xs text-muted-foreground">of {formatCurrency(totalDue, currency)} total</p>
        </div>
      </section>

      {/* Charges band */}
      <section aria-label="Charges" className="border-b border-border/60 px-6 py-1.5">
        {group ? (
          group.lines.map((l, index) => <ChargeRow
            key={l.id}
            name={`${(Math.max(1, l.roomsCount ?? 1) > 1 ? `${Math.max(1, l.roomsCount ?? 1)} × ` : "") + (l.roomTypeName ?? "Room")}${l.roomNumber ? ` · ${l.roomNumber}` : ""}`}
            sub={`${l.nights ?? booking.nights ?? ""} ${(l.nights ?? booking.nights ?? 1) === 1 ? "night" : "nights"}`.trim() || null}
            amount={formatCurrency(l.totalAmount, currency)}
            first={index === 0}
          />)
        ) : (
          <>
            <ChargeRow first name={booking.roomType?.name ?? "Room"}
              sub={booking.roomRate ? `${booking.nights ?? ""} nights × ${formatCurrency(booking.roomRate, currency)}` : null}
              amount={formatCurrency(booking.subtotal, currency)} />
            {(booking.taxAmount ?? 0) > 0 && (
              <ChargeRow name="Tax (VAT)" amount={formatCurrency(booking.taxAmount ?? 0, currency)} quiet />
            )}
            <ChargeRow name="Total" amount={formatCurrency(booking.totalAmount, currency)} strong />
          </>
        )}
        {group && (
          <>
            <ChargeRow name="Tax (VAT)" amount={formatCurrency(group.taxAmount, currency)} quiet />
            <ChargeRow name="Total" amount={formatCurrency(group.total, currency)} strong />
          </>
        )}
      </section>

      {/* Payment history band */}
      <section aria-label="Payment history" className="border-b border-border/60 px-6 py-1.5">
        {booking.payments.length > 0 ? booking.payments.map((payment, index) => (
          <div key={payment.id}>
            {index > 0 && <div className="h-px bg-border/50" aria-hidden="true" />}
            <div className="flex items-center gap-2.5 py-3">
              <PaymentMethodIcon method={payment.method} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">{getMethodLabel(payment.method)}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatDateTime(payment.paidAt ?? payment.createdAt)}
                  {payment.notes ? ` · ${payment.notes}` : ""}
                </p>
              </div>
              <span className={cn("shrink-0 font-mono text-xs font-semibold tabular-nums",
                payment.status === "success" ? "text-[var(--success)]" : "text-muted-foreground")}>
                {formatCurrency(payment.amount, currency)}
              </span>
            </div>
          </div>
        )) : (
          <div className="flex flex-col items-center py-6 text-center">
            <Wallet className="mb-2 size-6 text-muted-foreground/25" aria-hidden="true" />
            <p className="text-xs text-muted-foreground/70">No payments recorded yet</p>
          </div>
        )}
      </section>

      {/* Record payment form — opened from the footer CTA */}
      {showForm && (
        <form onSubmit={handleRecordPayment} className="flex flex-1 flex-col gap-3 px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-foreground">Record payment</span>
            <button type="button" aria-label="Close payment form" onClick={() => setShowForm(false)}
              className="grid size-6 place-items-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          {group && (
            <HeroSelectField
              label="Apply to room"
              value={selectedLineId}
              onValueChange={onSelectLine}
              options={payableLines.map((l) => ({
                value: l.id,
                label: `${l.roomTypeName ?? "Room"} · ${formatCurrency(l.outstanding, currency)} due`,
              }))}
              ariaLabel="Room line to credit"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount ({currency})</label>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="h-10 rounded-[10px] text-[13px] tabular-nums"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Method</label>
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
            className="h-10 rounded-[10px] text-[13px]"
          />

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="h-9 rounded-full px-3.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={savingPayment || !paymentAmount || Number(paymentAmount) <= 0 || (!!group && !selectedLineId)}
              className="h-9 rounded-full bg-[var(--pen-accent)] px-4 text-xs font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60">
              {savingPayment ? "Recording…" : "Record payment"}
            </button>
          </div>
        </form>
      )}

      {/* Standalone CTA when no drawer footer owns the action (deep-link page). */}
      {!controlled && canTakePayment && !isFullyPaid && !showForm && (
        <div className="px-6 pb-5 pt-4">
          <button type="button" onClick={openForm}
            className="h-10 w-full rounded-full bg-[var(--pen-accent)] text-[13px] font-semibold text-white transition-transform active:scale-[0.99]">
            Record payment
          </button>
        </div>
      )}
    </div>
  );
}

function ChargeRow({ name, sub, amount, strong = false, quiet = false, first = false }: {
  name: string;
  sub?: string | null;
  amount: string;
  strong?: boolean;
  quiet?: boolean;
  first?: boolean;
}) {
  return <div>
    {!first && <div className="h-px bg-border/50" aria-hidden="true" />}
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className={cn("truncate text-[13px]", strong ? "font-semibold text-foreground" : quiet ? "text-xs text-muted-foreground" : "font-semibold text-foreground")}>
          {name}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      <span className={cn("shrink-0 font-mono tabular-nums",
        strong ? "text-[13px] font-semibold text-foreground" : quiet ? "text-xs font-medium text-foreground" : "text-[13px] font-semibold text-foreground")}>
        {amount}
      </span>
    </div>
  </div>;
}
