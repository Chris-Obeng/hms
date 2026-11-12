"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { deltaText } from "@/app/dashboard/reports/_components/bi/bi-format";

/** Icon-chip tint variants from the design file (accent default; warning/danger for payouts). */
export type PenChipTone = "accent" | "warning" | "danger";

const CHIP_TONES: Record<PenChipTone, string> = {
  accent: "bg-[#0485F714] text-[var(--pen-accent)]",
  warning: "bg-[#F5A5241F] text-[var(--warning)]",
  danger: "bg-[#FF383C14] text-[var(--danger)]",
};

/**
 * KPI card in two sizes from the design: a desktop card (label + tinted icon
 * chip, value, optional extra row such as a sparkline, then hint or delta) and
 * the mobile carousel card (label chip, value, delta — no sparkline).
 */
export function PenKpi({ label, value, icon: Icon, chipTone = "accent", hint, delta, unit, children, className, mobile = false }: {
  label: string;
  value: string;
  icon: LucideIcon;
  chipTone?: PenChipTone;
  /** Secondary line under the value (e.g. the range or a payment count). */
  hint?: string;
  /** Change against the prior period; renders instead of a plain hint when present. */
  delta?: number | null;
  unit?: "%" | "pts";
  /** Extra content between the value and the hint/delta line (e.g. sparkline). */
  children?: ReactNode;
  /** Extra classes for the grid item (e.g. a mobile full-width span). */
  className?: string;
  mobile?: boolean;
}) {
  const change = delta === undefined ? null : deltaText(delta, unit);
  return <div className={cn(
    "flex shrink-0 snap-start flex-col bg-card shadow-[0_2px_4px_rgb(0_0_0/0.04)]",
    mobile ? "w-40 gap-[5px] rounded-2xl p-3" : "min-w-0 flex-1 gap-2 rounded-3xl p-4",
    className,
  )}>
    <div className="flex w-full items-center justify-between gap-2">
      <span className={cn("text-muted-foreground", mobile ? "text-[11px]" : "text-[13px]")}>{label}</span>
      <span className={cn(
        "flex items-center justify-center",
        mobile ? "size-5 rounded-md" : "size-[26px] rounded-lg",
        CHIP_TONES[chipTone],
      )}>
        <Icon size={mobile ? 12 : 15} aria-hidden="true" />
      </span>
    </div>
    <span className={cn("font-semibold tracking-[-0.3px] text-foreground tabular-nums", mobile ? "text-[17px] tracking-[-0.2px]" : "text-2xl")}>{value}</span>
    {!mobile && children}
    {change && <span className={cn("font-medium tabular-nums", mobile ? "text-[10px]" : "text-xs",
      change.direction === "up" ? "text-[var(--success)]" : change.direction === "down" ? "text-[var(--danger)]" : "text-muted-foreground")}>
      {change.text}
    </span>}
    {!change && hint && <span className={cn("text-muted-foreground", mobile ? "text-[10px]" : "text-xs")}>{hint}</span>}
  </div>;
}

export function KpiSkeleton({ mobile = false }: { mobile?: boolean }) {
  return <div className={cn("flex flex-col gap-2 bg-card p-4 shadow-[0_2px_4px_rgb(0_0_0/0.04)]",
    mobile ? "h-[104px] w-40 shrink-0 snap-start rounded-2xl" : "h-[128px] flex-1 rounded-3xl")} aria-hidden="true">
    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
    <div className="h-7 w-32 animate-pulse rounded bg-muted" />
    <div className="mt-auto h-3 w-20 animate-pulse rounded bg-muted" />
  </div>;
}
