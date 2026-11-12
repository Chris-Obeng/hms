"use client";

import { formatSoldPercent, type RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";
import { PenCard, PenCardHead } from "@/components/ui/pen/pen-card";

const RING = 132;
const STROKE = 18;

/** Tonight's rooms-sold ring: sold (accent) over pending holds (warning) over available (track). */
export function RoomsSoldCard({ metric, tonight, className }: {
  metric: RoomsSoldMetric;
  /** The business date shown in the caption, property-local. */
  tonight: string;
  className?: string;
}) {
  const ready = metric.state === "ready" && metric.sellableRooms !== null && metric.sellableRooms > 0;
  const sold = metric.soldRooms ?? 0, held = metric.heldRooms ?? 0;
  const caption = `Tonight · ${formatTonight(tonight)}`;

  return <PenCard className={className}>
    <PenCardHead title="Rooms sold" caption={caption} />
    {ready ? <>
      <div className="flex items-center gap-5">
        <RoomsRing sold={sold} held={held} sellable={metric.sellableRooms!} percent={metric.soldPercent} />
        <ul className="min-w-0 flex-1 space-y-3 text-xs">
          <CountRow color="bg-[var(--pen-accent)]" label="Sold" count={sold} />
          <CountRow color="bg-[var(--warning)]" label="Pending holds" count={held} />
          <CountRow color="border-[1.5px] border-[var(--muted-foreground)] bg-card" label="Available to sell" count={metric.availableRooms ?? 0} />
        </ul>
      </div>
      <div className="border-t border-border/50 pt-3">
        <p className="text-[11px] text-muted-foreground">
          {metric.sellableRooms} sellable of {metric.totalRooms} active rooms{metric.outOfService ? ` · ${metric.outOfService} out of service` : ""}{metric.blocked ? ` · ${metric.blocked} blocked` : ""}
        </p>
      </div>
    </> : <p className="py-8 text-center text-[13px] text-muted-foreground">
      {metric.issues[0] ?? "Rooms sold is unavailable right now."}
    </p>}
  </PenCard>;
}

function CountRow({ color, label, count }: { color: string; label: string; count: number }) {
  return <li className="flex items-center gap-2">
    <span className={`size-3 shrink-0 rounded-full ${color}`} aria-hidden="true" />
    <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
    <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">{count.toLocaleString("en")}</span>
  </li>;
}

function RoomsRing({ sold, held, sellable, percent }: { sold: number; held: number; sellable: number; percent: number | null }) {
  const radius = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const soldFraction = sellable > 0 ? sold / sellable : 0;
  const heldFraction = sellable > 0 ? held / sellable : 0;
  return <div role="img" aria-label={`${percent === null ? "—" : `${formatSoldPercent(percent)} percent`} of sellable rooms sold tonight: ${sold} sold, ${held} pending holds, ${sellable - sold - held} available.`}
    className="relative size-[132px] shrink-0">
    <svg viewBox={`0 0 ${RING} ${RING}`} className="-rotate-90" aria-hidden="true">
      <circle cx={RING / 2} cy={RING / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
      <circle cx={RING / 2} cy={RING / 2} r={radius} fill="none" stroke="var(--warning)" strokeWidth={STROKE}
        strokeDasharray={`${heldFraction * circumference} ${circumference}`} strokeDashoffset={-soldFraction * circumference} />
      <circle cx={RING / 2} cy={RING / 2} r={radius} fill="none" stroke="var(--pen-accent)" strokeWidth={STROKE}
        strokeDasharray={`${soldFraction * circumference} ${circumference}`} />
    </svg>
    <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-[22px] font-semibold tracking-[-0.3px] text-foreground tabular-nums">
        {percent === null ? "—" : `${formatSoldPercent(percent)}%`}
      </span>
      <span className="text-[11px] text-muted-foreground">sold</span>
    </div>
  </div>;
}

function formatTonight(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
