"use client";

import { useId } from "react";
import { formatSoldPercent, type RoomsSoldMetric } from "@/lib/metrics/dashboard-occupancy";
import { OccupancyDonut } from "./occupancy-donut";

export function OccupancyCard({ metric, isDateSwitching = false }: { metric: RoomsSoldMetric; isDateSwitching?: boolean }) {
  const titleId = useId();
  const dateLabel = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${metric.date}T00:00:00Z`));
  return (
    <section aria-labelledby={titleId} aria-busy={isDateSwitching} className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
      <header>
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">Rooms sold</h2>
        <p className="mt-1 text-sm text-muted-foreground"><time dateTime={metric.date}>{dateLabel}</time> · night</p>
        {isDateSwitching && <p role="status" className="mt-2 text-sm text-muted-foreground">Loading selected date…</p>}
      </header>

      {/* Donut is a glanceable extra; phones get the figures from the rows below. */}
      <div className="hidden md:block">
        <OccupancyDonut metric={metric} dateLabel={dateLabel} />
      </div>

      {metric.sellableRooms !== null && metric.soldRooms !== null && (
        <p className="text-center text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{metric.soldRooms} sold</span>
          {" ÷ "}<span className="tabular-nums">{metric.sellableRooms}</span> sellable rooms
          {metric.state === "inconsistent" && metric.soldPercent !== null && ` (${formatSoldPercent(metric.soldPercent)}%)`}
        </p>
      )}

      {metric.issues.length > 0 && (
        <div role={metric.state === "inconsistent" ? "alert" : "note"} className="space-y-2 border-l-2 border-border pl-3 text-sm leading-relaxed text-foreground">
          {metric.issues.map((issue) => <p key={issue}>{issue}</p>)}
        </div>
      )}

      {metric.totalRooms !== null && (
        <>
          <dl className="space-y-3 text-sm">
            <Row count={metric.soldRooms} label="Sold" marker="bg-primary" />
            <Row count={metric.heldRooms} label="Pending holds" marker="border-2 border-dashed border-muted-foreground" />
            <Row count={metric.availableRooms} label={metric.availableRooms !== null && metric.availableRooms < 0 ? "Availability deficit" : "Available to sell"} marker="border border-muted-foreground bg-card" />
          </dl>
          <div className="border-t border-border/60 pt-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Excluded from sellable inventory</p>
            <dl className="space-y-2.5 text-sm">
              <Row count={metric.outOfService} label="Out of service" />
              <Row count={metric.blocked} label="Blocked" />
              <Row count={metric.totalRooms} label="Total active rooms" />
            </dl>
          </div>
        </>
      )}

      {metric.basis !== "historical-unavailable" && (
        <div className="border-t border-border/60 pt-3 text-sm leading-relaxed text-muted-foreground">
          <p>{metric.basis === "projection"
            ? "Forward booking snapshot using today's active rooms and service status, plus blocks for this night. Future capacity may change."
            : "Live booking snapshot for this night. This measures rooms sold, not guests currently in house."}</p>
          <details className="mt-1">
            <summary className="min-h-11 cursor-pointer rounded-md py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">How this is calculated</summary>
            <p className="pb-1">Confirmed and checked-in room units count as sold; check-out night is excluded. Pending reservations hold inventory separately, excluding abandoned unpaid direct pay-now holds older than 30 minutes. Sellable rooms exclude maintenance, out-of-service and dated blocks; a room that is both blocked and out of service is excluded only once.</p>
          </details>
        </div>
      )}
    </section>
  );
}

function Row({ count, label, marker }: { count: number | null; label: string; marker?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
        {marker && <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${marker}`} />}
        {label}
      </dt>
      <dd className="shrink-0 font-semibold tabular-nums text-foreground">{count ?? "—"}</dd>
    </div>
  );
}
