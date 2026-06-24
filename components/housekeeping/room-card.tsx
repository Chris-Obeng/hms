"use client";

import * as React from "react";
import {
  Users,
  LogIn,
  LogOut,
  Star,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { HousekeepingRoom } from "@/app/actions/housekeeping";

// ── Status Config ───────────────────────────────────────────────────

const ROOM_STATUS_CONFIG: Record<
  string,
  { label: string; dotColor: string; bgColor: string; borderColor: string }
> = {
  checkout_pending: {
    label: "Dirty",
    dotColor: "bg-rose-500",
    bgColor: "bg-rose-50 dark:bg-rose-950/20",
    borderColor: "border-rose-200 dark:border-rose-800/40",
  },
  cleaning: {
    label: "Cleaning",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    borderColor: "border-amber-200 dark:border-amber-800/40",
  },
  available: {
    label: "Ready",
    dotColor: "bg-emerald-500",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
    borderColor: "border-emerald-200 dark:border-emerald-800/40",
  },
  occupied: {
    label: "Occupied",
    dotColor: "bg-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    borderColor: "border-blue-200 dark:border-blue-800/40",
  },
  maintenance: {
    label: "Maintenance",
    dotColor: "bg-slate-500",
    bgColor: "bg-slate-50 dark:bg-slate-950/20",
    borderColor: "border-slate-200 dark:border-slate-800/40",
  },
  out_of_service: {
    label: "Out of Service",
    dotColor: "bg-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    borderColor: "border-red-200 dark:border-red-800/40",
  },
};

// ── Props ───────────────────────────────────────────────────────────

interface RoomCardProps {
  room: HousekeepingRoom;
  onStatusChange: (roomId: string, newStatus: string) => void;
  compact?: boolean;
}

// ── Component ──────────────────────────────────────────────────────

export function RoomCard({ room, onStatusChange, compact = false }: RoomCardProps) {
  const config = ROOM_STATUS_CONFIG[room.status] || ROOM_STATUS_CONFIG.available;
  const hasArrival = room.hasArrivalToday;
  const hasDeparture = room.hasDepartureToday;

  // Determine quick actions based on current status
  const quickActions = getQuickActions(room.status);

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all hover:shadow-sm cursor-pointer",
          config.borderColor
        )}
      >
        <span className={cn("size-2 shrink-0 rounded-full", config.dotColor)} />
        <span className="text-xs font-semibold text-foreground font-mono">
          {room.roomNumber}
        </span>
        <span className="text-[10px] text-muted-foreground truncate">
          {room.roomTypeName}
        </span>
        {hasArrival && <LogIn className="size-2.5 text-emerald-500 shrink-0" />}
        {hasDeparture && <LogOut className="size-2.5 text-amber-500 shrink-0" />}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-3 space-y-2.5 transition-all hover:shadow-sm group cursor-pointer",
        config.borderColor,
        config.bgColor
      )}
    >
      {/* Room Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("size-2 shrink-0 rounded-full", config.dotColor)} />
          <span className="text-sm font-semibold text-foreground font-mono">
            {room.roomNumber}
          </span>
          <Badge
            variant="outline"
            className="text-[9px] px-1 h-4 font-medium text-muted-foreground"
          >
            {room.roomTypeName}
          </Badge>
        </div>
        {room.isVip && (
          <Star className="size-3.5 text-amber-500 fill-amber-500 shrink-0" />
        )}
      </div>

      {/* Floor */}
      {room.floor && (
        <p className="text-[10px] text-muted-foreground/60">
          Floor {room.floor}
        </p>
      )}

      {/* Status Tags */}
      <div className="flex flex-wrap items-center gap-1">
        {hasArrival && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600">
            <LogIn className="size-2.5" />
            Arriving
          </span>
        )}
        {hasDeparture && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">
            <LogOut className="size-2.5" />
            Departing
          </span>
        )}
        {room.guestName && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">
            <Users className="size-2.5" />
            {room.guestName}
          </span>
        )}
      </div>

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {quickActions.map((action) => (
            <button
              key={action.status}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(room.id, action.status);
              }}
              className={cn(
                "flex-1 rounded-md py-1 text-[10px] font-medium transition-all",
                "border border-border/50 hover:border-border",
                action.color
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Notes */}
      {room.notes && (
        <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed">
          {room.notes}
        </p>
      )}
    </div>
  );
}

// ── Quick Actions Helper ───────────────────────────────────────────

function getQuickActions(status: string): { status: string; label: string; color: string }[] {
  switch (status) {
    case "checkout_pending":
      return [
        { status: "cleaning", label: "Start Cleaning", color: "text-amber-600" },
        { status: "maintenance", label: "Report Issue", color: "text-slate-600" },
      ];
    case "cleaning":
      return [
        { status: "available", label: "Mark Clean & Ready", color: "text-emerald-600" },
        { status: "maintenance", label: "Report Issue", color: "text-slate-600" },
      ];
    case "available":
      return [
        { status: "occupied", label: "Mark Occupied", color: "text-blue-600" },
        { status: "maintenance", label: "Maintenance", color: "text-slate-600" },
      ];
    case "occupied":
      return [
        { status: "checkout_pending", label: "Check-out Prep", color: "text-orange-600" },
        { status: "maintenance", label: "Report Issue", color: "text-slate-600" },
      ];
    case "maintenance":
    case "out_of_service":
      return [
        { status: "available", label: "Mark Available", color: "text-emerald-600" },
      ];
    default:
      return [];
  }
}
