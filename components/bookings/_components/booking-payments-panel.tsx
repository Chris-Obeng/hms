"use client";

import * as React from "react";
import { Button, Chip, Input, toast } from "@heroui/react";
import { Banknote, CircleDollarSign, CreditCard, Landmark, Plus, Smartphone, Wallet, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getMethodLabel } from "@/lib/booking-status";
import { type FullBookingDetail } from "./booking-detail-types";
import { getBookingPaymentAvailability } from "./booking-payment-availability";
import { recordPayment } from "@/app/actions/bookings-detail";

interface BookingPaymentsPanelProps {
  booking: FullBookingDetail;
  currency: string;
  onBookingChanged?: () => void;
  onRefresh: () => void;
  /** Optional optimistic callback fired immediately before server action resolves. */
  onOptimisticPayment?: (entry: {
    bookingId: string;
    amount: number;
    method: string;
    notes: string;
  }) => () => void;
  /** Drawer owns the "Record payment" footer; the panel renders its own CTA when standalone. */
  formOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
}

function PaymentMethodIcon({ method }: { method: string | null }) {
  const className = "size-4 text-muted-foreground";
  switch (method) {
    case "cash":
      return <Banknote className={className} />;
    case "pos":
    case "card":
      return <CreditCard className={className} />;
    case "mobile_money":
      return <Smartphone className={className} />;
    case "bank_transfer":
      return <Landmark className={className} />;
    default:
      return <CircleDollarSign className={className} />;
  }
}

export { getBookingPaymentAvailability };

