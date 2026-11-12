import * as React from "react";

import { cn } from "@/lib/utils";

// Compact label + value stat used in the guest lifetime-value card and the
// booking balance card. `strong` emphasises the value; `className` overrides
// its colour (e.g. emerald for paid, destructive for amounts due).

export function MiniStat({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-[13px] tabular-nums",
          strong ? "font-semibold text-foreground" : "font-medium",
          className ?? "text-foreground/80"
        )}
      >
        {value}
      </p>
    </div>
  );
}
