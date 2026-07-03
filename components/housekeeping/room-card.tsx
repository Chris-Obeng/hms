"use client";

import * as React from "react";
import {
  Users,
  LogIn,
  LogOut,
  Star,
  Play,
  Check,
  Wrench,
  UserCheck,
  ClipboardList,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { HousekeepingRoom } from "@/app/actions/housekeeping";

// ── Status Config ───────────────────────────────────────────────────

const ROOM_STATUS_CONFIG: Record<
  string,
  { label: string; dotColor: string; bgColor: string; borderColor: string; hoverBorderColor: string }
> = {
  checkout_pending: {
    label: "Dirty",
    dotColor: "bg-rose-500",
    bgColor: "bg-rose-50/40 dark:bg-rose-950/10",
    borderColor: "border-rose-100 dark:border-rose-900/30",
    hoverBorderColor: "hover:border-rose-200 dark:hover:border-rose-800/50",
  },
  cleaning: {
    label: "Cleaning",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-50/40 dark:bg-amber-950/10",
    borderColor: "border-amber-100 dark:border-amber-900/30",
    hoverBorderColor: "hover:border-amber-200 dark:hover:border-amber-800/50",
  },
  available: {
    label: "Ready",
    dotColor: "bg-emerald-500",
    bgColor: "bg-emerald-50/40 dark:bg-emerald-950/10",
    borderColor: "border-emerald-100 dark:border-emerald-900/30",
    hoverBorderColor: "hover:border-emerald-200 dark:hover:border-emerald-800/50",
  },
  occupied: {
    label: "Occupied",
    dotColor: "bg-blue-500",
    bgColor: "bg-blue-50/40 dark:bg-blue-950/10",
    borderColor: "border-blue-100 dark:border-blue-900/30",
    hoverBorderColor: "hover:border-blue-200 dark:hover:border-blue-800/50",
  },
  maintenance: {
    label: "Maintenance",
    dotColor: "bg-zinc-500",
    bgColor: "bg-zinc-50/40 dark:bg-zinc-950/10",
    borderColor: "border-zinc-100 dark:border-zinc-900/30",
    hoverBorderColor: "hover:border-zinc-200 dark:hover:border-zinc-800/50",
  },
  out_of_service: {
    label: "Out of Service",
    dotColor: "bg-red-600",
    bgColor: "bg-red-50/40 dark:bg-red-950/10",
    borderColor: "border-red-100 dark:border-red-900/30",
    hoverBorderColor: "hover:border-red-200 dark:hover:border-red-800/50",
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
          "flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs cursor-pointer bg-card/65",
          config.borderColor,
          config.hoverBorderColor
        )}
      >
        <span className={cn("size-2 shrink-0 rounded-full", config.dotColor)} />
        <span className="text-xs font-semibold text-foreground font-mono">
          {room.roomNumber}
        </span>
        <span className="text-[10px] text-muted-foreground truncate flex-1">
          {room.roomTypeName}
        </span>
        {hasArrival && <LogIn className="size-3 text-emerald-500 shrink-0" />}
        {hasDeparture && <LogOut className="size-3 text-amber-500 shrink-0" />}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5 space-y-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm group cursor-pointer bg-card",
        config.borderColor,
        config.hoverBorderColor,
        config.bgColor
      )}
    >
      {/* Room Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("size-2 shrink-0 rounded-full", config.dotColor)} />
          <span className="text-sm font-bold text-foreground font-mono">
            {room.roomNumber}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 rounded-md font-medium text-muted-foreground/80 bg-background/50 border-border/40"
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
        <p className="text-[10px] text-muted-foreground/50 font-medium">
          Floor {room.floor}
        </p>
      )}

      {/* Status Tags */}
      {(hasArrival || hasDeparture || room.guestName) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {hasArrival && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 dark:bg-emerald-500/5 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <LogIn className="size-3" />
              Arriving
            </span>
          )}
          {hasDeparture && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 dark:bg-amber-500/5 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <LogOut className="size-3" />
              Departing
            </span>
          )}
          {room.guestName && (
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 dark:bg-blue-500/5 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[140px]">
              <Users className="size-3" />
              {room.guestName}
            </span>
          )}
        </div>
      )}

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div className="flex flex-col gap-1 pt-1.5">
          {quickActions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <button
                key={action.status}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(room.id, action.status);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all duration-150",
                  "bg-background/80 hover:bg-background border border-border/40 hover:border-border active:scale-[0.98]",
                  action.color
                )}
              >
                <ActionIcon className="size-3" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {room.notes && (
        <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed border-t border-border/20 pt-2">
          {room.notes}
        </p>
      )}
    </div>
  );
}

// ── Quick Actions Helper ───────────────────────────────────────────

interface ActionConfig {
  status: string;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getQuickActions(status: string): ActionConfig[] {
  switch (status) {
    case "checkout_pending":
      return [
        { status: "cleaning", label: "Start Cleaning", color: "text-amber-600 dark:text-amber-400", icon: Play },
        { status: "maintenance", label: "Report Issue", color: "text-zinc-600 dark:text-zinc-400", icon: Wrench },
      ];
    case "cleaning":
      return [
        { status: "available", label: "Mark Clean & Ready", color: "text-emerald-600 dark:text-emerald-400", icon: Check },
        { status: "maintenance", label: "Report Issue", color: "text-zinc-600 dark:text-zinc-400", icon: Wrench },
      ];
    case "available":
      return [
        { status: "occupied", label: "Mark Occupied", color: "text-blue-600 dark:text-blue-400", icon: UserCheck },
        { status: "maintenance", label: "Maintenance", color: "text-zinc-600 dark:text-zinc-400", icon: Wrench },
      ];
    case "occupied":
      return [
        { status: "checkout_pending", label: "Check-out Prep", color: "text-orange-600 dark:text-orange-400", icon: ClipboardList },
        { status: "maintenance", label: "Report Issue", color: "text-zinc-600 dark:text-zinc-400", icon: Wrench },
      ];
    case "maintenance":
    case "out_of_service":
      return [
        { status: "available", label: "Mark Available", color: "text-emerald-600 dark:text-emerald-400", icon: Check },
      ];
    default:
      return [];
  }
}

