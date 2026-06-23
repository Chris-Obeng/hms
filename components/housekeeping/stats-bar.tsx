"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { HousekeepingData } from "@/app/actions/housekeeping";

// ── Column Config ───────────────────────────────────────────────────

export const HK_COLUMNS = [
  {
    id: "dirty",
    label: "Dirty",
    description: "Due for cleaning",
    color: "bg-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/20",
    border: "border-rose-200 dark:border-rose-800/40",
    textColor: "text-rose-700 dark:text-rose-300",
    dotColor: "bg-rose-500",
  },
  {
    id: "cleaning",
    label: "Cleaning",
    description: "In progress",
    color: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800/40",
    textColor: "text-amber-700 dark:text-amber-300",
    dotColor: "bg-amber-500",
  },
  {
    id: "available",
    label: "Ready",
    description: "Vacant & clean",
    color: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800/40",
    textColor: "text-emerald-700 dark:text-emerald-300",
    dotColor: "bg-emerald-500",
  },
  {
    id: "occupied",
    label: "Occupied",
    description: "Guest in room",
    color: "bg-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800/40",
    textColor: "text-blue-700 dark:text-blue-300",
    dotColor: "bg-blue-500",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Out of order",
    color: "bg-slate-500",
    bg: "bg-slate-50 dark:bg-slate-950/20",
    border: "border-slate-200 dark:border-slate-800/40",
    textColor: "text-slate-700 dark:text-slate-300",
    dotColor: "bg-slate-500",
  },
] as const;

// ── Stats Bar ───────────────────────────────────────────────────────

interface HousekeepingStatsBarProps {
  stats: HousekeepingData["stats"];
  todayDepartures: number;
  todayArrivals: number;
}

export function HousekeepingStatsBar({
  stats,
  todayDepartures,
  todayArrivals,
}: HousekeepingStatsBarProps) {
  const occupancyRate =
    stats.totalRooms > 0
      ? Math.round((stats.occupied / stats.totalRooms) * 100)
      : 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Stat chips */}
      <StatChip
        label="Dirty"
        count={stats.dirty}
        color="bg-rose-500"
        textColor="text-rose-700"
        bg="bg-rose-50 dark:bg-rose-950/30"
      />
      <StatChip
        label="Cleaning"
        count={stats.cleaning}
        color="bg-amber-500"
        textColor="text-amber-700"
        bg="bg-amber-50 dark:bg-amber-950/30"
      />
      <StatChip
        label="Ready"
        count={stats.ready}
        color="bg-emerald-500"
        textColor="text-emerald-700"
        bg="bg-emerald-50 dark:bg-emerald-950/30"
      />
      <StatChip
        label="Occupied"
        count={stats.occupied}
        color="bg-blue-500"
        textColor="text-blue-700"
        bg="bg-blue-50 dark:bg-blue-950/30"
      />
      <StatChip
        label="Maint."
        count={stats.maintenance + stats.outOfService}
        color="bg-slate-500"
        textColor="text-slate-700"
        bg="bg-slate-50 dark:bg-slate-950/30"
      />

      <span className="mx-1.5 h-5 w-px bg-border/50" />

      {/* Arrivals / Departures */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-emerald-600">{todayArrivals}</span>
        <span>arrivals</span>
        <span className="text-muted-foreground/30 mx-1">·</span>
        <span className="font-medium text-amber-600">{todayDepartures}</span>
        <span>departures</span>
        <span className="text-muted-foreground/30 mx-1">·</span>
        <span className="font-medium text-blue-600">{occupancyRate}%</span>
        <span>occ.</span>
      </div>
    </div>
  );
}

function StatChip({
  label,
  count,
  color,
  textColor,
  bg,
}: {
  label: string;
  count: number;
  color: string;
  textColor: string;
  bg: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
        bg,
        textColor
      )}
    >
      <span className={cn("size-1.5 rounded-full", color)} />
      {label}
      <span className="opacity-60">{count}</span>
    </div>
  );
}
