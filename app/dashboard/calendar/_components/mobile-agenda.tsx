"use client";

import * as React from "react";
import { addDays, format, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CalendarAvailabilityBlock,
  CalendarBooking,
  CalendarRoom,
} from "../actions";
import { isManualLikeSource } from "./calendar-helpers";

interface MobileAgendaProps {
  rooms: CalendarRoom[];
  bookings: CalendarBooking[];
  blocks: CalendarAvailabilityBlock[];
  canEdit: boolean;
  onSelectBooking: (bookingId: string) => void;
  onNewBooking: (prefill: { roomId: string; roomTypeId: string; date: Date }) => void;
}

const DAY_WINDOW = 7;

export function MobileAgenda({
  rooms,
  bookings,
  blocks,
  canEdit,
  onSelectBooking,
  onNewBooking,
}: MobileAgendaProps) {
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );

  const days = React.useMemo(
    () => Array.from({ length: DAY_WINDOW }, (_, i) => addDays(anchor, i)),
    [anchor],
  );

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const dayData = React.useMemo(() => {
    const date = selectedDate;
    const overnightBookings = bookings.filter(
      (b) => b.status !== "cancelled" && b.checkIn <= date && b.checkOut > date,
    );
    const arrivals = bookings.filter(
      (b) => b.status !== "cancelled" && b.checkIn === date,
    );
    const departures = bookings.filter(
      (b) => b.status !== "cancelled" && b.checkOut === date,
    );
    const blocksToday = blocks.filter(
      (bl) => bl.startDate <= date && bl.endDate > date,
    );

    const occupiedRoomIds = new Set(
      overnightBookings.map((b) => b.roomId).filter(Boolean),
    );
    const blockedRoomIds = new Set(blocksToday.map((b) => b.roomId));

    const vacant = rooms.filter(
      (r) =>
        !["maintenance", "out_of_service"].includes(r.status) &&
        !occupiedRoomIds.has(r.id) &&
        !blockedRoomIds.has(r.id),
    );

    return { overnightBookings, arrivals, departures, blocksToday, vacant };
  }, [selectedDate, bookings, blocks, rooms]);

  const occupancy = rooms.length
    ? Math.round(
        (dayData.overnightBookings.filter((b) => b.roomId).length / rooms.length) * 100,
      )
    : 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Day strip */}
      <div className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="flex items-center gap-1 px-3 pt-2">
          <button
            onClick={() => setAnchor((d) => subDays(d, DAY_WINDOW))}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md text-muted-foreground active:bg-muted"
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="grid grid-cols-7 flex-1 gap-1">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const isToday = key === todayStr;
              const isSelected = key === selectedDate;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  className={cn(
                    "flex flex-col items-center rounded-lg py-1.5 transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground active:bg-muted",
                  )}
                >
                  <span className="text-[10px] font-medium uppercase leading-none">
                    {format(day, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "mt-1 text-sm font-semibold leading-none tabular-nums",
                      isSelected && "text-primary-foreground",
                      isToday && !isSelected && "text-primary",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setAnchor((d) => addDays(d, DAY_WINDOW))}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md text-muted-foreground active:bg-muted"
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Day summary */}
        <div className="flex items-center justify-between px-4 py-2">
          <p className="text-sm font-semibold text-foreground">
            {format(parseISO(selectedDate), "EEEE, MMM d")}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span>{occupancy}% occ</span>
            <span>{dayData.arrivals.length} in</span>
            <span>{dayData.departures.length} out</span>
          </div>
        </div>
      </div>

      {/* Day content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {dayData.overnightBookings.length > 0 && (
          <Section title="Staying" count={dayData.overnightBookings.length}>
            {dayData.overnightBookings.map((b) => (
              <BookingCard key={b.id} booking={b} onSelect={onSelectBooking} />
            ))}
          </Section>
        )}

        {dayData.blocksToday.length > 0 && (
          <Section title="Blocked" count={dayData.blocksToday.length}>
            {dayData.blocksToday.map((bl) => (
              <BlockCard key={bl.id} block={bl} rooms={rooms} />
            ))}
          </Section>
        )}

        <Section title="Vacant" count={dayData.vacant.length}>
          {dayData.vacant.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              Fully committed for this date.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 px-4">
              {dayData.vacant.map((room) => (
                <button
                  key={room.id}
                  disabled={!canEdit}
                  onClick={() =>
                    onNewBooking({
                      roomId: room.id,
                      roomTypeId: room.roomTypeId,
                      date: parseISO(selectedDate),
                    })
                  }
                  className={cn(
                    "flex flex-col items-start rounded-lg border border-border bg-card p-3 text-left transition-colors",
                    canEdit ? "active:bg-muted" : "opacity-60",
                  )}
                >
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {room.roomNumber}
                  </span>
                  <span className="mt-0.5 text-[11px] text-muted-foreground">
                    {room.roomTypeName}
                  </span>
                  {canEdit && (
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                      <Plus className="size-3" />
                      Book
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-4">
      <header className="mb-2 flex items-baseline justify-between px-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </header>
      {children}
    </section>
  );
}

function BookingCard({
  booking,
  onSelect,
}: {
  booking: CalendarBooking;
  onSelect: (id: string) => void;
}) {
  const color = getBarColor(booking.status, booking.source);
  return (
    <button
      onClick={() => onSelect(booking.id)}
      className="mx-4 mb-2 flex w-[calc(100%-32px)] items-stretch overflow-hidden rounded-lg border border-border bg-card text-left active:bg-muted"
    >
      <span className="w-1 shrink-0" style={{ background: color }} />
      <span className="min-w-0 flex-1 px-3 py-2.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {booking.guestName || "Guest"}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {booking.roomNumber ? `Rm ${booking.roomNumber}` : "Unassigned"}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="capitalize">{booking.status.replace(/_/g, " ")}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {format(parseISO(booking.checkIn), "MMM d")} →{" "}
            {format(parseISO(booking.checkOut), "MMM d")}
          </span>
        </span>
      </span>
    </button>
  );
}

function BlockCard({
  block,
  rooms,
}: {
  block: CalendarAvailabilityBlock;
  rooms: CalendarRoom[];
}) {
  const room = rooms.find((r) => r.id === block.roomId);
  return (
    <div className="mx-4 mb-2 flex items-stretch overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
      <span className="w-1 shrink-0 bg-muted-foreground/40" />
      <div className="flex-1 px-3 py-2.5">
        <p className="text-sm font-medium capitalize text-foreground">
          {(block.reason || "Blocked").replace(/_/g, " ")}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {room ? `Room ${room.roomNumber}` : "Room"}
          {" · "}
          <span className="tabular-nums">
            {format(parseISO(block.startDate), "MMM d")} →{" "}
            {format(parseISO(block.endDate), "MMM d")}
          </span>
        </p>
      </div>
    </div>
  );
}

function getBarColor(status: string, source: string | null): string {
  if (status === "checked_in") return "#16A34A";
  if (status === "pending") return "#7C3AED";
  if (status === "checked_out" || status === "cancelled") return "#94A3B8";
  if (isManualLikeSource(source)) return "#2FAA67";
  return "#16A7D8";
}
