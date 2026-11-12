import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A row of headline figures separated by hairlines: one surface, no tiles, no icons. */
export function StatStrip({ label, columns = 4, children, className }: {
  label: string;
  columns?: 2 | 3 | 4 | 5;
  children: ReactNode;
  className?: string;
}) {
  const grid = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  }[columns];
  return <div role="group" aria-label={label} className={cn("card-default shadow-none", className)}>
    <dl className={cn("grid divide-y divide-border/60 sm:divide-y-0", grid)}>
      {children}
    </dl>
  </div>;
}

/** One figure in a StatStrip. Label above value; an optional secondary line carries units, basis or trend. */
export function Stat({ label, value, hint, tone = "default" }: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "default" | "unavailable" | "positive" | "negative";
}) {
  return <div className="min-w-0 px-4 py-4 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-border/60">
    <dt className="text-label text-muted-foreground">{label}</dt>
    <dd className={cn("mt-2 break-words text-lg font-semibold leading-tight tracking-tight tabular-nums sm:text-xl",
      tone === "unavailable" && "text-base font-normal text-muted-foreground")}>{value}</dd>
    {hint && <dd className="mt-1 text-caption text-muted-foreground">{hint}</dd>}
  </div>;
}
