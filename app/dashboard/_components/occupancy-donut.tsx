"use client";

import { useId } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { formatSoldPercent, type RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";
import { cn } from "@/lib/utils";

/**
 * Occupancy ring. Arcs use exactly the fraction printed in the centre: no
 * padded angles, rounded caps or mount animation that would briefly show a
 * wrong room count. Static, so it also respects reduced motion.
 *
 * Booked is ink, holds are hatched marigold, the track is what is still free.
 * Size comes from `className` (the card makes it 112 px, 176 px from xl).
 */
export function OccupancyDonut({
  metric,
  dateLabel,
  className,
}: {
  metric: RoomsSoldMetric;
  dateLabel: string;
  className?: string;
}) {
  const patternId = useId().replace(/:/g, "");

  if (
    metric.state !== "ready" ||
    metric.sellableRooms === null ||
    metric.soldPercent === null ||
    metric.heldRooms === null
  ) {
    const isError = metric.state === "inconsistent";
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl px-4 py-3",
          isError ? "bg-amber-500/[0.08]" : "bg-secondary/70",
          className
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-xl",
            isError ? "bg-amber-500/15 text-amber-700" : "bg-card text-muted-foreground"
          )}
        >
          {isError ? <AlertTriangle className="size-4" /> : <Ban className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {isError ? "Check inventory" : "Unavailable"}
          </p>
          <p className="text-xs text-muted-foreground">
            {metric.state === "empty"
              ? "No sellable rooms for this night"
              : "A reliable percentage cannot be shown"}
          </p>
        </div>
      </div>
    );
  }

  const sold = metric.soldPercent;
  const held = (metric.heldRooms / metric.sellableRooms) * 100;
  const display = formatSoldPercent(sold);

  return (
    <div
      role="img"
      aria-label={`Occupancy for ${dateLabel}: ${metric.soldRooms} of ${metric.sellableRooms} sellable rooms booked, ${display} percent. ${metric.heldRooms} on hold, ${metric.availableRooms} available. Out-of-service and blocked rooms are left out.`}
      className={cn("relative aspect-square shrink-0", className)}
    >
      <svg viewBox="0 0 200 200" className="size-full" aria-hidden="true" focusable="false">
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="var(--sun)" />
            <path d="M 0 0 V 6" stroke="var(--card)" strokeWidth="2.2" />
          </pattern>
        </defs>
        <g transform="rotate(-90 100 100)" fill="none" strokeWidth="16">
          <circle cx="100" cy="100" r="90" stroke="var(--secondary)" />
          {sold > 0 && (
            <circle
              cx="100"
              cy="100"
              r="90"
              pathLength="100"
              stroke="var(--primary)"
              strokeDasharray={`${sold} ${100 - sold}`}
            />
          )}
          {held > 0 && (
            <circle
              cx="100"
              cy="100"
              r="90"
              pathLength="100"
              stroke={`url(#${patternId})`}
              strokeDasharray={`${held} ${100 - held}`}
              strokeDashoffset={-sold}
            />
          )}
        </g>
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
      >
        <span className="text-xl font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground xl:text-[32px]">
          {display}%
        </span>
        <span className="mt-1 text-2xs font-medium text-muted-foreground xl:mt-2 xl:text-xs">
          Occupancy
        </span>
      </span>
    </div>
  );
}
