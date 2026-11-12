"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** CSS colour. Use the chart tokens so the ring follows the theme. */
  color: string;
}

const SIZE = 200;
const RADIUS = 78;
const STROKE = 24;
/** Angular gap between segments, in percent of the ring. Small enough to stay quiet at 2 segments. */
const GAP = 1.6;

/**
 * Whole-number shares that always add up to 100 (largest remainder).
 *
 * Rounding each share on its own shows three "33%" slices summing to 99, which
 * contradicts the total in the middle of the ring. The largest fractional parts
 * take the leftover points, so the legend is internally consistent.
 */
function wholeShares(values: number[], total: number): number[] {
  const exact = values.map((value) => (value / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let leftover = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const shares = [...floors];
  for (const { index } of order) {
    if (leftover <= 0) break;
    shares[index] += 1;
    leftover -= 1;
  }
  return shares;
}

/** Black dashes centred on each segment boundary, punching the card colour through the ring. */
function boundaries(known: DonutSegment[], total: number): string {
  let start = 0;
  return known.slice(0, -1).map((segment) => {
    start += (segment.value / total) * 100;
    return `${Math.max(0, start - GAP / 2)} ${GAP}`;
  }).join(", ");
}

/**
 * Composition ring: up to 4 segments separated by hairline gaps, with the total (or a chosen figure)
 * in the centre. Arcs are exact — no spring, no entry tween — because a ring that animates from
 * zero briefly states a number that is not true. Gaps are painted with the card colour rather
 * than by shortening the arc, so every segment keeps its true proportion.
 */
export function SegmentedDonut({ label, value, delta, segments, heading, className }: {
  label: string;
  value: string;
  delta?: ReactNode;
  segments: DonutSegment[];
  /** Optional visible title above the value inside the ring; defaults to nothing. */
  heading?: string;
  className?: string;
}) {
  const maskId = useId().replace(/:/g, "");
  const known = segments.filter((segment) => segment.value > 0);
  const total = known.reduce((sum, segment) => sum + segment.value, 0);
  const shares = total > 0 ? wholeShares(known.map((segment) => segment.value), total) : [];
  // A share below one percent reads "<1", never "0", so a real slice is not shown as absent.
  const share = (index: number) => shares[index] === 0 && known[index].value > 0 ? "<1" : String(shares[index]);
  const summary = total > 0
    ? known.map((segment, index) => `${segment.label} ${share(index)} percent`).join(", ")
    : "No data";
  // Offsets are derived, never accumulated: each arc starts where the shares before it end.
  const starts = known.map((_, index) => known.slice(0, index).reduce((sum, item) => sum + (item.value / total) * 100, 0));

  return <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:gap-6", className)}>
    <div role="img" aria-label={`${label}: ${value}. ${summary}.`}
      className="relative aspect-square w-full max-w-[184px] shrink-0 sm:max-w-[168px]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" aria-hidden="true" focusable="false">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#fff" strokeWidth={STROKE} pathLength={100} />
            {known.length > 1 && <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#000" strokeWidth={STROKE + 2}
              pathLength={100} strokeDasharray={boundaries(known, total)} />}
          </mask>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border)" strokeOpacity={0.55} strokeWidth={STROKE} />
        {total > 0 && <g mask={`url(#${maskId})`}>
          {known.map((segment, index) => {
            const share = (segment.value / total) * 100;
            return <circle key={segment.key} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={segment.color}
              strokeWidth={STROKE} pathLength={100} strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-starts[index]} />;
          })}
        </g>}
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
        {heading && <span className="text-label leading-snug text-muted-foreground">{heading}</span>}
        <span className={cn("tabular-nums font-semibold tracking-tight text-foreground", heading ? "mt-1 text-xl" : "text-xl")}>{value}</span>
        {delta && <span className="mt-1 text-caption text-muted-foreground">{delta}</span>}
      </div>
    </div>

    {known.length > 0 && <ul className="w-full min-w-0 space-y-3">
      {known.map((segment, index) => <li key={segment.key} className="flex items-center gap-3 text-[13px]">
        <span className="size-2 shrink-0 rounded-full" style={{ background: segment.color }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{segment.label}</span>
        <span className="shrink-0 text-sm font-medium tabular-nums">{share(index)}%</span>
      </li>)}
    </ul>}
  </div>;
}
