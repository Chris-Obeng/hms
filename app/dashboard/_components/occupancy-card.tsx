"use client";

import * as React from "react";
import { Info } from "lucide-react";

interface OccupancyCardProps {
  occupancyPercent: number;
  availableUnits: number;
  bookedUnits: number;
  outOfService: number;
  blockedDates: number;
  totalRooms: number;
}

function OccupancyDonut({ percent }: { percent: number }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const filledLength = (percent / 100) * circumference;
  const emptyLength = circumference - filledLength;

  const [animatedOffset, setAnimatedOffset] = React.useState(circumference);
  React.useEffect(() => {
    const timer = setTimeout(() => setAnimatedOffset(emptyLength), 100);
    return () => clearTimeout(timer);
  }, [percent, emptyLength]);

  const displayPercent = percent % 1 === 0 ? String(percent) : percent.toFixed(1);

  return (
    <div className="relative flex items-center justify-center py-2">
      <svg
        width="160"
        height="160"
        viewBox="0 0 130 130"
        className="-rotate-90 transform"
        role="img"
        aria-label={`Night occupancy ${displayPercent} percent`}
      >
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/25"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${emptyLength}`}
          strokeDashoffset={animatedOffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-kpi-hero tabular-nums text-foreground">{displayPercent}%</span>
        <span className="mt-0.5 text-xs font-semibold text-muted-foreground">
          Night occupancy
        </span>
      </div>
    </div>
  );
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
        <Row count={availableUnits} label="Available tonight" dot="bg-emerald-500" info="Units free for the selected night after departures" />
        <Row count={bookedUnits} label="Booked tonight" dot="bg-primary" />
        <Row count={outOfService} label="Out of service" dot="bg-amber-500" />
        <Row count={blockedDates} label="Blocked dates" dot="bg-slate-400" />
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
