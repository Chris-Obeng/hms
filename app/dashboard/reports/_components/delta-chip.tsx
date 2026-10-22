import { cn } from "@/lib/utils";

/** Keep relative percentage changes distinct from absolute percentage-point changes. */
export function DeltaChip({ value, unit = "percent", className }: {
  value: number | null;
  unit?: "percent" | "points";
  className?: string;
}) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("reports-delta", className)}>Prior comparison unavailable</span>;
  return <span className={cn("reports-delta", className)}>
    {value > 0 ? "+" : ""}{value.toLocaleString("en", { maximumFractionDigits: 1 })}{unit === "points" ? " percentage points" : "%"} vs prior period
  </span>;
}
