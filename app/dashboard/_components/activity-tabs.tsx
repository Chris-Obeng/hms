"use client";

import * as React from "react";
import { ScrollShadow } from "@heroui/react";
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
}

interface ActivityTabsProps {
  tabs: ActivityTabData[];
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}

/**
 * Segmented filter bar. A muted track holds text+count pills; the active
 * segment lifts to an elevated card chip (iOS-style). Overflow scrolls
 * horizontally with faded edges rather than wrapping or crushing.
 */
export function ActivityTabs({ tabs, activeTab, onTabChange }: ActivityTabsProps) {
  return (
    <div className="border-b border-border/40 bg-muted/[0.15]">
      <ScrollShadow orientation="horizontal" hideScrollBar className="px-2 py-2">
        <div role="group" aria-label="Activity filter" className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const isZero = tab.count === 0;
            const showDue =
              typeof tab.remaining === "number" &&
              tab.remaining > 0 &&
              tab.remaining !== tab.count;

            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap outline-none transition-all duration-150",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <span className={cn(!isActive && isZero && "opacity-50")}>{tab.label}</span>
                <span
                  className={cn(
                    "inline-flex min-w-[1.375rem] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none",
                    isActive
                      ? "bg-primary/12 text-primary"
                      : isZero
                        ? "text-muted-foreground/50"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
                {showDue && (
                  <span
                    aria-label={`${tab.remaining} pending`}
                    className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-amber-700"
                  >
                    {tab.remaining}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollShadow>
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
