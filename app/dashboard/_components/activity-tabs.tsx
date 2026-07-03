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
  /** Which display tier this metric belongs to */
  tier: 1 | 2 | 3;
}

interface ActivityTabsProps {
  tabs: ActivityTabData[];
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}

// ── Tier 1 card (Arrivals / Departures / In-house) ─────────────
// Large, always visible, never in a scroll row.

function Tier1Card({
  tab,
  isActive,
  onTabChange,
}: {
  tab: ActivityTabData;
  isActive: boolean;
  onTabChange: (key: ActivityTab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTabChange(tab.key)}
      aria-pressed={isActive}
      className={cn(
        "group relative flex flex-col items-start gap-1 flex-1 p-4 rounded-xl transition-all duration-200 text-left",
        "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
        isActive
          ? "bg-accent/40 border-border/80 shadow-sm"
          : "bg-card border-border/40 hover:bg-accent/20 hover:border-border/70 hover:shadow-sm shadow-sm"
      )}
    >
      {/* Left accent bar */}
      <div
        className={cn(
          "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-200",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
          tab.accentColor.replace("text-", "bg-")
        )}
      />

      {/* Icon + remaining badge */}
      <div className="flex items-center justify-between w-full">
        <div className={cn(
          "p-1.5 rounded-lg transition-colors",
          isActive ? "bg-accent/60" : "bg-muted/30 group-hover:bg-muted/50"
        )}>
          <tab.icon className={cn("size-4", tab.accentColor)} />
        </div>
        {/* Remaining badge — only when there are still actions pending */}
        {tab.remaining !== undefined && tab.remaining > 0 && (
          <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
            {tab.remaining} left
          </span>
        )}
      </div>

      {/* KPI numeral — text-kpi (28px) */}
      <span className="text-kpi text-foreground mt-1">{tab.count}</span>

      {/* Label */}
      <span className="text-label text-muted-foreground">{tab.label}</span>
    </button>
  );
}

// ── Tier 2 card (Stayovers / New Bookings) ────────────────────
// Slightly smaller, visually recessed.

function Tier2Card({
  tab,
  isActive,
  onTabChange,
}: {
  tab: ActivityTabData;
  isActive: boolean;
  onTabChange: (key: ActivityTab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTabChange(tab.key)}
      aria-pressed={isActive}
      className={cn(
        "group relative flex items-center gap-3 flex-1 px-4 py-3 rounded-xl transition-all duration-200 text-left",
        "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
        isActive
          ? "bg-accent/30 border-border/70 shadow-sm"
          : "bg-card border-border/40 hover:bg-accent/15 hover:border-border/60 shadow-sm"
      )}
    >
      <div className={cn(
        "p-1.5 rounded-lg shrink-0 transition-colors",
        isActive ? "bg-accent/50" : "bg-muted/20 group-hover:bg-muted/40"
      )}>
        <tab.icon className={cn("size-3.5", tab.accentColor, "opacity-80")} />
      </div>
      <div className="min-w-0">
        <span className="text-xl font-bold tabular-nums text-foreground/90">{tab.count}</span>
        <span className="text-caption text-muted-foreground block leading-tight">{tab.label}</span>
      </div>
    </button>
  );
}

// ── Tier 3 — Alert strip ──────────────────────────────────────
// Only rendered when count > 0. Compact amber/red banner, not a card.

function AlertStrip({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: ActivityTabData[];
  activeTab: ActivityTab;
  onTabChange: (key: ActivityTab) => void;
}) {
  const nonZero = tabs.filter((t) => t.tier === 3 && t.count > 0);
  if (nonZero.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="alert" aria-label="Attention required">
      {nonZero.map((tab) => {
        const isActive = activeTab === tab.key;
        const isOverbooked = tab.key === "overbookings";
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
              isOverbooked
                ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
                : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
              isActive && "ring-2 ring-offset-1",
              isActive && (isOverbooked ? "ring-red-300" : "ring-amber-300")
            )}
          >
            <tab.icon className="size-3.5 shrink-0" />
            <span className="tabular-nums font-bold">{tab.count}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main exported component ────────────────────────────────────

export function ActivityTabs({ tabs, activeTab, onTabChange }: ActivityTabsProps) {
  const tier1 = tabs.filter((t) => t.tier === 1);
  const tier2 = tabs.filter((t) => t.tier === 2);
  const hasAlerts = tabs.some((t) => t.tier === 3 && t.count > 0);

  return (
    <div className="space-y-3">
      {/* Row 1 — Primary operational metrics (3-col, never scrolls) */}
      <div className="grid grid-cols-3 gap-3">
        {tier1.map((tab) => (
          <Tier1Card
            key={tab.key}
            tab={tab}
            isActive={activeTab === tab.key}
            onTabChange={onTabChange}
          />
        ))}
      </div>

      {/* Row 2 — Secondary metrics */}
      {tier2.length > 0 && (
        <div className="flex gap-3">
          {tier2.map((tab) => (
            <Tier2Card
              key={tab.key}
              tab={tab}
              isActive={activeTab === tab.key}
              onTabChange={onTabChange}
            />
          ))}
        </div>
      )}

      {/* Row 3 — Alerts strip (conditional, only when non-zero) */}
      {hasAlerts && (
        <AlertStrip tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      )}

      {/* No-alerts indicator */}
      {!hasAlerts && (
        <div className="flex items-center gap-2 px-1">
          <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-caption text-muted-foreground/60">No alerts today</span>
        </div>
      )}
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
    // ── Tier 1: Primary operational (always prominent) ──
    {
      key: "arrivals",
      label: "Arrivals",
      count: data.arrivals,
      remaining: data.uncheckedInArrivals,
      icon: LogIn,
      accentColor: "text-emerald-500",
      tier: 1,
    },
    {
      key: "departures",
      label: "Departures",
      count: data.departures,
      remaining: data.pendingDepartures,
      icon: LogOut,
      accentColor: "text-amber-500",
      tier: 1,
    },
    {
      key: "in_house",
      label: "In-house",
      count: data.inHouse,
      icon: BedDouble,
      accentColor: "text-blue-500",
      tier: 1,
    },

    // ── Tier 2: Secondary (compact, horizontally arranged) ──
    {
      key: "stayovers",
      label: "Stayovers",
      count: data.stayovers,
      icon: Users,
      accentColor: "text-violet-500",
      tier: 2,
    },
    {
      key: "bookings",
      label: "New Bookings",
      count: data.newBookings,
      icon: CalendarDays,
      accentColor: "text-indigo-500",
      tier: 2,
    },

    // ── Tier 3: Exception/alert (only shown when > 0) ──
    {
      key: "cancellations",
      label: "Cancelled",
      count: data.cancellations,
      icon: Ban,
      accentColor: "text-amber-600",
      tier: 3,
    },
    {
      key: "overbookings",
      label: "Overbooked",
      count: data.overbookings,
      icon: AlertTriangle,
      accentColor: "text-red-500",
      tier: 3,
    },
  ];
}

