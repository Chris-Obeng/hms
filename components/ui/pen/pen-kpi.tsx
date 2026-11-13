"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@heroui/react";
import { cn } from "@/lib/utils";
import { deltaText } from "@/app/dashboard/reports/_components/bi/bi-format";

/** Kept for callers that still pass a tone; the quieter card no longer tints by tone. */
export type PenChipTone = "accent" | "warning" | "danger";

/**
 * KPI card: label, one large figure, then a hint or delta. `icon` and
 * `chipTone` are accepted for compatibility but not drawn, so a row of
 * figures reads as numbers rather than a row of badges.
 */
export function PenKpi({ label, value, hint, delta, unit, children, className, mobile = false }: {
  label: string;
  value: string;
  icon?: LucideIcon;
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
  return (
    <Card
      className={cn(
        "min-w-0 gap-1 rounded-2xl border border-border/60 shadow-[0_1px_2px_rgb(15_23_42/0.04)]",
        mobile ? "p-4" : "p-4 sm:p-6",
        className
      )}
    >
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "truncate font-semibold tracking-[-0.02em] tabular-nums text-foreground",
          mobile ? "text-lg" : "text-lg sm:text-xl lg:text-2xl"
        )}
      >
        {value}
      </span>
      {!mobile && children}
      {change && (
        <span
          className={cn(
            "text-xs font-medium tabular-nums",
            change.direction === "up"
              ? "text-[var(--success)]"
              : change.direction === "down"
                ? "text-[var(--danger)]"
                : "text-muted-foreground"
          )}
        >
          {change.text}
        </span>
      )}
      {!change && hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </Card>
  );
}

export function KpiSkeleton({ mobile = false }: { mobile?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-4",
        mobile ? "h-24 w-40 shrink-0 snap-start" : "h-28 flex-1"
      )}
      aria-hidden="true"
    >
      <div className="h-3 w-20 animate-pulse rounded bg-muted" />
      <div className="h-8 w-28 animate-pulse rounded bg-muted" />
      <div className="mt-auto h-3 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}
