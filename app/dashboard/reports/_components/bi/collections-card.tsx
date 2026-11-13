"use client";

import { PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { DonutRing } from "@/components/ui/pen/donut-ring";
import { Card } from "@heroui/react";
import { cn } from "@/lib/utils";
import { BI_CARD, BI_CARD_DESCRIPTION, BI_CARD_HEADER, BI_CARD_TITLE } from "./bi-styles";
import { compactNumber, moneyAmount, share } from "./bi-format";
import type { MethodSlice } from "../../actions";

/** Design-file tender palette; anything unknown falls back to a quiet gray. */
const TENDER_COLORS: Record<string, string> = {
  mobile_money: "#14b8a6",
  card: "#0485F7",
  cash: "#94a3b8",
  bank_transfer: "#8b5cf6",
  pos: "#f59e0b",
  paystack_link: "#ec4899",
};
const FALLBACK_COLOR = "#cbd5e1";

interface TenderSlice { method: string; label: string; amount: number; color: string }

/** Collections ring above a legend that states each method's amount and exact share. */
export function CollectionsCard({ collected, byMethod, currency, className }: {
  collected: number;
  byMethod: MethodSlice[];
  currency: string;
  className?: string;
}) {
  const segments: TenderSlice[] = byMethod.filter((row) => row.amount > 0)
    .map((row) => ({ method: row.method, label: PAYMENT_METHOD_LABELS[row.method] ?? row.method, amount: row.amount, color: TENDER_COLORS[row.method] ?? FALLBACK_COLOR }))
    .sort((a, b) => b.amount - a.amount);
  const total = segments.reduce((sum, row) => sum + row.amount, 0);

  return <Card render={(props) => <section {...props} />} className={cn(BI_CARD, className)}>
    <Card.Header className={BI_CARD_HEADER}>
      <div className="min-w-0">
        <Card.Title render={(props) => <h2 {...props} />} className={BI_CARD_TITLE}>Collections</Card.Title>
        <Card.Description className={BI_CARD_DESCRIPTION}>By payment method · includes tax and deposits · {currency}</Card.Description>
      </div>
    </Card.Header>
    <Card.Content className="gap-0">
      {total > 0
        ? <div className="flex flex-1 flex-col items-center gap-6 sm:max-lg:flex-row">
          <DonutRing segments={segments.map(({ method, amount, color }) => ({ key: method, amount, color }))} total={total}
            value={`${currency} ${compactNumber(collected)}`} label="collected" size={160} valueSize={20} labelSize={12}
            ariaLabel={`${currency} ${moneyAmount(collected, currency)} collected.`} />
          <ul className="w-full min-w-0 divide-y divide-border/50">
            {segments.map((row) => <li key={row.method} className="flex min-h-10 items-center gap-2 py-2 text-[13px] leading-5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-foreground">{row.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">{moneyAmount(row.amount, currency)}</span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{share(row.amount, total)}</span>
            </li>)}
          </ul>
        </div>
        : <p className="flex flex-1 items-center justify-center py-8 text-center text-[13px] leading-5 text-muted-foreground">No collections recorded in this period.</p>}
    </Card.Content>
  </Card>;
}
