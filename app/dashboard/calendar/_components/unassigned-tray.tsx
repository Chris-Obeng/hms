"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Moon,
  Search,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyCompact, getNights } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CalendarBooking } from "../actions";

interface UnassignedTrayProps {
  bookings: CalendarBooking[];
  currency?: string;
  onAssign: (bookingId: string) => void;
  onViewBooking: (bookingId: string) => void;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "confirmed":
      return "text-sky-700 bg-sky-50 border-sky-200";
    case "checked_in":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "pending":
      return "text-violet-700 bg-violet-50 border-violet-200";
    default:
      return "text-muted-foreground bg-muted/40 border-border";
  }
}

function isDue(checkInStr: string): boolean {
  return checkInStr <= new Date().toISOString().split("T")[0];
}

export function UnassignedTray({
  bookings,
  currency = "GHS",
  onAssign,
  onViewBooking,
}: UnassignedTrayProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const q = searchQuery.toLowerCase();
    return bookings.filter(
      (b) =>
        (b.guestName || "").toLowerCase().includes(q) ||
        b.reference.toLowerCase().includes(q) ||
        (b.roomTypeName || "").toLowerCase().includes(q)
    );
  }, [bookings, searchQuery]);

  const urgentCount = bookings.filter((booking) => isDue(booking.checkIn)).length;

  return (
    <div className="fixed bottom-0 right-6 z-40 w-[min(420px,calc(100vw-24px))]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "ml-auto flex h-10 w-full items-center justify-between rounded-t-lg border border-border/70 bg-background px-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] transition-colors",
          expanded && "border-b-transparent"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <BedDouble className="size-4 text-slate-600" />
          <span className="truncate text-sm font-semibold text-foreground">
            Unassigned
          </span>
          <Badge className="h-5 min-w-5 rounded-full bg-slate-900 px-1.5 text-[10px] font-bold text-white tabular-nums hover:bg-slate-900">
            {bookings.length}
          </Badge>
          {urgentCount > 0 && (
            <span className="hidden rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive sm:inline">
              {urgentCount} due
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="size-4 text-muted-foreground" />
        )}
      </button>

      <div
        className={cn(
          "overflow-hidden rounded-t-none border-x border-border/70 bg-background shadow-[0_-18px_42px_rgba(15,23,42,0.12)] transition-[max-height,opacity] duration-200",
          expanded ? "max-h-[390px] border-t opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="border-b border-border/50 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search unassigned bookings"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 w-full rounded-lg border border-border/60 bg-muted/20 pl-9 pr-9 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[292px] overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((booking) => {
              const nights = getNights(booking.checkIn, booking.checkOut, booking.nights);
              const due = isDue(booking.checkIn);

              return (
                <div
                  key={booking.id}
                  className={cn(
                    "grid grid-cols-[1fr_auto] gap-3 border-b border-border/40 px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/30",
                    due && "bg-slate-50 hover:bg-slate-100/70"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onViewBooking(booking.id)}
                    className="min-w-0 text-left"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <User className="size-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="truncate text-sm font-semibold text-foreground">
                        {booking.guestName || "Unknown guest"}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize",
                          getStatusColor(booking.status)
                        )}
                      >
                        {booking.status.replace(/_/g, " ")}
                      </span>
                      {due && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <AlertCircle className="size-2.5" />
                          Due
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{booking.reference}</span>
                      <span>{booking.roomTypeName || "No room type"}</span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {format(parseISO(booking.checkIn), "MMM d")} to{" "}
                        {format(parseISO(booking.checkOut), "MMM d")}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Moon className="size-3" />
                        {nights}
                      </span>
                      <span className="font-medium">
                        {formatCurrencyCompact(booking.totalAmount, currency)}
                      </span>
                    </div>
                  </button>

                  <Button
                    size="sm"
                    className="self-center rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
                    onClick={() => onAssign(booking.id)}
                    disabled={bookings.length === 0}
                  >
                    Assign
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No unassigned bookings match search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
