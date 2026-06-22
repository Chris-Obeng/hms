"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization */

import * as React from "react";
import dynamic from "next/dynamic";
import { addDays, format, parseISO, subDays } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { updateBookingStatus } from "@/app/actions/bookings";
import { NewBookingSheet } from "@/components/bookings/new-booking-sheet";
import {
  assignBookingToRoom,
  checkRoomAvailability,
  getCalendarData,
  moveBooking,
  type CalendarAvailabilityBlock,
  type CalendarBooking,
  type CalendarData,
  type CalendarRoom,
} from "./actions";
import { buildEvents, type CalendarEvent } from "./_components/calendar-events";
import { buildResources } from "./_components/calendar-resources";
import {
  CALENDAR_LEGEND,
  ROW_HEADER_WIDTH,
  ROW_HEIGHT,
  VIEW_PRESETS,
  type ViewPreset,
} from "./_components/calendar-helpers";
import { BookingDetailPanel } from "./_components/booking-detail-panel";
import { BlockRoomSheet } from "./_components/block-room-sheet";
import { UnassignedTray } from "./_components/unassigned-tray";
import "./calendar.css";

const DayPilotScheduler = dynamic(
  () => import("@daypilot/daypilot-lite-react").then((mod) => mod.DayPilotScheduler),
  { ssr: false }
) as React.ComponentType<any>;

interface CalendarClientProps {
  initialData: CalendarData;
  roomTypes: { id: string; name: string; base_price: number }[];
  hotelId: string;
  hotelName: string;
  currency: string;
  canEdit: boolean;
  canBlock: boolean;
}

interface RoomTypeFilter {
  id: string;
  name: string;
  visible: boolean;
}

const STATUS_OPTIONS = ["pending", "confirmed", "checked_in"] as const;
const SOURCE_OPTIONS = ["direct", "bookings_com", "manual", "phone", "walk_in"] as const;

function getDateRangeKey(startDate: Date, days: number): string {
  return `${format(startDate, "yyyy-MM-dd")}_${days}`;
}

