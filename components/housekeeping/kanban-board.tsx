"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { RoomCard } from "./room-card";
import { HK_COLUMNS } from "./stats-bar";
import type { HousekeepingRoom } from "@/app/actions/housekeeping";

// ── Column Config (augmented with mapping logic) ────────────────────

const COLUMN_ROOM_FILTER: Record<string, (room: HousekeepingRoom) => boolean> = {
  dirty: (r) => r.status === "checkout_pending",
  cleaning: (r) => r.status === "cleaning",
  available: (r) => r.status === "available",
  occupied: (r) => r.status === "occupied",
  maintenance: (r) => r.status === "maintenance" || r.status === "out_of_service",
};

// ── Props ───────────────────────────────────────────────────────────

interface HousekeepingBoardProps {
  rooms: HousekeepingRoom[];
  onStatusChange: (roomId: string, newStatus: string) => void;
  compact?: boolean;
}

// ── Component ──────────────────────────────────────────────────────

export function HousekeepingBoard({
  rooms,
  onStatusChange,
  compact = false,
}: HousekeepingBoardProps) {
  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BedDoubleIcon className="size-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No rooms found</p>
        <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">
          Add rooms to your property to start managing housekeeping.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full" style={{ scrollbarWidth: "thin" }}>
      {HK_COLUMNS.map((column) => {
        const filterFn = COLUMN_ROOM_FILTER[column.id];
        const columnRooms = filterFn ? rooms.filter(filterFn) : [];
        const columnRoomsSorted = sortRooms(columnRooms);

        return (
          <div
            key={column.id}
            className="flex w-56 shrink-0 flex-col rounded-xl border bg-card"
          >
            {/* Column Header */}
            <div
              className={cn(
                "flex items-center justify-between rounded-t-xl border-b px-3 py-2.5",
                column.bg,
                column.border
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("size-2 shrink-0 rounded-full", column.dotColor)} />
                <div className="min-w-0">
                  <p className={cn("text-xs font-semibold", column.textColor)}>
                    {column.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground/60">
                    {column.description}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                  column.bg,
                  column.textColor
                )}
              >
                {columnRooms.length}
              </span>
            </div>

            {/* Column Body */}
            <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
              {columnRoomsSorted.length > 0 ? (
                columnRoomsSorted.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onStatusChange={onStatusChange}
                    compact={compact}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <EmptyIcon className="size-6 text-muted-foreground/20 mb-1.5" />
                  <p className="text-[10px] text-muted-foreground/40 italic">
                    No rooms
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sort Helper ────────────────────────────────────────────────────

function sortRooms(rooms: HousekeepingRoom[]): HousekeepingRoom[] {
  return [...rooms].sort((a, b) => {
    // Priority: departing rooms first
    if (a.hasDepartureToday && !b.hasDepartureToday) return -1;
    if (!a.hasDepartureToday && b.hasDepartureToday) return 1;
    // Then VIP
    if (a.isVip && !b.isVip) return -1;
    if (!a.isVip && b.isVip) return 1;
    // Then arriving rooms
    if (a.hasArrivalToday && !b.hasArrivalToday) return -1;
    if (!a.hasArrivalToday && b.hasArrivalToday) return 1;
    // Finally by room number
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  });
}

// ── Inline SVG Icons ───────────────────────────────────────────────

function BedDoubleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636 10.5-3.819"
      />
    </svg>
  );
}

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );
}
