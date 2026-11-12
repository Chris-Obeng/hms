"use client";

import * as React from "react";
import {
  Banknote,
  CreditCard,
  Smartphone,
  Landmark,
  CircleDollarSign,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getMethodLabel, PAYMENT_RECORD_TONE } from "@/lib/booking-status";
import type { PaymentRecord } from "./booking-detail-types";

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

export function PaymentRow({ payment, currency }: { payment: PaymentRecord; currency: string }) {
  const needsAttention = payment.status && payment.status !== "success";

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/60">
        <PaymentMethodIcon method={payment.method} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {getMethodLabel(payment.method)}
          </span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
            {formatCurrency(payment.amount, currency)}
          </span>
        </div>

        {payment.roomLabel && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground/80">{payment.roomLabel}</p>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">{formatDateTime(payment.createdAt)}</span>
            {payment.recordedByName && (
              <>
                <span className="shrink-0 text-muted-foreground/30">·</span>
                <span className="truncate">{payment.recordedByName}</span>
              </>
            )}
          </p>
          {needsAttention && (
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium capitalize",
                PAYMENT_RECORD_TONE[payment.status as string] ?? "text-muted-foreground"
              )}
            >
              {payment.status}
            </span>
          )}
        </div>

        {payment.notes && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground/70">{payment.notes}</p>
        )}
      </div>
    </div>
  );
}
