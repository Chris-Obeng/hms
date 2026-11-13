"use client";

import * as React from "react";
import { Tabs } from "@heroui/react";

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
      className="desk-tabs gap-0"
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="Front-desk activity views">
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.key} id={tab.key}>
              {tab.label}
              <span
                className="desk-tab-count"
                data-tone={tab.key === "overbookings" && tab.count > 0 ? "danger" : undefined}
              >
                {tab.count}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>

      {tabs.map((tab) => (
        <Tabs.Panel key={tab.key} id={tab.key}>
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