export function BookingPaymentsPanel({
  booking,
  currency,
  onBookingChanged,
  onRefresh,
  onOptimisticPayment,
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
      const suggested =
        outstandingBalance > 0 ? String(Math.round(outstandingBalance * 100) / 100) : "";
      setPaymentAmount(suggested);
    }
    setPaymentMethod("cash");
    setPaymentNotes("");
  };

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
    const numericAmount = parseFloat(paymentAmount);
    if (!targetId || !numericAmount || numericAmount <= 0) return;

    const methodSnapshot = paymentMethod;
    const notesSnapshot = paymentNotes.trim();
    const rollback = onOptimisticPayment?.({
      bookingId: targetId,
      amount: numericAmount,
      method: methodSnapshot,
      notes: notesSnapshot,
    });

    if (rollback) {
      setShowForm(false);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentNotes("");
    } else {
      setSavingPayment(true);
    }

    const result = await recordPayment({
      bookingId: targetId,
      amount: numericAmount,
      method: methodSnapshot,
      notes: notesSnapshot,
    });
    setSavingPayment(false);

    if (result.success) {
      toast.success("Payment recorded");
      if (!rollback) {
        setShowForm(false);
        setPaymentAmount("");
        setPaymentMethod("cash");
        setPaymentNotes("");
      }
      onRefresh();
      if (onBookingChanged) onBookingChanged();
    } else {
      rollback?.();
      toast.danger(result.error || "Failed to record payment");
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* Balance band */}
      <section aria-label="Balance" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-[var(--ease-out-ui)] motion-reduce:animate-none px-6 pb-2 pt-6">
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4",
            isFullyPaid ? "bg-emerald-500/[0.07]" : "bg-secondary/60"
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {isFullyPaid ? "Balance settled" : "Balance due"}
              </p>
              <Chip
                size="sm"
                variant="soft"
                color={isFullyPaid ? "success" : amountPaid > 0 ? "warning" : "default"}
              >
                {isFullyPaid ? "Paid in full" : amountPaid > 0 ? "Partial" : "Unpaid"}
              </Chip>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] tabular-nums text-foreground">
              {formatCurrency(isFullyPaid ? 0 : outstandingBalance, currency)}
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              Paid {formatCurrency(amountPaid, currency)} of {formatCurrency(totalDue, currency)}
            </p>
          </div>

          {!controlled && canTakePayment && !isFullyPaid && !showForm && (
            <Button variant="primary" onPress={openForm} className="shrink-0 rounded-xl font-semibold">
              <Plus className="size-4" aria-hidden="true" />
              Record payment
            </Button>
          )}
        </div>
      </section>

      {/* Inline Record payment form (when opened) */}
      {showForm && (
        <form
          onSubmit={handleRecordPayment}
          className="mx-6 mt-4 flex flex-col gap-3 rounded-2xl border border-border/60 p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Record payment</span>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Close payment form"
              onPress={() => setShowForm(false)}
              className="rounded-lg text-muted-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Amount ({currency})
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="h-11 rounded-xl border-border/70 bg-card text-base tabular-nums sm:h-10 sm:text-sm"
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
            placeholder="Receipt reference or note (optional)"
            className="h-11 rounded-xl border-border/70 bg-card text-base sm:h-10 sm:text-sm"
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="tertiary" onPress={() => setShowForm(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isPending={savingPayment}
              isDisabled={!paymentAmount || Number(paymentAmount) <= 0 || (!!group && !selectedLineId)}
              className="rounded-xl font-semibold"
            >
              Save payment
            </Button>
          </div>
        </form>
      )}

      {/* Charges band */}
      <section aria-label="Charges" className="px-6 pt-4">
        <h3 className="text-xs font-medium text-muted-foreground">Charges</h3>
        {group ? (
          group.lines.map((l, index) => (
            <ChargeRow
              key={l.id}
              name={`${
                (Math.max(1, l.roomsCount ?? 1) > 1 ? `${Math.max(1, l.roomsCount ?? 1)} × ` : "") +
                (l.roomTypeName ?? "Room")
              }${l.roomNumber ? ` · Rm ${l.roomNumber.replace(/^\s*(?:room|rm)\.?\s*/i, "")}` : ""}`}
              sub={
                `${l.nights ?? booking.nights ?? ""} ${
                  (l.nights ?? booking.nights ?? 1) === 1 ? "night" : "nights"
                }`.trim() || null
              }
              amount={formatCurrency(l.totalAmount, currency)}
              first={index === 0}
            />
          ))
        ) : (
          <>
            <ChargeRow
              first
              name={booking.roomType?.name ?? "Room charge"}
              sub={
                booking.roomRate
                  ? `${booking.nights ?? 1} ${
                      (booking.nights ?? 1) === 1 ? "night" : "nights"
                    } × ${formatCurrency(booking.roomRate, currency)}`
                  : null
              }
              amount={formatCurrency(booking.subtotal, currency)}
            />
            {(booking.taxAmount ?? 0) > 0 && (
              <ChargeRow
                name="Tax"
                amount={formatCurrency(booking.taxAmount ?? 0, currency)}
                quiet
              />
            )}
            {booking.earlyDepartureFee > 0 && (
              <ChargeRow
                name="Early departure fee"
                sub="Nights not used after an early check-out"
                amount={formatCurrency(booking.earlyDepartureFee, currency)}
              />
            )}
            <ChargeRow name="Total charges" amount={formatCurrency(booking.totalAmount, currency)} strong />
          </>
        )}
        {group && (
          <>
            {group.taxAmount > 0 && (
              <ChargeRow name="Tax" amount={formatCurrency(group.taxAmount, currency)} quiet />
            )}
            {group.earlyDepartureFee > 0 && (
              <ChargeRow
                name="Early departure fees"
                amount={formatCurrency(group.earlyDepartureFee, currency)}
                quiet
              />
            )}
            <ChargeRow name="Total charges" amount={formatCurrency(group.total, currency)} strong />
          </>
        )}
      </section>

      {/* Payment history band */}
      <section aria-label="Payment history" className="px-6 pb-6 pt-4">
        <h3 className="text-xs font-medium text-muted-foreground">Payments</h3>
        {booking.payments.length > 0 ? (
          booking.payments.map((payment, index) => (
            <div key={payment.id}>
              {index > 0 && <div className="h-px bg-border/45" aria-hidden="true" />}
              <div className="flex items-center gap-3 py-3">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"
                >
                  <PaymentMethodIcon method={payment.method} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {getMethodLabel(payment.method)}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {formatDateTime(payment.paidAt ?? payment.createdAt)}
                    {payment.notes ? ` · ${payment.notes}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    payment.status === "success"
                      ? "text-emerald-600"
                      : "text-muted-foreground"
                  )}
                >
                  {formatCurrency(payment.amount, currency)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-3 py-4 text-xs text-muted-foreground">
            <Wallet className="size-4 text-muted-foreground/50" aria-hidden="true" />
            <span>No payments recorded yet</span>
          </div>
        )}
      </section>
    </div>
  );
}

function ChargeRow({
  name,
  sub,
  amount,
  strong = false,
  quiet = false,
  first = false,
}: {
  name: string;
  sub?: string | null;
  amount: string;
  strong?: boolean;
  quiet?: boolean;
  first?: boolean;
}) {
  return (
    <div>
      {!first && <div className="h-px bg-border/45" aria-hidden="true" />}
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-sm",
              strong
                ? "font-semibold text-foreground"
                : quiet
                  ? "text-xs text-muted-foreground"
                  : "font-medium text-foreground"
            )}
          >
            {name}
          </p>
          {sub && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{sub}</p>}
        </div>
        <span
          className={cn(
            "shrink-0 tabular-nums",
            strong
              ? "text-sm font-semibold text-foreground"
              : quiet
                ? "text-xs text-muted-foreground"
                : "text-sm font-medium text-foreground"
          )}
        >
          {amount}
        </span>
      </div>
    </div>
  );
}
