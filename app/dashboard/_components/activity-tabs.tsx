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
 * Segmented operational filter bar. Scrolls horizontally on narrow viewports
 * with faded edges and explicit pan-x/pan-y touch handling so horizontal swipes
 * never fight vertical page scroll.
 */
export function ActivityTabs({ tabs, activeTab, onTabChange }: ActivityTabsProps) {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((t) => t.key === activeTab);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const target = tabs[nextIndex];
      onTabChange(target.key);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="border-b border-border/50 bg-muted/25">
      <ScrollShadow
        orientation="horizontal"
        hideScrollBar
        className="touch-pan-x px-3 py-2 sm:px-3"
      >
        <div
          role="tablist"
          aria-label="Front-desk activity views"
          onKeyDown={handleKeyDown}
          className="flex items-center gap-1"
        >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.key;
            const isZero = tab.count === 0;
            const isAlert = tab.key === "overbookings" && tab.count > 0;
            const showDue =
              typeof tab.remaining === "number" &&
              tab.remaining > 0 &&
              tab.remaining !== tab.count;

            return (
              <button
                key={tab.key}
                id={`activity-tab-${tab.key}`}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                aria-controls={`activity-panel-${tab.key}`}
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  "ui-press inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap outline-none sm:min-h-10 sm:px-3",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.06)] ring-1 ring-border/70"
                    : isAlert
                      ? "bg-destructive/[0.06] text-destructive [@media(hover:hover)_and_(pointer:fine)]:hover:bg-destructive/10"
                      : "text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-background/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                )}
              >
                <span className={cn(!isActive && isZero && "opacity-55")}>{tab.label}</span>

                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-md px-2 py-1 font-mono text-2xs font-medium leading-none tabular-nums",
                    isAlert
                      ? "bg-destructive/15 text-destructive"
                      : isActive
                        ? "bg-primary/12 text-primary font-semibold"
                        : isZero
                          ? "text-muted-foreground/45"
                          : "text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>

                {showDue && (
                  <span
                    aria-label={`${tab.remaining} pending`}
                    className="inline-flex items-center rounded-md bg-amber-500/15 px-2 py-1 font-mono text-2xs font-semibold leading-none tabular-nums text-amber-700"
                  >
                    {tab.remaining} due
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
