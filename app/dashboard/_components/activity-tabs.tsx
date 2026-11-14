"use client";

import * as React from "react";
import { Tabs } from "@heroui/react";
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
}

interface ActivityTabsProps {
  tabs: ActivityTabData[];
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  /** Rendered inside the selected tab's panel. */
  children: React.ReactNode;
}

/**
 * Front-desk views as HeroUI underline tabs. The list scrolls horizontally on
 * narrow screens (HeroUI's ListContainer handles the overflow affordance) and
 * React Aria owns roving focus, arrow keys and tab/panel wiring.
 */
export function ActivityTabs({ tabs, activeTab, onTabChange, children }: ActivityTabsProps) {
  return (
    <Tabs
      variant="secondary"
      selectedKey={activeTab}
      onSelectionChange={(key) => onTabChange(String(key) as ActivityTab)}
      className="gap-0"
    >
      {/* Styling lives in utilities (not global CSS) so it always wins over HeroUI's
          component layer. This theme maps HeroUI's --accent and --muted to pale
          surfaces, so labels and the indicator read brand / muted-foreground tokens. */}
      <Tabs.ListContainer className="border-border">
        <Tabs.List aria-label="Front-desk activity views" className="gap-6 px-4 sm:px-6">
          {tabs.map((tab) => {
            const isAlert = tab.key === "overbookings" && tab.count > 0;
            return (
              <Tabs.Tab
                key={tab.key}
                id={tab.key}
                className="group h-14 w-auto flex-none gap-2 px-0 text-sm font-medium text-muted-foreground data-[selected=true]:font-semibold data-[selected=true]:text-foreground"
              >
                {tab.label}
                {/* Counts are small pills; the selected one turns ink, a conflict count turns red. */}
                <span
                  className={cn(
                    "inline-grid h-5 min-w-5 place-items-center rounded-full px-2 text-2xs font-semibold tabular-nums transition-colors duration-150",
                    isAlert
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-muted-foreground group-data-[selected=true]:bg-foreground group-data-[selected=true]:text-background"
                  )}
                >
                  {tab.count}
                </span>
                <Tabs.Indicator className="rounded-t-sm bg-foreground" />
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </Tabs.ListContainer>

      {tabs.map((tab) => (
        <Tabs.Panel key={tab.key} id={tab.key} className="mt-0 p-0">
          {tab.key === activeTab ? children : null}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

export function buildActivityTabs(
  data: {
    arrivals: number;
    departures: number;
    inHouse: number;
    newBookings: number;
    cancellations: number;
    overbookings: number;
  },
  activeTab?: ActivityTab
): ActivityTabData[] {
  const tabs: ActivityTabData[] = [
    { key: "arrivals", label: "Arrivals", count: data.arrivals },
    { key: "departures", label: "Departures", count: data.departures },
    { key: "in_house", label: "In-house", count: data.inHouse },
    { key: "bookings", label: "New bookings", count: data.newBookings },
    { key: "cancellations", label: "Cancellations", count: data.cancellations },
  ];
  // Conflicts are exceptional: the tab only appears when there is something to resolve
  // (or while the operator is still looking at it).
  if (data.overbookings > 0 || activeTab === "overbookings") {
    tabs.push({ key: "overbookings", label: "Conflicts", count: data.overbookings });
  }
  return tabs;
}
