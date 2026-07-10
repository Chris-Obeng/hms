"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// ── Types ──────────────────────────────────────────────────────

interface OccupancyCardProps {
  occupancyPercent: number;
  availableUnits: number;
  bookedUnits: number;
  outOfService: number;
  blockedDates: number;
  totalRooms: number;
}

// ── SVG Donut Chart ────────────────────────────────────────────

function OccupancyDonut({ percent }: { percent: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const filledLength = (percent / 100) * circumference;
  const emptyLength = circumference - filledLength;

  // Color based on occupancy
  const getColor = (pct: number) => {
    if (pct >= 70) return "stroke-emerald-500";
    if (pct >= 40) return "stroke-amber-500";
    return "stroke-red-500";
  };

  const color = getColor(percent);

  // Animate on mount
  const [animatedOffset, setAnimatedOffset] = React.useState(circumference);
  React.useEffect(() => {
    const timer = setTimeout(() => setAnimatedOffset(emptyLength), 100);
    return () => clearTimeout(timer);
  }, [percent, emptyLength]);

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width="150"
        height="150"
        viewBox="0 0 120 120"
        className="transform -rotate-90"
        role="img"
        aria-label={`Occupancy: ${percent}%`}
      >
        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/20"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          className={cn("transition-all duration-1000 ease-out", color)}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${emptyLength}`}
          strokeDashoffset={animatedOffset}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-kpi-hero text-foreground">
          {percent}%
        </span>
        <span className="text-caption font-medium text-muted-foreground uppercase tracking-wide mt-0.5">
          Occupancy
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function OccupancyCard({
  occupancyPercent,
  availableUnits,
  bookedUnits,
  outOfService,
  blockedDates,
  totalRooms,
}: OccupancyCardProps) {
  const stats = [
    { label: "Available", value: availableUnits, color: "text-emerald-500" },
    { label: "Booked", value: bookedUnits, color: "text-blue-500" },
    { label: "Out of Service", value: outOfService, color: "text-amber-500" },
    { label: "Blocked", value: blockedDates, color: "text-muted-foreground" },
  ];

  return (
    <Card className="card-default">
      <CardHeader className="pb-3">
        <CardTitle className="text-section">Occupancy</CardTitle>
        <CardDescription className="text-caption mt-0.5">
          {totalRooms} total room{totalRooms !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Donut */}
        <div className="flex justify-center py-2">
          <OccupancyDonut percent={occupancyPercent} />
        </div>

        {/* 2x2 Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/30 bg-muted/5 p-3 hover:bg-muted/10 transition-colors"
            >
              <p className={cn("text-xl font-bold tabular-nums", stat.color)}>
                {stat.value}
              </p>
              <p className="text-caption text-muted-foreground truncate mt-0.5">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
