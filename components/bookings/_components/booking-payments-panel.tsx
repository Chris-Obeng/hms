"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Wallet, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PaymentRow } from "./booking-payment-row";
import {
  formatCurrency,
  type FullBookingDetail,
} from "./booking-detail-types";
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
  const [paymentMethod, setPaymentMethod] = React.useState<"cash" | "pos" | "bank_transfer" | "mobile_money" | "card" | "other">("cash");
  const [paymentNotes, setPaymentNotes] = React.useState("");
  const [savingPayment, setSavingPayment] = React.useState(false);

  const amountPaid = booking?.amountPaid || 0;
  const outstandingBalance = booking
    ? Math.max(0, (booking.outstandingBalance ?? booking.totalAmount - amountPaid))
    : 0;
  const isFullyPaid = outstandingBalance <= 0;

  const openPaymentForm = () => {
    const suggested = booking?.outstandingBalance
      ? Math.min(booking.outstandingBalance, booking.totalAmount).toString()
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
      toast.error(result.error || "Failed to record payment");
    }
  };

  return (
    <div className="px-5 py-4 space-y-5">
      {/* Payment Summary */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Room Rate</span>
          <span className="text-sm text-foreground">
            {booking.roomRate
              ? `${formatCurrency(booking.roomRate, currency)}/night`
              : "—"}
          </span>
        </div>
        <Separator className="opacity-30" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Subtotal</span>
          <span className="text-sm text-foreground">
            {formatCurrency(booking.subtotal, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Tax</span>
          <span className="text-sm text-foreground">
            {booking.taxAmount
              ? formatCurrency(booking.taxAmount, currency)
              : "—"}
          </span>
        </div>
        <Separator className="opacity-30" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">Total</span>
          <span className="text-base font-semibold text-foreground">
            {formatCurrency(booking.totalAmount, currency)}
          </span>
        </div>
        <Separator className="opacity-30" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Paid</span>
          <span className="text-sm font-medium text-emerald-600">
            {formatCurrency(amountPaid, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Outstanding</span>
          <span
            className={cn(
              "text-sm font-semibold",
              isFullyPaid ? "text-emerald-600" : "text-destructive"
            )}
          >
            {isFullyPaid
              ? "Fully Paid"
              : formatCurrency(outstandingBalance, currency)}
          </span>
        </div>
      </div>

      {/* Record Payment Form */}
      {showPaymentForm ? (
        <form onSubmit={handleRecordPayment} className="rounded-xl border border-border/50 p-4 space-y-4 bg-muted/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Record Payment
            </span>
            <button
              type="button"
              onClick={() => setShowPaymentForm(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                Amount *
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="h-9 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as typeof paymentMethod)
                }
                className="h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="cash">Cash</option>
                <option value="pos">POS</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
              Notes (optional)
            </label>
            <textarea
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="Payment reference or notes..."
              rows={2}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs rounded-lg"
              onClick={() => setShowPaymentForm(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs rounded-lg bg-foreground text-background hover:bg-foreground/90"
              disabled={savingPayment || !paymentAmount}
            >
              {savingPayment ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </form>
      ) : (
        !["cancelled", "checked_out"].includes(booking.status ?? "") && (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl text-xs h-9 border-dashed border-border/60"
            onClick={openPaymentForm}
          >
            <Plus className="size-3 mr-1.5" />
            Record Payment
          </Button>
        )
      )}

      {/* Payment History */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Payment History
          {booking.payments.length > 0 && (
            <span className="ml-1.5 text-muted-foreground/50">
              ({booking.payments.length})
            </span>
          )}
        </p>
        {booking.payments.length > 0 ? (
          <div className="space-y-2">
            {booking.payments.map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                currency={currency}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Wallet className="size-7 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground/60">
              No payments recorded yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
