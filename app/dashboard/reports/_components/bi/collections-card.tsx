"use client";

import { Card } from "@heroui/react";
import { PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { DonutRing } from "@/components/ui/pen/donut-ring";
import { cn } from "@/lib/utils";
import { BI_CARD, BI_CARD_DESCRIPTION, BI_CARD_TITLE } from "./bi-styles";
import { moneyAmount, share } from "./bi-format";
import { OTHER_TENDER_COLOR, TENDER_COLORS } from "../report-utils";
import type { MethodSlice } from "../../actions";

/** Methods shown by name; anything past this folds into one "Other" row. */
const NAMED_METHODS = 4;
/** Distinct fallbacks for methods the theme has no token for, so no two arcs share a hue. */
const FALLBACK_COLORS = ["var(--chart-4)", "var(--chart-5)"];

interface Segment { key: string; label: string; value: number; color: string }

function toSegments(rows: MethodSlice[]): Segment[] {
  const sorted = rows.filter((row) => row.amount > 0).sort((a, b) => b.amount - a.amount);
  const named = sorted.length > NAMED_METHODS + 1 ? sorted.slice(0, NAMED_METHODS) : sorted;
  let fallback = 0;
  const segments = named.map((row) => ({
    key: row.method, label: PAYMENT_METHOD_LABELS[row.method] ?? row.method, value: row.amount,
    color: TENDER_COLORS[row.method] ?? FALLBACK_COLORS[fallback++ % FALLBACK_COLORS.length],
  }));
  const rest = sorted.slice(named.length);
  if (rest.length) segments.push({ key: "other", label: "Other", value: rest.reduce((sum, row) => sum + row.amount, 0), color: OTHER_TENDER_COLOR });
  return segments;
}

/**
 * Payments received in the period: the total as a figure, a ring with an empty
 * centre for the split, and each method's amount and share beside it.
 */
export function CollectionsCard({ collected, byMethod, currency, className }: {
  collected: number;
  byMethod: MethodSlice[];
  currency: string;
  className?: string;
}) {
  const segments = toSegments(byMethod);
  const total = segments.reduce((sum, row) => sum + row.value, 0);
  const whole = (value: number) => moneyAmount(value, currency, { maximumFractionDigits: 0 });

  return <Card render={(props) => <section {...props} />} className={cn(BI_CARD, className)}>
    <div className="min-w-0">
      <h2 className={BI_CARD_TITLE}>Collections</h2>
      <p className={BI_CARD_DESCRIPTION}>Payments received, including tax and deposits</p>
    </div>
    {total > 0
      ? <>
        <p className="text-[28px] font-medium leading-8 tracking-[-0.01em] tabular-nums text-foreground">{whole(collected)}</p>
        <div className="flex flex-col items-center gap-6 sm:max-lg:flex-row">
          <DonutRing segments={segments.map(({ key, value, color }) => ({ key, amount: value, color }))} total={total} size={128}
            ariaLabel={`Collections by payment method: ${segments.map((row) => `${row.label} ${share(row.value, total)}`).join(", ")}.`} />
          <ul className="w-full min-w-0 divide-y divide-border/60">
            {segments.map((row) => <li key={row.key} className="flex min-h-10 items-center gap-2 py-2 text-sm leading-5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-foreground">{row.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">{whole(row.value)}</span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{share(row.value, total)}</span>
            </li>)}
          </ul>
        </div>
      </>
      : <p className="flex flex-1 items-center justify-center py-8 text-center text-sm leading-5 text-muted-foreground">No payments recorded in this period.</p>}
  </Card>;
}
