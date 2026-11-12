"use client";

import { useId } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { formatSoldPercent, type RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";
import { cn } from "@/lib/utils";

/**
 * Static arcs use the exact same fraction as the center; no padded angles,
 * rounded caps or mount animation that temporarily misrepresents a room count.
 * Static rendering also fully respects reduced-motion preferences.
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
          "flex flex-col items-center justify-center rounded-2xl border px-4 py-5 text-center",
          isError
            ? "border-amber-500/25 bg-amber-500/[0.06]"
            : "border-border/50 bg-muted/35",
          className
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mb-2 grid size-9 place-items-center rounded-xl",
            isError
              ? "bg-amber-500/15 text-amber-700"
              : "bg-background/80 text-muted-foreground"
          )}
        >
          {isError ? <AlertTriangle className="size-4" /> : <Ban className="size-4" />}
        </span>
        <p className="text-[15px] font-semibold tracking-tight text-foreground">
          {isError ? "Check inventory" : "Unavailable"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {metric.state === "empty"
            ? "No sellable rooms for this night"
            : "A reliable percentage cannot be shown"}
        </p>
      </div>
    );
  }

  const sold = metric.soldPercent;
  const held = (metric.heldRooms / metric.sellableRooms) * 100;
  const display = formatSoldPercent(sold);

  return (
    <div
      role="img"
      aria-label={`Rooms sold for ${dateLabel}: ${metric.soldRooms} of ${metric.sellableRooms} sellable rooms, ${display} percent. ${metric.heldRooms} pending holds and ${metric.availableRooms} available to sell. Out-of-service and blocked rooms are excluded.`}
      className={cn(
        "relative mx-auto aspect-square w-[124px] shrink-0 sm:w-[136px] lg:w-[172px]",
        className
      )}
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
            <rect width="6" height="6" fill="oklch(0.75 0.15 75)" />
            <path d="M 0 0 V 6" stroke="var(--card)" strokeWidth="2.2" />
          </pattern>
        </defs>
        <g transform="rotate(-90 100 100)" fill="none" strokeWidth="18">
          <circle cx="100" cy="100" r="82" stroke="var(--muted)" />
          {sold > 0 && (
            <circle
              cx="100"
              cy="100"
              r="82"
              pathLength="100"
              stroke="var(--primary)"
              strokeDasharray={`${sold} ${100 - sold}`}
            />
          )}
          {held > 0 && (
            <circle
              cx="100"
              cy="100"
              r="82"
              pathLength="100"
              stroke={`url(#${patternId})`}
              strokeDasharray={`${held} ${100 - held}`}
              strokeDashoffset={-sold}
            />
          )}
        </g>
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center"
      >
        <span className="text-[1.625rem] font-semibold leading-none tracking-[-0.025em] tabular-nums text-foreground lg:text-[2.125rem]">
          {display}%
        </span>
        <span className="mt-1 text-[11px] text-muted-foreground lg:mt-1.5 lg:text-xs">
          rooms sold
        </span>
      </div>
    </div>
  );
}
