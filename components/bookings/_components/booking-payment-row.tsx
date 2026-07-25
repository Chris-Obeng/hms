"use client";

import * as React from "react";
import { Banknote, CreditCard, Smartphone, Landmark, CircleDollarSign } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getMethodLabel } from "@/lib/booking-status";
import type { PaymentRecord } from "./booking-detail-types";

function getMethodIcon(method: string | null) {
  switch (method) {
    case "cash":
      return Banknote;
    case "pos":
      return CreditCard;
    case "mobile_money":
      return Smartphone;
    case "bank_transfer":
      return Landmark;
    case "card":
      return CreditCard;
    default:
      return CircleDollarSign;
  }
}

export function PaymentRow({ payment, currency }: { payment: PaymentRecord; currency: string }) {
  const MethodIcon = getMethodIcon(payment.method);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-background p-3 transition-colors hover:border-border/60">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
        <MethodIcon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {formatCurrency(payment.amount, currency)}
          </span>
          <Badge
            variant="outline"
            className="text-caption px-1.5 py-0 h-5 font-normal text-muted-foreground"
          >
            {getMethodLabel(payment.method)}
          </Badge>
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
      <Badge
        variant={payment.status === "success" ? "default" : "outline"}
        className="text-caption px-1.5 py-0 h-5 shrink-0"
      >
        {payment.status === "success" ? "Success" : payment.status || "Pending"}
      </Badge>
    </div>
  );
}
