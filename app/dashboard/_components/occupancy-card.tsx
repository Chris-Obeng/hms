"use client";

import { useId } from "react";
import { formatSoldPercent, type RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";
import { cn } from "@/lib/utils";
import { OccupancyDonut } from "./occupancy-donut";

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

  const isDeficit = metric.availableRooms !== null && metric.availableRooms < 0;
  const hasExcluded =
    (metric.outOfService !== null && metric.outOfService > 0) ||
    (metric.blocked !== null && metric.blocked > 0);

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={isDateSwitching}
      className="flex h-full flex-col justify-between gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-[0_1px_3px_rgb(0_0_0/0.04)]"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-md font-semibold leading-snug text-foreground"
          >
            Rooms sold
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <time dateTime={metric.date}>{dateLabel}</time> · night
          </p>
        </div>

        {isDateSwitching ? (
          <span
            role="status"
            className="shrink-0 rounded-lg bg-muted px-3 py-1 text-2xs font-medium text-muted-foreground"
          >
            Loading selected date…
          </span>
        ) : (
          metric.sellableRooms !== null &&
          metric.soldRooms !== null && (
            <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted-foreground">
              {metric.soldRooms}/{metric.sellableRooms}
            </span>
          )
        )}
      </header>

      {metric.issues.length > 0 && (
        <div
          role={metric.state === "inconsistent" ? "alert" : "note"}
          className={cn(
            "space-y-2 rounded-2xl border px-4 py-3 text-xs leading-relaxed",
            metric.state === "inconsistent"
              ? "border-amber-500/30 bg-amber-500/[0.07] text-foreground"
              : "border-border/60 bg-muted/35 text-muted-foreground"
          )}
        >
          {metric.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}

      {/* Responsive body: side-by-side on phones/tablets, stacked on desktop rail */}
      <div
        className={cn(
          "flex flex-col gap-4",
          metric.state === "ready" &&
            "min-[380px]:flex-row min-[380px]:items-center min-[380px]:gap-6 lg:flex-col lg:items-stretch lg:gap-4"
        )}
      >
        <OccupancyDonut
          metric={metric}
          dateLabel={dateLabel}
          className={metric.state !== "ready" ? "w-full" : undefined}
        />

        {metric.totalRooms !== null && (
          <div className="min-w-0 flex-1 space-y-3">
            {metric.sellableRooms !== null && metric.soldRooms !== null && (
              <p className="text-xs text-muted-foreground lg:text-center">
                <span className="font-semibold tabular-nums text-foreground">
                  {metric.soldRooms} sold
                </span>{" "}
                of <span className="tabular-nums">{metric.sellableRooms}</span> sellable rooms
                {metric.state === "inconsistent" &&
                  metric.soldPercent !== null &&
                  ` (${formatSoldPercent(metric.soldPercent)}%)`}
              </p>
            )}

            <dl className="space-y-3 text-sm">
              <Row count={metric.soldRooms} label="Sold" marker="bg-primary" />
              <Row
                count={metric.heldRooms}
                label="Pending holds"
                marker="border-[1.5px] border-dashed border-amber-600 bg-amber-500/15"
              />
              <Row
                count={metric.availableRooms}
                label={isDeficit ? "Availability deficit" : "Available to sell"}
                marker={
                  isDeficit
                    ? "bg-destructive"
                    : "border-[1.5px] border-muted-foreground/60 bg-card"
                }
                valueTone={isDeficit ? "text-destructive" : undefined}
              />
            </dl>
          </div>
        )}
      </div>

      {metric.totalRooms !== null && (
        <div className="border-t border-border/50 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold tabular-nums text-foreground">
                {metric.sellableRooms ?? 0}
              </span>{" "}
              sellable of{" "}
              <span className="font-medium tabular-nums text-foreground">
                {metric.totalRooms}
              </span>{" "}
              active
            </span>
            {hasExcluded && (
              <span className="tabular-nums text-2xs text-muted-foreground">
                {[
                  metric.outOfService ? `${metric.outOfService} out of service` : null,
                  metric.blocked ? `${metric.blocked} blocked` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Row({
  count,
  label,
  marker,
  valueTone,
}: {
  count: number | null;
  label: string;
  marker?: string;
  valueTone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex min-w-0 items-center gap-3 text-muted-foreground">
        {marker && (
          <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-full", marker)} />
        )}
        {label}
      </dt>
      <dd
        className={cn(
          "shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground",
          valueTone
        )}
      >
        {count ?? "—"}
      </dd>
    </div>
  );
}
