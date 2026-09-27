"use client";

import * as React from "react";
import { CheckCircle2, KeyRound, MoonStar, PlusCircle, UserRound, XOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivityTab =
  | "arrivals"
  | "departures"
  | "in_house"
  | "bookings"
  | "cancellations"
  | "overbookings";

export interface ActivityTabData {
  key: ActivityTab;
  label: string;
  count: number;
  remaining?: number;
  icon?: React.ComponentType<{ className?: string }>;
}

const TAB_ICONS: Record<ActivityTab, React.ComponentType<{ className?: string }>> = {
  arrivals: KeyRound,
  departures: CheckCircle2,
  in_house: UserRound,
  bookings: PlusCircle,
  cancellations: XOctagon,
  overbookings: MoonStar,
};

interface ActivityTabsProps {
  tabs: ActivityTabData[];
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}

export function ActivityTabs({ tabs, activeTab, onTabChange }: ActivityTabsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 overflow-x-auto border-b border-border/40 bg-muted/[0.18] p-3 sm:grid-cols-3 lg:grid-cols-6">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = TAB_ICONS[tab.key];
        const showDue =
          typeof tab.remaining === "number" &&
          tab.remaining > 0 &&
          tab.remaining !== tab.count;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            aria-pressed={isActive}
            className={cn(
              "flex min-w-0 cursor-pointer flex-col justify-between gap-1 rounded-xl border p-2.5 text-left outline-none transition-all duration-150",
              "min-h-[68px] focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary/30 bg-primary/[0.07] shadow-xs ring-1 ring-primary/20"
                : "border-border/40 bg-card hover:border-border hover:bg-accent/40"
            )}
          >
            <div className="flex w-full items-center justify-between gap-1.5">
              <span
                className={cn(
                  "text-xl font-bold leading-none tabular-nums",
                  isActive ? "text-primary" : "text-foreground/85"
                )}
              >
                {tab.count}
              </span>
              <Icon
                className={cn(
                  "size-3.5 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground/50"
                )}
              />
            </div>

            <div className="flex w-full items-center justify-between gap-1">
              <span
                className={cn(
                  "truncate text-xs font-semibold",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {tab.label}
              </span>
              {showDue && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-bold tabular-nums text-amber-700">
                  {tab.remaining}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function buildActivityTabs(data: {
  arrivals: number;
  uncheckedInArrivals: number;
  departures: number;
  pendingDepartures: number;
  inHouse: number;
  newBookings: number;
  cancellations: number;
  overbookings: number;
}): ActivityTabData[] {
  return [
    {
      key: "arrivals",
      label: "Arrivals",
      count: data.arrivals,
      remaining: data.uncheckedInArrivals,
    },
    {
      key: "departures",
      label: "Departures",
      count: data.departures,
      remaining: data.pendingDepartures,
    },
    {
      key: "in_house",
      label: "In-house",
      count: data.inHouse,
    },
    {
      key: "bookings",
      label: "Bookings",
      count: data.newBookings,
    },
    {
      key: "cancellations",
      label: "Cancellations",
      count: data.cancellations,
    },
    {
      key: "overbookings",
      label: "Overbookings",
      count: data.overbookings,
    },
  ];
}
