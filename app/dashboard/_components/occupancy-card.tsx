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

  const formattedPercent = (Math.round(percent * 100) / 100).toFixed(2);

  return (
    <div className="relative flex items-center justify-center py-2">
      <svg
        width="160"
        height="160"
        viewBox="0 0 130 130"
        className="transform -rotate-90"
        role="img"
        aria-label={`Room-night occupancy: ${formattedPercent}%`}
      >
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/15"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-emerald-500 transition-all duration-1000 ease-out"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${emptyLength}`}
          strokeDashoffset={animatedOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold text-foreground tracking-tight font-mono">
          {formattedPercent}%
        </span>
        <span className="text-xs font-semibold text-muted-foreground mt-0.5">
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
}: OccupancyCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-xs relative space-y-4">
      {/* Top info icon */}
      <button
        type="button"
        title="Room-night occupancy for selected date. Same-day departures are excluded; arrivals and stayovers are included."
        className="absolute top-4 right-4 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
      >
        <Info className="size-4" />
      </button>

      {/* Donut ring */}
      <OccupancyDonut percent={occupancyPercent} />

      {/* List breakdown matching Cloudbeds */}
      <div className="space-y-2.5 pt-2 border-t border-border/30">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="font-bold text-foreground w-8 text-right font-mono">
              {availableUnits}
            </span>
            <span className="font-medium text-foreground">Available tonight</span>
          </div>
          <button type="button" title="Units available for selected night after departures" className="text-muted-foreground/50 hover:text-foreground transition-colors">
            <Info className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="font-bold text-foreground w-8 text-right font-mono">
              {bookedUnits}
            </span>
            <span className="text-muted-foreground">Booked tonight</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="font-bold text-foreground w-8 text-right font-mono">
              {outOfService}
            </span>
            <span className="text-muted-foreground">Out of service</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="font-bold text-foreground w-8 text-right font-mono">
              {blockedDates}
            </span>
            <span className="text-muted-foreground">Blocked dates</span>
          </div>
        </div>
      </div>
    </div>
  );
}
