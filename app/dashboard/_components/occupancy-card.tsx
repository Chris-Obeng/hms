"use client";

import { useId } from "react";
import { Card } from "@heroui/react";
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
  const excluded = [
    metric.outOfService ? `${metric.outOfService} out of service` : null,
    metric.blocked ? `${metric.blocked} blocked` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      aria-busy={isDateSwitching}
      className="gap-4 rounded-3xl border border-border/60 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-6"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-foreground">
            Rooms sold
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <time dateTime={metric.date}>{dateLabel}</time>
          </p>
        </div>
        {isDateSwitching && (
          <span
            role="status"
            className="shrink-0 rounded-full bg-secondary px-2 py-1 text-2xs font-medium text-muted-foreground"
          >
            Loading selected date…
          </span>
        )}
      </header>

      {metric.issues.length > 0 && (
        <div
          role={metric.state === "inconsistent" ? "alert" : "note"}
          className={cn(
            "space-y-1 rounded-2xl px-4 py-3 text-xs leading-relaxed",
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

      <div
        className={cn(
          "flex gap-4",
          metric.state === "ready" ? "items-center sm:gap-6 xl:gap-4" : "flex-col"
        )}
      >
        <OccupancyDonut
          metric={metric}
          dateLabel={dateLabel}
          className={metric.state !== "ready" ? "w-full" : undefined}
        />

        {metric.totalRooms !== null && (
          <div className="min-w-0 flex-1 space-y-3">
            {metric.state === "inconsistent" &&
              metric.sellableRooms !== null &&
              metric.soldRooms !== null && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold tabular-nums text-foreground">
                    {metric.soldRooms} sold
                  </span>{" "}
                  of <span className="tabular-nums">{metric.sellableRooms}</span> sellable rooms
                  {metric.soldPercent !== null && ` (${formatSoldPercent(metric.soldPercent)}%)`}
                </p>
              )}

            <dl className="space-y-2 text-sm">
              <Row count={metric.soldRooms} label="Sold" marker="bg-primary" />
              <Row
                count={metric.heldRooms}
                label="Pending holds"
                marker="border-[1.5px] border-dashed border-amber-600 bg-amber-500/15"
              />
              <Row
                count={metric.availableRooms}
                label={isDeficit ? "Availability deficit" : "Available to sell"}
                marker={isDeficit ? "bg-destructive" : "bg-secondary ring-1 ring-inset ring-border"}
                valueTone={isDeficit ? "text-destructive" : undefined}
              />
            </dl>
          </div>
        )}
      </div>

      {metric.totalRooms !== null && (
        <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <p>
            <span className="font-medium tabular-nums text-foreground">
              {metric.sellableRooms ?? 0}
            </span>{" "}
            of <span className="tabular-nums">{metric.totalRooms}</span> rooms sellable
          </p>
          {excluded && <p className="tabular-nums">{excluded}</p>}
        </footer>
      )}
    </Card>
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
      <dt className="flex min-w-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
        {marker && (
          <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-full", marker)} />
        )}
        {label}
      </dt>
      <dd className={cn("shrink-0 font-semibold tabular-nums text-foreground", valueTone)}>
        {count ?? "—"}
      </dd>
    </div>
  );
}
