"use client";

import { Info } from "lucide-react";
import { OccupancyDonut } from "./occupancy-donut";

interface OccupancyCardProps {
  occupancyPercent: number;
  availableUnits: number;
  bookedUnits: number;
  outOfService: number;
  blockedDates: number;
  totalRooms: number;
}

export function OccupancyCard({
  occupancyPercent,
  availableUnits,
  bookedUnits,
  outOfService,
  blockedDates,
  totalRooms,
}: OccupancyCardProps) {
  return (
    <div className="relative space-y-4 rounded-2xl border border-border/50 bg-card p-5 shadow-xs">
      {/* Top info icon */}
      <button
        type="button"
        title="Room-night occupancy for selected date. Same-day departures are excluded; arrivals and stayovers are included."
        aria-label="About night occupancy"
        className="absolute right-4 top-4 cursor-pointer text-muted-foreground/50 transition-colors hover:text-foreground"
      >
        <Info className="size-4" />
      </button>

      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
        Tonight · {totalRooms} {totalRooms === 1 ? "room" : "rooms"}
      </p>

      {/* Donut ring */}
      <OccupancyDonut percent={occupancyPercent} />

      {/* Breakdown */}
      <div className="space-y-2.5 border-t border-border/40 pt-3 text-sm">
        <Row count={Math.max(0, availableUnits)} label="Available tonight" dot="bg-emerald-500" info="Units free for the selected night after departures" />
        <Row count={Math.max(0, bookedUnits)} label="Booked tonight" dot="bg-primary" />
        <Row count={Math.max(0, outOfService)} label="Out of service" dot="bg-amber-500" />
        <Row count={Math.max(0, blockedDates)} label="Blocked dates" dot="bg-slate-400" />
      </div>
    </div>
  );
}

function Row({
  count,
  label,
  dot,
  info,
}: {
  count: number;
  label: string;
  dot: string;
  info?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className={label === "Available tonight" ? "font-medium text-foreground" : "text-muted-foreground"}>
          {label}
        </span>
        {info && (
          <button
            type="button"
            title={info}
            aria-label={info}
            className="shrink-0 cursor-pointer text-muted-foreground/40 transition-colors hover:text-foreground"
          >
            <Info className="size-3.5" />
          </button>
        )}
      </div>
      <span className="w-8 text-right font-bold tabular-nums text-foreground">
        {count}
      </span>
    </div>
  );
}
