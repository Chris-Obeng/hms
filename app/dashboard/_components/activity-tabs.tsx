"use client";

import * as React from "react";
import {
  LogIn,
  LogOut,
  BedDouble,
  CalendarDays,
  Ban,
  AlertTriangle,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────

export type ActivityTab =
  | "arrivals"
  | "departures"
  | "in_house"
  | "stayovers"
  | "bookings"
  | "cancellations"
  | "overbookings";

export interface ActivityTabData {
  key: ActivityTab;
  label: string;
  count: number;
  remaining?: number;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

interface ActivityTabsProps {
  tabs: ActivityTabData[];
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}

// ── Component ───────────────────────────────────────────────────

const iconSize = "size-3.5";

export function ActivityTabs({ tabs, activeTab, onTabChange }: ActivityTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "group relative flex flex-col items-start gap-0.5 min-w-[100px] flex-1 p-3 rounded-xl transition-all duration-200 text-left",
              "border border-border/50 hover:border-border/80",
              isActive
                ? "bg-accent/30 border-border/80 ring-1 ring-border/50"
                : "bg-card hover:bg-accent/10",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            {/* Left accent bar */}
            <div
              className={cn(
                "absolute left-0 top-1 bottom-1 w-0.5 rounded-full transition-all duration-200",
                isActive ? "opacity-100" : "opacity-0",
                tab.accentColor
              )}
            />

            {/* Top row: icon + remaining badge */}
            <div className="flex items-center justify-between w-full mb-0.5">
              <div className={cn("p-1 rounded-md", isActive ? `${tab.accentColor.replace("bg-", "bg-").replace("text-", "")}/10` : "bg-muted/30")}>
                <tab.icon className={cn(iconSize, tab.accentColor)} />
              </div>
              {tab.remaining !== undefined && tab.remaining > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    "bg-primary/10 text-primary"
                  )}
                >
                  {tab.remaining}
                </span>
              )}
            </div>

            {/* Count */}
            <span className="text-xl font-bold tabular-nums text-foreground">
              {tab.count}
            </span>

            {/* Label */}
            <span className="text-[11px] font-medium text-muted-foreground leading-tight">
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Default Tab Builder ────────────────────────────────────────

export function buildActivityTabs(data: {
  arrivals: number;
  uncheckedInArrivals: number;
  departures: number;
  pendingDepartures: number;
  inHouse: number;
  stayovers: number;
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
      icon: LogIn,
      accentColor: "text-emerald-500",
    },
    {
      key: "departures",
      label: "Departures",
      count: data.departures,
      remaining: data.pendingDepartures,
      icon: LogOut,
      accentColor: "text-amber-500",
    },
    {
      key: "in_house",
      label: "In-house",
      count: data.inHouse,
      icon: BedDouble,
      accentColor: "text-blue-500",
    },
    {
      key: "stayovers",
      label: "Stayovers",
      count: data.stayovers,
      icon: Users,
      accentColor: "text-violet-500",
    },
    {
      key: "bookings",
      label: "Bookings",
      count: data.newBookings,
      icon: CalendarDays,
      accentColor: "text-indigo-500",
    },
    {
      key: "cancellations",
      label: "Cancelled",
      count: data.cancellations,
      icon: Ban,
      accentColor: "text-red-500",
    },
    {
      key: "overbookings",
      label: "Overbooked",
      count: data.overbookings,
      icon: AlertTriangle,
      accentColor: "text-rose-500",
    },
  ];
}
