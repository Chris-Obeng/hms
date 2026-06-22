"use client";

import * as React from "react";
import { Home, CheckCircle2, LogIn, LogOut, Sparkles } from "lucide-react";
import type { CalendarRoom, CalendarBooking } from "../actions";

interface CalendarStatsBarProps {
  rooms: CalendarRoom[];
  bookings: CalendarBooking[];
  todayStr: string; // "YYYY-MM-DD"
}

export function CalendarStatsBar({ rooms, bookings, todayStr }: CalendarStatsBarProps) {
  // Live occupancy stats based on room status
  const occupiedCount = rooms.filter((r) => r.status === "occupied").length;
  const availableCount = rooms.filter((r) => r.status === "available").length;
  const maintenanceCount = rooms.filter(
    (r) => r.status === "maintenance" || r.status === "out_of_service"
  ).length;

  // Bookings stats for "today"
  const arrivalsToday = bookings.filter(
    (b) => b.checkIn === todayStr && b.status !== "cancelled" && b.status !== "checked_out"
  ).length;

  const departuresToday = bookings.filter(
    (b) => b.checkOut === todayStr && b.status === "checked_in"
  ).length;

  const checkedInCount = bookings.filter((b) => b.status === "checked_in").length;

  const totalRooms = rooms.length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-3 py-2 px-1 border-b border-border/20">
      {/* Occupancy Rate */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 text-primary text-xs font-semibold border border-primary/10">
        <Sparkles className="size-3.5" />
        <span>{occupancyRate}% Occupancy</span>
      </div>

      {/* Stats Cards */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/5 text-emerald-600 border border-emerald-500/10">
          <CheckCircle2 className="size-3.5" />
          <span className="font-medium">Available:</span>
          <span className="font-bold">{availableCount}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/5 text-blue-600 border border-blue-500/10">
          <Home className="size-3.5" />
          <span className="font-medium">Occupied:</span>
          <span className="font-bold">{occupiedCount}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/5 text-violet-600 border border-violet-500/10">
          <LogIn className="size-3.5" />
          <span className="font-medium">Arrivals Today:</span>
          <span className="font-bold">{arrivalsToday}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/5 text-amber-600 border border-amber-500/10">
          <LogOut className="size-3.5" />
          <span className="font-medium">Departures Today:</span>
          <span className="font-bold">{departuresToday}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-500/5 text-teal-600 border border-teal-500/10">
          <CheckCircle2 className="size-3.5" />
          <span className="font-medium">In-House:</span>
          <span className="font-bold">{checkedInCount}</span>
        </div>

        {maintenanceCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-500/5 text-slate-600 border border-slate-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
            <span className="font-medium">Out of Service:</span>
            <span className="font-bold">{maintenanceCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
