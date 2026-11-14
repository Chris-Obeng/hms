"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type { ActivityTab } from "./activity-tabs";

type Stats = {
  arrivals: number;
  uncheckedInArrivals: number;
  departures: number;
  pendingDepartures: number;
  inHouse: number;
  stayovers: number;
};

/**
 * The day in four numbers, one card. Each part opens its list below, so the
 * strip doubles as the page's main navigation. Progress bars show how much of
 * the day's work is done (checked in, checked out) in the calendar's status
 * colours: green for in house, slate for checked out.
 */
export function TodayStrip({
  stats,
  collected,
  currency,
  activeTab,
  onSelect,
}: {
  stats: Stats;
  collected: number;
  currency: string;
  activeTab: ActivityTab;
  onSelect: (tab: ActivityTab) => void;
}) {
  const checkedIn = Math.max(0, stats.arrivals - stats.uncheckedInArrivals);
  const checkedOut = Math.max(0, stats.departures - stats.pendingDepartures);

  return (
    <section
      aria-label="Today at a glance"
      className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(20_20_19/0.04)] lg:grid-cols-4"
    >
      <Segment
        label="Arrivals"
        value={stats.arrivals}
        note={
          stats.arrivals === 0
            ? "None expected"
            : stats.uncheckedInArrivals > 0
              ? `${stats.uncheckedInArrivals} still to check in`
              : "All checked in"
        }
        done={checkedIn}
        total={stats.arrivals}
        tone="#0E8050"
        active={activeTab === "arrivals"}
        onPress={() => onSelect("arrivals")}
        className="border-b border-r border-border lg:border-b-0"
      />
      <Segment
        label="Departures"
        value={stats.departures}
        note={
          stats.departures === 0
            ? "None due"
            : stats.pendingDepartures > 0
              ? `${stats.pendingDepartures} still to check out`
              : "All checked out"
        }
        done={checkedOut}
        total={stats.departures}
        tone="#818A95"
        active={activeTab === "departures"}
        onPress={() => onSelect("departures")}
        className="border-b border-border lg:border-b-0 lg:border-r"
      />
      <Segment
        label="In house"
        value={stats.inHouse}
        note={stats.stayovers > 0 ? `${stats.stayovers} staying over` : "Guests checked in"}
        active={activeTab === "in_house"}
        onPress={() => onSelect("in_house")}
        className="border-r border-border"
      />
      <Link
        href="/dashboard/payments"
        className="group ui-press flex min-w-0 flex-col justify-between gap-3 p-4 outline-none focus-visible:bg-secondary sm:p-6 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/60"
      >
        <span className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
          Collected
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </span>
        <span className="truncate text-[28px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-foreground sm:text-[32px]">
          {formatCurrencyCompact(collected, currency)}
        </span>
        <span className="flex flex-col gap-2">
          <span aria-hidden="true" className="h-1" />
          <span className="truncate text-xs text-muted-foreground">Payments received</span>
        </span>
      </Link>
    </section>
  );
}

function Segment({
  label,
  value,
  note,
  done,
  total,
  tone,
  active,
  onPress,
  className,
}: {
  label: string;
  value: number;
  note: string;
  done?: number;
  total?: number;
  tone?: string;
  active: boolean;
  onPress: () => void;
  className?: string;
}) {
  const showBar = typeof total === "number" && total > 0 && tone;
  const pct = showBar ? Math.round(((done ?? 0) / (total as number)) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={active}
      className={cn(
        "ui-press relative flex min-w-0 flex-col justify-between gap-3 p-4 text-left outline-none focus-visible:bg-secondary sm:p-6",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/60",
        className,
      )}
    >
      {/* Selected part: an ink rule along the top edge */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-[2px] bg-foreground transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-[28px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-foreground sm:text-[32px]">
        {value}
      </span>
      <span className="flex flex-col gap-2">
        {/* The bar slot is always there, so every number in the strip lines up. */}
        {showBar ? (
          <span
            aria-hidden="true"
            className="h-1 overflow-hidden rounded-full bg-secondary"
            style={{ "--tone": tone } as CSSProperties}
          >
            <span
              className="block h-full rounded-full bg-[var(--tone)] transition-[width] duration-500 ease-[var(--ease-out-ui)]"
              style={{ width: `${pct}%` }}
            />
          </span>
        ) : (
          <span aria-hidden="true" className="h-1" />
        )}
        <span className="truncate text-xs text-muted-foreground">{note}</span>
      </span>
    </button>
  );
}
