"use client";

import * as React from "react";
import { Banknote, CreditCard, Smartphone, Landmark, CircleDollarSign } from "lucide-react";

import { Chip } from "@heroui/react";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getMethodLabel } from "@/lib/booking-status";
import type { PaymentRecord } from "./booking-detail-types";

function PaymentMethodIcon({ method }: { method: string | null }) {
  const className = "size-3.5 text-muted-foreground";
  switch (method) {
    case "cash":
      return <Banknote className={className} />;
    case "pos":
      return <CreditCard className={className} />;
    case "mobile_money":
      return <Smartphone className={className} />;
    case "bank_transfer":
      return <Landmark className={className} />;
    case "card":
      return <CreditCard className={className} />;
    default:
      return <CircleDollarSign className={className} />;
  }
}

export function PaymentRow({ payment, currency }: { payment: PaymentRecord; currency: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-background p-3 transition-colors hover:border-border/60">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
        <PaymentMethodIcon method={payment.method} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {formatCurrency(payment.amount, currency)}
          </span>
          <Chip
            variant="secondary"
            size="sm"
            className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
          >
            {getMethodLabel(payment.method)}
          </Chip>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{formatDateTime(payment.createdAt)}</span>
          {payment.recordedByName && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>{payment.recordedByName}</span>
            </>
          )}
        </div>
        {payment.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground/70">{payment.notes}</p>
        )}
      </div>
      <Chip
        color={payment.status === "success" ? "success" : "default"}
        variant="soft"
        size="sm"
        className="h-5 shrink-0 px-1.5 text-[10px]"
      >
        {payment.status === "success" ? "Success" : payment.status || "Pending"}
      </Chip>
    </div>
  );
}
