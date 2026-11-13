"use client";

import { PAYMENT_METHOD_LABELS } from "@/lib/booking-status";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";
import { compactNumber, share } from "./bi-format";
import { DonutRing } from "@/components/ui/pen/donut-ring";
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

/** Collections ring with a right-hand legend; every slice keeps its exact share. */
export function CollectionsCard({ collected, byMethod, className }: {
  collected: number;
  byMethod: MethodSlice[];
  className?: string;
}) {
  const segments: TenderSlice[] = byMethod.filter((row) => row.amount > 0)
    .map((row) => ({ method: row.method, label: PAYMENT_METHOD_LABELS[row.method] ?? row.method, amount: row.amount, color: TENDER_COLORS[row.method] ?? FALLBACK_COLOR }))
    .sort((a, b) => b.amount - a.amount);
  const total = segments.reduce((sum, row) => sum + row.amount, 0);

  return <PenCard className={className}>
    <PenCardHead title="Collections" caption="By payment method · includes tax and deposits" />
    {total > 0 ? <div className="flex items-center gap-5">
      <DonutRing segments={segments.map(({ method, amount, color }) => ({ key: method, amount, color }))} total={total} value={`GHS ${compactNumber(collected)}`} label="collected" />
      <ul className="min-w-0 flex-1 space-y-[8px]">
        {segments.map((row) => <li key={row.method} className="flex items-center gap-2 text-xs">
          <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-foreground">{row.label}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{share(row.amount, total)}</span>
        </li>)}
      </ul>
    </div> : <p className="py-8 text-center text-[13px] text-muted-foreground">No collections recorded in this period.</p>}
  </PenCard>;
}

