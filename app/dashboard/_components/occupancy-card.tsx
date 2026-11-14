"use client";

import { useId } from "react";
import { Button, Popover } from "@heroui/react";
import { Info } from "lucide-react";
import { formatSoldPercent, type RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";
import { cn } from "@/lib/utils";
import { OccupancyDonut } from "./occupancy-donut";

/**
 * Occupancy for the selected night: the ring, then the room counts behind it.
 * No visible title or date; the ring says "Occupancy" and the page's date
 * control says which night. Screen readers get both in the heading.
 *
 * Layout follows the space it gets:
 * - phones: ring left, list right
 * - tablets: ring left, counts as a row of columns
 * - from 1280 px (side column): ring centred above the list
 */
export function OccupancyCard({
  metric,
  isDateSwitching = false,
}: {
  metric: RoomsSoldMetric;
  isDateSwitching?: boolean;
}) {
  const titleId = useId();
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${metric.date}T00:00:00Z`));

  const isReady = metric.state === "ready";
  const isDeficit = metric.availableRooms !== null && metric.availableRooms < 0;
  // A past night with no room records (before the property's first record,
  // or history not set up): say why once, quietly.
  const isUnrecorded = metric.basis === "historical-unavailable";
  const isPast = metric.basis === "historical" || isUnrecorded;

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={isDateSwitching}
      className="relative rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(20_20_19/0.04)] sm:p-6"
    >
      <h2 id={titleId} className="sr-only">
        Occupancy, <time dateTime={metric.date}>{dateLabel}</time>
      </h2>
      {isDateSwitching && (
        <span role="status" className="sr-only">
          Loading selected date…
        </span>
      )}

      <AboutOccupancy past={isPast} className="absolute right-2 top-2 sm:right-4 sm:top-4" />

      {isUnrecorded && (
        <p role="note" className="pr-10 text-sm leading-relaxed text-muted-foreground">
          {metric.issues[0] ?? "No room inventory is recorded for this night."}
        </p>
      )}

      {!isUnrecorded && metric.issues.length > 0 && (
        <div
          role={metric.state === "inconsistent" ? "alert" : "note"}
          className={cn(
            "mb-4 space-y-1 rounded-2xl px-4 py-3 pr-10 text-xs leading-relaxed",
            metric.state === "inconsistent"
              ? "bg-amber-500/[0.08] text-foreground"
              : "bg-secondary/70 text-muted-foreground"
          )}
        >
          {metric.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}

      {!isUnrecorded && (
        <div
          className={cn(
            "flex gap-6",
            isReady ? "items-center xl:flex-col xl:items-stretch" : "flex-col gap-4"
          )}
        >
          <OccupancyDonut
            metric={metric}
            dateLabel={dateLabel}
            className={isReady ? "w-28 xl:mx-auto xl:mt-2 xl:w-44" : "w-full pr-10"}
          />

          {metric.totalRooms !== null && (
            <div className="min-w-0 flex-1">
              {metric.state === "inconsistent" &&
                metric.sellableRooms !== null &&
                metric.soldRooms !== null && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">
                      {metric.soldRooms} booked
                    </span>{" "}
                    of <span className="tabular-nums">{metric.sellableRooms}</span> sellable rooms
                    {metric.soldPercent !== null && ` (${formatSoldPercent(metric.soldPercent)}%)`}
                  </p>
                )}

              <dl
                className={cn(
                  "grid gap-2 text-sm",
                  isReady &&
                    "md:auto-cols-max md:grid-flow-col md:justify-between md:gap-4 md:pr-10 xl:grid-flow-row xl:justify-stretch xl:gap-3 xl:border-t xl:border-border xl:pr-0 xl:pt-6"
                )}
              >
                <Stat
                  label={isDeficit ? "Oversold" : "Available"}
                  value={metric.availableRooms}
                  dot={isDeficit ? "bg-destructive" : "bg-secondary ring-1 ring-inset ring-border"}
                  tone={isDeficit ? "text-destructive" : undefined}
                />
                <Stat label="Booked" value={metric.soldRooms} dot="bg-primary" />
                {(metric.heldRooms ?? 0) > 0 && (
                  <Stat label="On hold" value={metric.heldRooms} dot="bg-[var(--sun)]" />
                )}
                <Stat label="Out of service" value={metric.outOfService} />
                <Stat label="Blocked" value={metric.blocked} />
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Number first, then the label (as in the Cloudbeds card). The dot ties a row
 * to its part of the ring; rows the ring leaves out keep an empty slot so the
 * numbers stay in one column. DOM order stays label, then value.
 */
function Stat({
  label,
  value,
  dot,
  tone,
}: {
  label: string;
  value: number | null;
  dot?: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 md:grid md:grid-cols-[auto_minmax(0,1fr)] md:gap-x-2 md:gap-y-1 xl:flex xl:gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "order-1 size-2 shrink-0 rounded-full md:col-start-1 md:row-start-2",
          dot ?? "invisible"
        )}
      />
      <dt className="order-3 min-w-0 truncate text-muted-foreground md:col-start-2 md:row-start-2">
        {label}
      </dt>
      <dd
        className={cn(
          "order-2 min-w-6 shrink-0 font-semibold tabular-nums text-foreground md:col-span-2 md:row-start-1 md:text-xl md:leading-tight xl:text-sm",
          tone
        )}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

/** What the percentage means, on demand instead of as standing text. */
function AboutOccupancy({ past, className }: { past: boolean; className?: string }) {
  return (
    <Popover>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="About occupancy"
        className={cn(
          "size-8 min-w-8 rounded-full text-muted-foreground before:absolute before:-inset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
          className
        )}
      >
        <Info className="size-4" />
      </Button>
      <Popover.Content placement="bottom end" className="max-w-64 rounded-2xl">
        <Popover.Dialog aria-label="About occupancy" className="p-4 text-sm leading-relaxed text-muted-foreground outline-none">
          {past
            ? "Rooms checked in that night as a share of the rooms you could sell, as they stood at the end of the day. Out-of-service and blocked rooms are left out."
            : "Booked rooms as a share of the rooms you can sell that night. Out-of-service and blocked rooms are left out."}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