export function CalendarClient({
  initialData,
  roomTypes,
  hotelId,
  currency,
  canEdit,
  canBlock,
}: CalendarClientProps) {
  const schedulerRef = React.useRef<any>(null);

  const [startDate, setStartDate] = React.useState(() => new Date());
  const [viewPreset, setViewPreset] = React.useState<ViewPreset>("2 Wks");
  const days = VIEW_PRESETS.find((preset) => preset.label === viewPreset)?.days ?? 14;

  const [rooms, setRooms] = React.useState<CalendarRoom[]>(initialData.rooms);
  const [bookings, setBookings] = React.useState<CalendarBooking[]>(initialData.bookings);
  const [availabilityBlocks, setAvailabilityBlocks] = React.useState<CalendarAvailabilityBlock[]>(
    initialData.availabilityBlocks
  );
  const [loading, setLoading] = React.useState(false);
  const [newBookingIds, setNewBookingIds] = React.useState<Set<string>>(new Set());
  const knownBookingIdsRef = React.useRef<Set<string>>(
    new Set(initialData.bookings.map((booking) => booking.id))
  );

  const [roomTypeFilters, setRoomTypeFilters] = React.useState<RoomTypeFilter[]>(
    () => roomTypes.map((roomType) => ({ id: roomType.id, name: roomType.name, visible: true }))
  );
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = React.useState<string[]>([]);
  const [showFilters, setShowFilters] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = React.useState(false);
  const [newBookingOpen, setNewBookingOpen] = React.useState(false);
  const [newBookingPrefill, setNewBookingPrefill] = React.useState<{
    roomId?: string;
    roomTypeId?: string;
    checkIn?: Date;
    checkOut?: Date;
  } | null>(null);
  const [blockRoomOpen, setBlockRoomOpen] = React.useState(false);
  const [blockPrefillRoomId, setBlockPrefillRoomId] = React.useState<string | undefined>();
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; event: CalendarEvent } | null>(null);

  const dateRangeKey = getDateRangeKey(startDate, days);
  const dateRangeRef = React.useRef({ startDate, days });
  React.useEffect(() => {
    dateRangeRef.current = { startDate, days };
  }, [days, startDate]);

  const unassignedBookings = React.useMemo(
    () => bookings.filter((booking) => !booking.roomId && booking.roomTypeId),
    [bookings]
  );

  const visibleRoomTypeIds = React.useMemo(
    () => new Set(roomTypeFilters.filter((filter) => filter.visible).map((filter) => filter.id)),
    [roomTypeFilters]
  );

  const filteredRooms = React.useMemo(
    () => rooms.filter((room) => visibleRoomTypeIds.has(room.roomTypeId)),
    [rooms, visibleRoomTypeIds]
  );

  const resources = React.useMemo(
    () => buildResources(filteredRooms, currency),
    [filteredRooms, currency]
  );
  const events = React.useMemo(
    () => buildEvents(bookings, availabilityBlocks, newBookingIds),
    [bookings, availabilityBlocks, newBookingIds]
  );

  const filteredEvents = React.useMemo(() => {
    let next = events.filter((event) => filteredRooms.some((room) => room.id === event.resource));

    if (statusFilters.length > 0) {
      next = next.filter((event) => event.isBlock || (event.status && statusFilters.includes(event.status)));
    }
    if (sourceFilters.length > 0) {
      next = next.filter((event) => event.isBlock || (event.source && sourceFilters.includes(event.source)));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      next = next.filter(
        (event) =>
          event.isBlock ||
          (event.guestName || "").toLowerCase().includes(q) ||
          (event.reference || "").toLowerCase().includes(q)
      );
    }

    return next;
  }, [events, filteredRooms, searchQuery, sourceFilters, statusFilters]);

  const selectedBooking = React.useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId]
  );

  const fetchCalendarData = React.useCallback(async (date: Date, numDays: number) => {
    setLoading(true);
    try {
      const data = await getCalendarData(format(date, "yyyy-MM-dd"), numDays);
      setRooms(data.rooms);
      setBookings(data.bookings);
      setAvailabilityBlocks(data.availabilityBlocks);
    } catch (error) {
      console.error("Failed to fetch calendar data:", error);
      toast.error("Calendar refresh failed");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchCalendarData(startDate, days);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dateRangeKey, fetchCalendarData, startDate, days]);

  React.useEffect(() => {
    const rangeChanged = dateRangeKey !== knownDateRangeKeyRef.current;
    knownDateRangeKeyRef.current = dateRangeKey;
    const current = new Set(bookings.map((booking) => booking.id));
    const added = rangeChanged ? [] : [...current].filter((id) => !knownBookingIdsRef.current.has(id));
    knownBookingIdsRef.current = current;
    if (added.length === 0) return;

    setNewBookingIds((previous) => {
      const next = new Set(previous);
      added.forEach((id) => next.add(id));
      return next;
    });

    const timer = window.setTimeout(() => {
      setNewBookingIds((previous) => {
        const next = new Set(previous);
        added.forEach((id) => next.delete(id));
        return next;
      });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [bookings, dateRangeKey]);

  const knownDateRangeKeyRef = React.useRef(dateRangeKey);

  React.useEffect(() => {
    const supabase = createClient();
    const refreshVisibleRange = () => {
      const range = dateRangeRef.current;
      fetchCalendarData(range.startDate, range.days);
    };
    const channel = supabase
      .channel(`hotel:${hotelId}:calendar`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        refreshVisibleRange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_blocks", filter: `hotel_id=eq.${hotelId}` },
        refreshVisibleRange
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCalendarData, hotelId]);

  React.useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const goToPrev = React.useCallback(() => setStartDate((previous) => subDays(previous, days)), [days]);
  const goToNext = React.useCallback(() => setStartDate((previous) => addDays(previous, days)), [days]);
  const goToToday = React.useCallback(() => {
    const today = new Date();
    setStartDate(today);
    schedulerRef.current?.control?.scrollTo(format(today, "yyyy-MM-dd"));
  }, []);

  const clearFilters = React.useCallback(() => {
    setRoomTypeFilters((previous) => previous.map((filter) => ({ ...filter, visible: true })));
    setStatusFilters([]);
    setSourceFilters([]);
    setSearchQuery("");
  }, []);

  const toggleRoomTypeFilter = React.useCallback((typeId: string) => {
    setRoomTypeFilters((previous) =>
      previous.map((filter) =>
        filter.id === typeId ? { ...filter, visible: !filter.visible } : filter
      )
    );
  }, []);

  const toggleStatusFilter = React.useCallback((status: string) => {
    setStatusFilters((previous) =>
      previous.includes(status) ? previous.filter((item) => item !== status) : [...previous, status]
    );
  }, []);

  const toggleSourceFilter = React.useCallback((source: string) => {
    setSourceFilters((previous) =>
      previous.includes(source) ? previous.filter((item) => item !== source) : [...previous, source]
    );
  }, []);

  const openBooking = React.useCallback((bookingId: string) => {
    setSelectedBookingId(bookingId);
    setDetailPanelOpen(true);
  }, []);

  const handleTimeRangeSelected = React.useCallback(
    (args: any) => {
      if (!canEdit) {
        toast.error("No permission to create bookings");
        return;
      }
      const room = filteredRooms.find((item) => item.id === String(args.resource));
      if (!room) return;

      setNewBookingPrefill({
        roomId: room.id,
        roomTypeId: room.roomTypeId,
        checkIn: parseISO(args.start.toString().split("T")[0]),
        checkOut: parseISO(args.end.toString().split("T")[0]),
      });
      setNewBookingOpen(true);
    },
    [canEdit, filteredRooms]
  );

  const handleEventClick = React.useCallback((args: { e: { data: CalendarEvent } }) => {
    const eventData = args.e.data;
    if (eventData?.bookingId) openBooking(eventData.bookingId);
  }, [openBooking]);

  const handleMoveOrResize = React.useCallback(
    async (args: any, mode: "move" | "resize") => {
      if (!canEdit) {
        toast.error("No permission to update bookings");
        fetchCalendarData(startDate, days);
        return;
      }
      const eventData = args.e.data as CalendarEvent;
      if (!eventData?.bookingId || eventData.isBlock) return;

      const booking = bookings.find((item) => item.id === eventData.bookingId);
      const newRoomId = mode === "move" ? String(args.newResource || booking?.roomId || "") : booking?.roomId || "";
      const newCheckIn = format(args.newStart as Date, "yyyy-MM-dd");
      const newCheckOut = format(args.newEnd as Date, "yyyy-MM-dd");

      if (newCheckOut <= newCheckIn) {
        toast.error("Check-out must be after check-in");
        fetchCalendarData(startDate, days);
        return;
      }

      const toastId = toast.loading(mode === "move" ? "Checking room..." : "Updating dates...");
      try {
        if (newRoomId) {
          const availability = await checkRoomAvailability(
            newRoomId,
            newCheckIn,
            newCheckOut,
            eventData.bookingId
          );
          if (!availability.available) {
            const conflict = availability.conflicts[0];
            toast.dismiss(toastId);
            toast.error(`Conflict with ${conflict.guestName || conflict.reference}`);
            fetchCalendarData(startDate, days);
            return;
          }
        }

        const result = await moveBooking(eventData.bookingId, {
          roomId: mode === "move" ? newRoomId : undefined,
          checkIn: newCheckIn,
          checkOut: newCheckOut,
        });
        toast.dismiss(toastId);
        if (result.success) {
          toast.success(mode === "move" ? "Booking moved" : "Dates updated");
        } else {
          toast.error(result.error || "Update failed");
        }
      } catch {
        toast.dismiss(toastId);
        toast.error("Update failed");
      } finally {
        fetchCalendarData(startDate, days);
      }
    },
    [bookings, canEdit, days, fetchCalendarData, startDate]
  );

  const handleAssignBooking = React.useCallback(
    async (bookingId: string) => {
      if (!canEdit) {
        toast.error("No permission to assign bookings");
        return;
      }
      const booking = bookings.find((item) => item.id === bookingId);
      if (!booking?.roomTypeId) {
        toast.error("Booking has no room type");
        return;
      }

      for (const room of rooms.filter((item) => item.roomTypeId === booking.roomTypeId && item.status === "available")) {
        const availability = await checkRoomAvailability(room.id, booking.checkIn, booking.checkOut, booking.id);
        if (!availability.available) continue;

        const result = await assignBookingToRoom(booking.id, room.id);
        if (result.success) {
          toast.success(`Assigned to room ${room.roomNumber}`);
          fetchCalendarData(startDate, days);
          return;
        }
      }
      toast.error("No available room for this booking");
    },
    [bookings, canEdit, days, fetchCalendarData, rooms, startDate]
  );

  const handleCheckIn = React.useCallback(
    async (bookingId: string) => {
      const result = await checkInBooking(bookingId);
      if (result.success) {
        toast.success("Guest checked in");
      } else {
        toast.error(result.error || "Check-in failed");
      }
      fetchCalendarData(startDate, days);
    },
    [days, fetchCalendarData, startDate]
  );

  const handleCheckOut = React.useCallback(
    async (bookingId: string) => {
      const result = await checkOutBooking(bookingId);
      if (result.success) {
        toast.success("Guest checked out");
      } else {
        toast.error(result.error || "Check-out failed");
      }
      fetchCalendarData(startDate, days);
    },
    [days, fetchCalendarData, startDate]
  );

  const handleStatusUpdate = React.useCallback(
    async (bookingId: string, status: "confirmed" | "cancelled") => {
      if (!canEdit) return;
      const result = await updateBookingStatus(bookingId, status);
      if (result.success) {
        toast.success(status === "confirmed" ? "Booking confirmed" : "Booking cancelled");
      } else {
        toast.error(result.error || "Update failed");
      }
      if (status === "cancelled") setDetailPanelOpen(false);
      fetchCalendarData(startDate, days);
    },
    [canEdit, days, fetchCalendarData, startDate]
  );

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrev();
      }
      if (event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        goToNext();
      }
      if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        goToToday();
      }
      if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setNewBookingPrefill(null);
        setNewBookingOpen(true);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [goToNext, goToPrev, goToToday]);

  const schedulerConfig = React.useMemo(() => {
    const cellWidth = days <= 3 ? 126 : days <= 7 ? 94 : days <= 14 ? 78 : 64;
    return {
      startDate: format(startDate, "yyyy-MM-dd"),
      days,
      scale: "Day" as const,
      cellWidth,
      rowHeight: ROW_HEIGHT,
      rowHeaderWidth: ROW_HEADER_WIDTH,
      eventHeight: ROW_HEIGHT - 8,
      eventMoveHandling: canEdit ? ("Update" as const) : ("Disabled" as const),
      eventResizeHandling: canEdit ? ("Update" as const) : ("Disabled" as const),
      timeRangeSelectedHandling: canEdit ? ("Enabled" as const) : ("Disabled" as const),
      allowEventOverlap: false,
      showNonBusiness: true,
      eventBarHidden: true,
      durationBarVisible: false,
      floatingEvents: true,
      floatingTimeHeaders: true,
      progressiveRowRendering: true,
      dynamicEventRendering: "Progressive" as const,
      headerHeight: 82,
      timeHeaders: [{ groupBy: "Day" as const, format: "ddd d" }],
      onBeforeCellRender: (args: any) => {
        const date = args.cell.start.toString("yyyy-MM-dd");
        const weekday = args.cell.start.toString("ddd");
        const classes = [args.cell.properties.cssClass || ""];
        if (date === format(new Date(), "yyyy-MM-dd")) classes.push("today-column");
        if (weekday === "Sat" || weekday === "Sun") classes.push("weekend-column");
        if (String(args.cell.resource).startsWith("section-")) classes.push("section-header");
        args.cell.properties.cssClass = classes.join(" ");
      },
      onBeforeTimeHeaderRender: (args: any) => {
        const date = args.header.start.toString("yyyy-MM-dd");
        const occupied = bookings.filter(
          (booking) =>
            booking.roomId &&
            booking.checkIn <= date &&
            booking.checkOut > date &&
            booking.status !== "cancelled" &&
            booking.status !== "checked_out"
        ).length;
        const occupancy = rooms.length > 0 ? Math.round((occupied / rooms.length) * 100) : 0;
        const today = date === format(new Date(), "yyyy-MM-dd");
        args.header.html = `<div class="calendar-day-header ${today ? "is-today" : ""}">
          <span class="calendar-day-week">${args.header.start.toString("ddd")}</span>
          <span class="calendar-day-number">${args.header.start.toString("d")}</span>
          <span class="calendar-day-occ">${occupancy}% occupied</span>
          <span class="calendar-day-inv">${Math.max(rooms.length - occupied, 0)} open</span>
        </div>`;
        if (today) args.header.cssClass = `${args.header.cssClass || ""} today-column`;
      },
    };
  }, [bookings, canEdit, days, rooms, startDate]);

  const filteredCount = roomTypeFilters.filter((filter) => filter.visible).length;
  const hiddenTypeCount = roomTypeFilters.length - filteredCount;
  const activeFilterCount = hiddenTypeCount + statusFilters.length + sourceFilters.length + (searchQuery ? 1 : 0);

  return (
    <div className="calendar-container relative -m-4 min-h-[calc(100vh-5rem)] bg-[#f7f8fa] p-4 pb-20">
      <div className="sticky top-0 z-30 -mx-4 -mt-4 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-2 hidden min-w-0 lg:block">
                <p className="text-sm font-semibold text-foreground">
                  {format(startDate, "MMM d")} - {format(addDays(startDate, days - 1), "MMM d, yyyy")}
                </p>
              </div>
              <div className="flex items-center rounded-lg border border-border/70 bg-background p-0.5 shadow-sm">
                <Button variant="ghost" size="icon-sm" className="size-7 rounded-md" onClick={goToPrev}>
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Popover>
                  <PopoverTrigger
                    render={<Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-md" />}
                  >
                    <CalendarDays className="size-3 mr-1" />
                    {format(startDate, "MMM yyyy")}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(date) => date && setStartDate(date)} />
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="icon-sm" className="size-7 rounded-md" onClick={goToNext}>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>

              <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/70 text-xs" onClick={goToToday}>
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8 rounded-lg text-muted-foreground"
                onClick={() => fetchCalendarData(startDate, days)}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              </Button>

              <div className="relative min-w-[240px] flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Search guest or reference"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-8 w-full rounded-lg border border-border/60 bg-background pl-8 pr-8 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 sm:w-56"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center rounded-lg border border-border/70 bg-background p-0.5 shadow-sm">
                {VIEW_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant={viewPreset === preset.label ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-7 px-3 text-xs font-medium rounded-md",
                      viewPreset === preset.label
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setViewPreset(preset.label)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-lg border-border/70 text-xs"
                onClick={() => setShowFilters(true)}
              >
                <SlidersHorizontal className="size-3.5" />
                Filter
                {activeFilterCount > 0 && <Badge className="h-4 min-w-4 rounded-full px-1 text-[9px]">{activeFilterCount}</Badge>}
              </Button>
              {canBlock && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-border/70 text-xs"
                  onClick={() => {
                    setBlockPrefillRoomId(undefined);
                    setBlockRoomOpen(true);
                  }}
                >
                  Block Room
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
                onClick={() => {
                  setNewBookingPrefill(null);
                  setNewBookingOpen(true);
                }}
              >
                <Plus className="mr-1.5 size-3.5" />
                New Booking
              </Button>
            </div>
          </div>

          <ActiveFilterChips
            roomTypeFilters={roomTypeFilters}
            statusFilters={statusFilters}
            sourceFilters={sourceFilters}
            searchQuery={searchQuery}
            onToggleRoomType={toggleRoomTypeFilter}
            onToggleStatus={toggleStatusFilter}
            onToggleSource={toggleSourceFilter}
            onClearSearch={() => setSearchQuery("")}
            onClearAll={clearFilters}
          />
        </div>
      </div>

      {showFilters && (
        <FilterPanel
          roomTypeFilters={roomTypeFilters}
          statusFilters={statusFilters}
          sourceFilters={sourceFilters}
          onClose={() => setShowFilters(false)}
          onClear={clearFilters}
          onToggleRoomType={toggleRoomTypeFilter}
          onToggleStatus={toggleStatusFilter}
          onToggleSource={toggleSourceFilter}
        />
      )}

      <UnassignedTray
        bookings={unassignedBookings}
        currency={currency}
        onAssign={handleAssignBooking}
        onViewBooking={openBooking}
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading calendar
            </div>
          </div>
        )}

        {resources.length > 0 ? (
          <DayPilotScheduler
            {...schedulerConfig}
            ref={schedulerRef}
            resources={resources}
            events={filteredEvents}
            onEventClick={handleEventClick}
            onTimeRangeSelected={handleTimeRangeSelected}
            onEventMoved={(args: any) => handleMoveOrResize(args, "move")}
            onEventResized={(args: any) => handleMoveOrResize(args, "resize")}
            onEventRightClick={(args: any) => {
              args.preventDefault();
              const event = args.e.data as CalendarEvent;
              if (event?.bookingId && !event.isBlock) {
                setContextMenu({
                  x: args.div.getBoundingClientRect().left,
                  y: args.div.getBoundingClientRect().bottom + window.scrollY,
                  event,
                });
              }
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <CalendarDays className="mb-3 size-10 text-muted-foreground/30" />
            <h3 className="text-sm font-medium text-foreground">No rooms available</h3>
            <p className="mt-1 max-w-[280px] text-xs text-muted-foreground/70">
              Add room types and rooms to start managing your property.
            </p>
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-44 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <MenuButton onClick={() => openBooking(contextMenu.event.bookingId!)}>View Details</MenuButton>
          {contextMenu.event.status === "pending" && (
            <MenuButton onClick={() => handleStatusUpdate(contextMenu.event.bookingId!, "confirmed")}>
              Confirm Booking
            </MenuButton>
          )}
          {contextMenu.event.status === "confirmed" && (
            <MenuButton onClick={() => handleCheckIn(contextMenu.event.bookingId!)}>Check In</MenuButton>
          )}
          {contextMenu.event.status === "checked_in" && (
            <MenuButton onClick={() => handleCheckOut(contextMenu.event.bookingId!)}>Check Out</MenuButton>
          )}
          {canEdit && (
            <>
              <div className="my-1 h-px bg-border" />
              <MenuButton destructive onClick={() => handleStatusUpdate(contextMenu.event.bookingId!, "cancelled")}>
                Cancel Booking
              </MenuButton>
            </>
          )}
        </div>
      )}

      <BookingDetailPanel
        booking={selectedBooking}
        open={detailPanelOpen}
        onClose={() => {
          setDetailPanelOpen(false);
          setSelectedBookingId(null);
        }}
        currency={currency}
        canEdit={canEdit}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onCancel={(bookingId) => handleStatusUpdate(bookingId, "cancelled")}
        onReinstate={(bookingId) => handleStatusUpdate(bookingId, "confirmed")}
        onAssign={handleAssignBooking}
        onConfirm={(bookingId) => handleStatusUpdate(bookingId, "confirmed")}
        onBlockRoom={(roomId) => {
          setBlockPrefillRoomId(roomId);
          setBlockRoomOpen(true);
        }}
      />

      <BlockRoomSheet
        open={blockRoomOpen}
        onOpenChange={setBlockRoomOpen}
        rooms={rooms}
        prefillRoomId={blockPrefillRoomId}
        onSuccess={() => fetchCalendarData(startDate, days)}
      />

      <NewBookingSheet
        open={newBookingOpen}
        onOpenChange={(open) => {
          setNewBookingOpen(open);
          if (!open) {
            setNewBookingPrefill(null);
            fetchCalendarData(startDate, days);
          }
        }}
        roomTypes={roomTypes}
        currency={currency}
        prefillRoomTypeId={newBookingPrefill?.roomTypeId}
        prefillCheckIn={newBookingPrefill?.checkIn}
        prefillCheckOut={newBookingPrefill?.checkOut}
      />
    </div>
  );
}

function ActiveFilterChips({
  roomTypeFilters,
  statusFilters,
  sourceFilters,
  searchQuery,
  onToggleRoomType,
  onToggleStatus,
  onToggleSource,
  onClearSearch,
  onClearAll,
}: {
  roomTypeFilters: RoomTypeFilter[];
  statusFilters: string[];
  sourceFilters: string[];
  searchQuery: string;
  onToggleRoomType: (id: string) => void;
  onToggleStatus: (status: string) => void;
  onToggleSource: (source: string) => void;
  onClearSearch: () => void;
  onClearAll: () => void;
}) {
  const hiddenTypes = roomTypeFilters.filter((filter) => !filter.visible);
  const hasFilters = hiddenTypes.length > 0 || statusFilters.length > 0 || sourceFilters.length > 0 || !!searchQuery;
  if (!hasFilters) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {CALENDAR_LEGEND.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hiddenTypes.map((filter) => (
        <Chip key={filter.id} label={`Room type: ${filter.name}`} onClick={() => onToggleRoomType(filter.id)} />
      ))}
      {statusFilters.map((status) => (
        <Chip key={status} label={`Status: ${status.replace(/_/g, " ")}`} onClick={() => onToggleStatus(status)} />
      ))}
      {sourceFilters.map((source) => (
        <Chip key={source} label={`Source: ${source.replace(/_/g, " ")}`} onClick={() => onToggleSource(source)} />
      ))}
      {searchQuery && <Chip label={`Search: ${searchQuery}`} onClick={onClearSearch} />}
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 max-w-[240px] items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 text-[11px] font-medium text-muted-foreground"
    >
      <span className="truncate capitalize">{label}</span>
      <X className="size-3 shrink-0" />
    </button>
  );
}

function FilterPanel({
  roomTypeFilters,
  statusFilters,
  sourceFilters,
  onClose,
  onClear,
  onToggleRoomType,
  onToggleStatus,
  onToggleSource,
}: {
  roomTypeFilters: RoomTypeFilter[];
  statusFilters: string[];
  sourceFilters: string[];
  onClose: () => void;
  onClear: () => void;
  onToggleRoomType: (id: string) => void;
  onToggleStatus: (status: string) => void;
  onToggleSource: (source: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close filters"
      />
      <aside className="absolute right-0 top-0 h-full w-[min(460px,100vw)] overflow-y-auto border-l border-border bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Filter By</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Turn filters on or off and select filter values.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-6 flex gap-3 text-sm font-semibold text-blue-600">
          <button type="button" onClick={onClear}>
            Reset All
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <FilterGroup title="Room Types">
            {roomTypeFilters.map((filter) => (
              <FilterToggle
                key={filter.id}
                label={filter.name}
                active={filter.visible}
                onClick={() => onToggleRoomType(filter.id)}
              />
            ))}
          </FilterGroup>
          <FilterGroup title="Status">
            {STATUS_OPTIONS.map((status) => (
              <FilterToggle
                key={status}
                label={status.replace(/_/g, " ")}
                active={statusFilters.includes(status)}
                onClick={() => onToggleStatus(status)}
              />
            ))}
          </FilterGroup>
          <FilterGroup title="Source">
            {SOURCE_OPTIONS.map((source) => (
              <FilterToggle
                key={source}
                label={source.replace(/_/g, " ")}
                active={sourceFilters.includes(source)}
                onClick={() => onToggleSource(source)}
              />
            ))}
          </FilterGroup>
        </div>
      </aside>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function FilterToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/60 bg-background px-3 py-2 text-left capitalize hover:bg-muted/30"
    >
      <span className="text-sm font-medium">{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          active ? "bg-teal-500" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            active ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}

function MenuButton({
  children,
  destructive,
  onClick,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full rounded-sm px-2 py-1.5 text-left text-xs font-medium outline-none hover:bg-accent hover:text-accent-foreground",
        destructive && "text-destructive"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
