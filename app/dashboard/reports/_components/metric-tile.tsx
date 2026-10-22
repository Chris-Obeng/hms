import type { ReactNode } from "react";
import { DeltaChip } from "./delta-chip";

export function MetricTile({ label, value, definition, delta, deltaUnit, footer }: {
  label: string;
  value: string;
  definition?: string;
  delta?: number | null;
  deltaUnit?: "percent" | "points";
  footer?: ReactNode;
}) {
  return (
    <div className="reports-metric">
      <dt>{label}</dt>
      <dd className={value === "Unavailable" ? "reports-metric-unavailable" : "reports-metric-value"}>{value}</dd>
      {delta !== undefined && <dd><DeltaChip value={delta} unit={deltaUnit} /></dd>}
      {definition && <dd className="reports-metric-definition">{definition}</dd>}
      {footer && <dd className="reports-metric-definition">{footer}</dd>}
    </div>
  );
}
