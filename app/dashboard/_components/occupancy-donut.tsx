"use client";

import { useId } from "react";
import { formatSoldPercent, type RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";

/** Static arcs use the exact same fraction as the center; no padded angles,
 * rounded caps or animation that temporarily misrepresents a room count.
 * Static rendering also fully respects reduced-motion preferences.
 */
export function OccupancyDonut({ metric, dateLabel }: { metric: RoomsSoldMetric; dateLabel: string }) {
  const patternId = useId().replace(/:/g, "");
  if (metric.state !== "ready" || metric.sellableRooms === null || metric.soldPercent === null || metric.heldRooms === null) {
    return (
      <div className="rounded-xl bg-muted/50 px-4 py-7 text-center">
        <p className="text-lg font-semibold text-foreground">
          {metric.state === "inconsistent" ? "Check inventory" : "Unavailable"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {metric.state === "empty" ? "No sellable rooms for this night" : "A reliable percentage cannot be shown"}
        </p>
      </div>
    );
  }
  const sold = metric.soldPercent;
  const held = metric.heldRooms / metric.sellableRooms * 100;
  const display = formatSoldPercent(sold);
  return (
    <div
      role="img"
      aria-label={`Rooms sold for ${dateLabel}: ${metric.soldRooms} of ${metric.sellableRooms} sellable rooms, ${display} percent. ${metric.heldRooms} pending holds and ${metric.availableRooms} available to sell. Out-of-service and blocked rooms are excluded.`}
      className="relative mx-auto aspect-square w-full max-w-[208px]"
    >
      <svg viewBox="0 0 200 200" className="size-full" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="var(--muted-foreground)" />
            <path d="M 0 0 V 5" stroke="var(--card)" strokeWidth="2" />
          </pattern>
        </defs>
        <g transform="rotate(-90 100 100)" fill="none" strokeWidth="18">
          <circle cx="100" cy="100" r="82" stroke="var(--border)" />
          {sold > 0 && (
            <circle cx="100" cy="100" r="82" pathLength="100" stroke="var(--primary)" strokeDasharray={`${sold} ${100 - sold}`} />
          )}
          {held > 0 && (
            <circle cx="100" cy="100" r="82" pathLength="100" stroke={`url(#${patternId})`} strokeDasharray={`${held} ${100 - held}`} strokeDashoffset={-sold} />
          )}
        </g>
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="text-[2.5rem] font-semibold leading-none tracking-tight tabular-nums text-foreground">{display}%</span>
        <span className="mt-2 text-sm text-muted-foreground">rooms sold</span>
      </div>
    </div>
  );
}
