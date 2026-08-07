"use client";

import * as React from "react";
import { CheckCircle2, User } from "lucide-react";
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

interface ActivityTabsProps {
  tabs: ActivityTabData[];
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}

export function ActivityTabs({ tabs, activeTab, onTabChange }: ActivityTabsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-4 bg-background/50 border-b border-border/40 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            aria-pressed={isActive}
            className={cn(
              "flex flex-col justify-between p-3 min-w-[110px] h-[78px] rounded-xl border text-left transition-all duration-150 cursor-pointer outline-none",
              isActive
                ? "bg-blue-50/50 dark:bg-blue-950/20 border-primary shadow-xs ring-1 ring-primary/30"
                : "bg-card border-border/40 hover:border-border/80 hover:bg-accent/30"
            )}
          >
            {/* Number + Badge/Icon Row */}
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold text-foreground font-mono leading-none">
                {tab.count}
              </span>

              {/* Arrivals active badge */}
              {tab.key === "arrivals" && tab.count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
                  {tab.count}
                </span>
              )}

              {/* Departures checkmark icon */}
              {tab.key === "departures" && (
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              )}

              {/* In-house guest icon */}
              {tab.key === "in_house" && (
                <User className="size-3.5 text-muted-foreground shrink-0" />
              )}
            </div>

            {/* Label */}
            <span className="text-xs font-semibold text-muted-foreground truncate">
              {tab.label}
            </span>
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
      label: "Cancelations",
      count: data.cancellations,
    },
    {
      key: "overbookings",
      label: "Overbookings",
      count: data.overbookings,
    },
  ];
}
