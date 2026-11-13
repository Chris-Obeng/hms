"use client";

export interface RingSegment {
  /** Stable key (also the SVG key). */
  key: string;
  amount: number;
  color: string;
}

/**
 * The pen design-file composition ring: a track circle with one arc per
 * segment drawn clockwise from the top, value + label centred. Arcs are exact
 * and unanimated — a ring that animates from zero briefly states a number
 * that is not true. Leave `value` and `label` out for an empty centre when the
 * figure is already stated beside the ring.
 */
export function DonutRing({ segments, total, value, label, size = 160, valueSize = 17, labelSize = 11, ariaLabel }: {
  segments: RingSegment[];
  total: number;
  value?: string;
  label?: string;
  size?: number;
  valueSize?: number;
  labelSize?: number;
  ariaLabel?: string;
}) {
  const stroke = Math.round(size * 0.15);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const { arcs } = segments
    .filter((segment) => segment.amount > 0 && total > 0)
    .reduce<{
      start: number;
      arcs: Array<RingSegment & { dash: number; offset: number }>;
    }>(
      (acc, segment) => {
        const fraction = segment.amount / total;
        return {
          start: acc.start + fraction,
          arcs: [
            ...acc.arcs,
            {
              ...segment,
              dash: fraction * circumference,
              offset: acc.start * circumference,
            },
          ],
        };
      },
      { start: 0, arcs: [] }
    );
  return <div role="img" aria-label={ariaLabel ?? `${value ?? ""} ${label ?? ""}.`} className="relative shrink-0" style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      {arcs.map((arc) => <circle key={arc.key} cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={arc.color} strokeWidth={stroke} strokeDasharray={`${arc.dash} ${circumference}`} strokeDashoffset={-arc.offset} />)}
    </svg>
    {(value || label) && <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
      {value && <span className="font-semibold tracking-[-0.3px] text-foreground tabular-nums" style={{ fontSize: valueSize }}>{value}</span>}
      {label && <span className="text-muted-foreground" style={{ fontSize: labelSize }}>{label}</span>}
    </div>}
  </div>;
}
