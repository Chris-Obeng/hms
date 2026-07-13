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
    bg: "bg-rose-50/50 dark:bg-rose-950/10",
    border: "border-rose-100 dark:border-rose-900/35",
    textColor: "text-rose-700 dark:text-rose-400",
    dotColor: "bg-rose-500",
  },
  {
    id: "cleaning",
    label: "Cleaning",
    description: "In progress",
    color: "bg-amber-500",
    bg: "bg-amber-50/50 dark:bg-amber-950/10",
    border: "border-amber-100 dark:border-amber-900/35",
    textColor: "text-amber-700 dark:text-amber-400",
    dotColor: "bg-amber-500",
  },
  {
    id: "available",
    label: "Ready",
    description: "Vacant & clean",
    color: "bg-emerald-500",
    bg: "bg-emerald-50/50 dark:bg-emerald-950/10",
    border: "border-emerald-100 dark:border-emerald-900/35",
    textColor: "text-emerald-700 dark:text-emerald-400",
    dotColor: "bg-emerald-500",
  },
  {
    id: "occupied",
    label: "Occupied",
    description: "Guest in room",
    color: "bg-blue-500",
    bg: "bg-blue-50/50 dark:bg-blue-950/10",
    border: "border-blue-100 dark:border-blue-900/35",
    textColor: "text-blue-700 dark:text-blue-400",
    dotColor: "bg-blue-500",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Out of order",
    color: "bg-zinc-500",
    bg: "bg-zinc-50/50 dark:bg-zinc-950/10",
    border: "border-zinc-100 dark:border-zinc-900/35",
    textColor: "text-zinc-700 dark:text-zinc-400",
    dotColor: "bg-zinc-500",
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
    <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-2 rounded-2xl border border-border/35 print:bg-transparent print:border-0 print:p-0 print:rounded-none">
      <StatChip
        label="Dirty"
        count={stats.dirty}
        color="bg-rose-500"
        textColor="text-rose-700 dark:text-rose-400"
        borderColor="border-rose-100 dark:border-rose-900/35"
        bg="bg-rose-50/50 dark:bg-rose-950/10"
      />
      <StatChip
        label="Cleaning"
        count={stats.cleaning}
        color="bg-amber-500"
        textColor="text-amber-700 dark:text-amber-400"
        borderColor="border-amber-100 dark:border-amber-900/35"
        bg="bg-amber-50/50 dark:bg-amber-950/10"
      />
      <StatChip
        label="Ready"
        count={stats.ready}
        color="bg-emerald-500"
        textColor="text-emerald-700 dark:text-emerald-400"
        borderColor="border-emerald-100 dark:border-emerald-900/35"
        bg="bg-emerald-50/50 dark:bg-emerald-950/10"
      />
      <StatChip
        label="Occupied"
        count={stats.occupied}
        color="bg-blue-500"
        textColor="text-blue-700 dark:text-blue-400"
        borderColor="border-blue-100 dark:border-blue-900/35"
        bg="bg-blue-50/50 dark:bg-blue-950/10"
      />
      <StatChip
        label="Maint."
        count={stats.maintenance + stats.outOfService}
        color="bg-zinc-500"
        textColor="text-zinc-700 dark:text-zinc-400"
        borderColor="border-zinc-100 dark:border-zinc-900/35"
        bg="bg-zinc-50/50 dark:bg-zinc-950/10"
      />

      <span className="mx-2 h-5 w-px bg-border/40 hidden md:inline-block" />

      <div className="flex items-center gap-2 text-xs text-muted-foreground ml-1.5 py-1 md:py-0">
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {todayArrivals}
        </span>
        <span className="font-medium">arrivals</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="font-semibold text-amber-600 dark:text-amber-400">
          {todayDepartures}
        </span>
        <span className="font-medium">departures</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          {occupancyRate}%
        </span>
        <span className="font-medium">occ.</span>
      </div>
    </div>
  );
}

function StatChip({
  label,
  count,
  color,
  textColor,
  borderColor,
  bg,
}: {
  label: string;
  count: number;
  color: string;
  textColor: string;
  borderColor: string;
  bg: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-1 text-xs font-semibold",
        "backdrop-blur-xs transition-all duration-150 hover:bg-background/80",
        bg,
        borderColor,
        textColor
      )}
    >
      <span className={cn("size-2 rounded-full", color)} />
      <span>{label}</span>
      <span className="font-bold bg-background/50 dark:bg-background/10 px-1.5 rounded-md text-[10px] min-w-4 text-center border border-border/10">
        {count}
      </span>
    </div>
  );
}
