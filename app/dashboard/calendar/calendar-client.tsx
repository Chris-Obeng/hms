"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization */

import * as React from "react";
import dynamic from "next/dynamic";
import { addDays, format, parseISO, subDays } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { qk } from "@/lib/query-keys";
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
  isManualLikeSource,
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
  () =>
    import("@daypilot/daypilot-lite-react").then(
      (mod) => mod.DayPilotScheduler,
    ),
  { ssr: false },
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
const SOURCE_OPTIONS = [
  "direct",
  "bookings_com",
  "manual",
  "phone",
  "walk_in",
] as const;

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
  const queryClient = useQueryClient();
  const { orgId } = useAuth();
  const schedulerRef = React.useRef<any>(null);

  const [startDate, setStartDate] = React.useState(() => new Date());
  const [viewPreset, setViewPreset] = React.useState<ViewPreset>("2 Wks");
  const days =
    VIEW_PRESETS.find((preset) => preset.label === viewPreset)?.days ?? 14;

  const [newBookingIds, setNewBookingIds] = React.useState<Set<string>>(
    new Set(),
  );
  const knownBookingIdsRef = React.useRef<Set<string>>(
    new Set(initialData.bookings.map((booking) => booking.id)),
  );

  const dateStr = format(startDate, "yyyy-MM-dd");

  // ── Main calendar data query ──────────────────────────────────────
  const { data: calendarData, isLoading: loading } = useQuery({
    queryKey: qk.calendar(orgId || "", hotelId, dateStr, days),
    queryFn: () => getCalendarData(dateStr, days),
    enabled: !!orgId,
    initialData: initialData,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const rooms = calendarData?.rooms ?? initialData.rooms;
  const bookings = calendarData?.bookings ?? initialData.bookings;
  const availabilityBlocks = calendarData?.availabilityBlocks ?? initialData.availabilityBlocks;

  const [roomTypeFilters, setRoomTypeFilters] = React.useState<
    RoomTypeFilter[]
  >(() =>
    roomTypes.map((roomType) => ({
      id: roomType.id,
      name: roomType.name,
      visible: true,
    })),
  );
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = React.useState<string[]>([]);
  const [showFilters, setShowFilters] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const [selectedBookingId, setSelectedBookingId] = React.useState<
    string | null
  >(null);
  const [detailPanelOpen, setDetailPanelOpen] = React.useState(false);
  const [newBookingOpen, setNewBookingOpen] = React.useState(false);
  const [newBookingPrefill, setNewBookingPrefill] = React.useState<{
    roomId?: string;
    roomTypeId?: string;
    checkIn?: Date;
    checkOut?: Date;
  } | null>(null);
  const [blockRoomOpen, setBlockRoomOpen] = React.useState(false);
  const [blockPrefillRoomId, setBlockPrefillRoomId] = React.useState<
    string | undefined
  >();
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    event: CalendarEvent;
  } | null>(null);
  const [hoveredEvent, setHoveredEvent] = React.useState<{
    x: number;
    y: number;
    event: CalendarEvent;
  } | null>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const dateRangeKey = getDateRangeKey(startDate, days);


  const unassignedBookings = React.useMemo(
    () => bookings.filter((booking) => !booking.roomId && booking.roomTypeId),
    [bookings],
  );

  const visibleRoomTypeIds = React.useMemo(
    () =>
      new Set(
        roomTypeFilters
          .filter((filter) => filter.visible)
          .map((filter) => filter.id),
      ),
    [roomTypeFilters],
  );

  const filteredRooms = React.useMemo(
    () => rooms.filter((room) => visibleRoomTypeIds.has(room.roomTypeId)),
    [rooms, visibleRoomTypeIds],
  );

  const resources = React.useMemo(
    () => buildResources(filteredRooms, currency),
    [filteredRooms, currency],
  );
  const events = React.useMemo(
    () => buildEvents(bookings, availabilityBlocks, newBookingIds),
    [bookings, availabilityBlocks, newBookingIds],
  );

  const filteredEvents = React.useMemo(() => {
    let next = events.filter((event) =>
      filteredRooms.some((room) => room.id === event.resource),
    );

    if (statusFilters.length > 0) {
      next = next.filter(
        (event) =>
          event.isBlock ||
          (event.status && statusFilters.includes(event.status)),
      );
    }
    if (sourceFilters.length > 0) {
      next = next.filter(
        (event) =>
          event.isBlock ||
          (event.source && sourceFilters.includes(event.source)),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      next = next.filter(
        (event) =>
          event.isBlock ||
          (event.guestName || "").toLowerCase().includes(q) ||
          (event.reference || "").toLowerCase().includes(q),
      );
    }

    return next;
  }, [events, filteredRooms, searchQuery, sourceFilters, statusFilters]);

  const selectedBooking = React.useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId],
  );

  // ── Ref for new-booking highlight animation ───────────────────────
  const knownDateRangeKeyRef = React.useRef(dateRangeKey);

  React.useEffect(() => {
    const rangeChanged = dateRangeKey !== knownDateRangeKeyRef.current;
    knownDateRangeKeyRef.current = dateRangeKey;
    const current = new Set(bookings.map((booking) => booking.id));
    const added = rangeChanged
      ? []
      : [...current].filter((id) => !knownBookingIdsRef.current.has(id));
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

  // ── Realtime subscription → invalidate React Query cache ────────────
  React.useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    const invalidate = () => {
      queryClient.invalidateQueries({
        queryKey: ["calendar", orgId, hotelId],
      });
    };
    const channel = supabase
      .channel(`hotel:${hotelId}:calendar`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `hotel_id=eq.${hotelId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "availability_blocks",
          filter: `hotel_id=eq.${hotelId}`,
        },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient]);

  // Helper: invalidate current calendar query after a mutation
  const invalidateCalendar = React.useCallback(() => {
    if (!orgId) return;
    queryClient.invalidateQueries({
      queryKey: ["calendar", orgId, hotelId],
    });
  }, [orgId, hotelId, queryClient]);

  // Kept for scheduler scroll-to behaviour; no longer used for data fetching
  const fetchCalendarData = React.useCallback(
    (_date: Date, _numDays: number) => {
      invalidateCalendar();
    },
    [invalidateCalendar],
  );

  React.useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // DayPilot doesn't auto-detect flex container size on first mount.
  // Calling update() after layout resolves forces grid cell recalculation,
  // fixing the blank right-panel issue when rendered inside overflow:hidden flex containers.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      schedulerRef.current?.control?.update();
    }, 50);
    return () => window.clearTimeout(timer);
  }, []);

  const goToPrev = React.useCallback(
    () => setStartDate((previous) => subDays(previous, days)),
    [days],
  );
  const goToNext = React.useCallback(
    () => setStartDate((previous) => addDays(previous, days)),
    [days],
  );
  const goToToday = React.useCallback(() => {
    const today = new Date();
    setStartDate(today);
    schedulerRef.current?.control?.scrollTo(format(today, "yyyy-MM-dd"));
  }, []);

  const clearFilters = React.useCallback(() => {
    setRoomTypeFilters((previous) =>
      previous.map((filter) => ({ ...filter, visible: true })),
    );
    setStatusFilters([]);
    setSourceFilters([]);
    setSearchQuery("");
  }, []);

  const toggleRoomTypeFilter = React.useCallback((typeId: string) => {
    setRoomTypeFilters((previous) =>
      previous.map((filter) =>
        filter.id === typeId ? { ...filter, visible: !filter.visible } : filter,
      ),
    );
  }, []);

  const toggleStatusFilter = React.useCallback((status: string) => {
    setStatusFilters((previous) =>
      previous.includes(status)
        ? previous.filter((item) => item !== status)
        : [...previous, status],
    );
  }, []);

  const toggleSourceFilter = React.useCallback((source: string) => {
    setSourceFilters((previous) =>
      previous.includes(source)
        ? previous.filter((item) => item !== source)
        : [...previous, source],
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
      const room = filteredRooms.find(
        (item) => item.id === String(args.resource),
      );
      if (!room) return;

      setNewBookingPrefill({
        roomId: room.id,
        roomTypeId: room.roomTypeId,
        checkIn: parseISO(args.start.toString().split("T")[0]),
        checkOut: parseISO(args.end.toString().split("T")[0]),
      });
      setNewBookingOpen(true);
    },
    [canEdit, filteredRooms],
  );

  const handleEventClick = React.useCallback(
    (args: { e: { data: CalendarEvent } }) => {
      const eventData = args.e.data;
      if (eventData?.bookingId) openBooking(eventData.bookingId);
    },
    [openBooking],
  );

  const handleEventHover = React.useCallback((args: any) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    const eventData = args.e.data as CalendarEvent;
    if (!eventData?.bookingId || eventData.isBlock) return;

    hoverTimeoutRef.current = setTimeout(() => {
      const rect = args.div.getBoundingClientRect();
      setHoveredEvent({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        event: eventData,
      });
    }, 400);
  }, []);

  const handleEventHoverEnd = React.useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredEvent(null);
  }, []);

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
      const newRoomId =
        mode === "move"
          ? String(args.newResource || booking?.roomId || "")
          : booking?.roomId || "";
      const newCheckIn = format(args.newStart as Date, "yyyy-MM-dd");
      const newCheckOut = format(args.newEnd as Date, "yyyy-MM-dd");

      if (newCheckOut <= newCheckIn) {
        toast.error("Check-out must be after check-in");
        fetchCalendarData(startDate, days);
        return;
      }

      // Optimistic update setup
      const queryKey = qk.calendar(orgId || "", hotelId, dateStr, days);
      const previousData = queryClient.getQueryData<CalendarData>(queryKey);
      const targetRoom = rooms.find((r) => r.id === newRoomId);

      if (previousData) {
        const updatedBookings = previousData.bookings.map((b) => {
          if (b.id === eventData.bookingId) {
            return {
              ...b,
              roomId: newRoomId || b.roomId,
              roomNumber: targetRoom ? targetRoom.roomNumber : b.roomNumber,
              checkIn: newCheckIn,
              checkOut: newCheckOut,
              nights: Math.round(
                (new Date(newCheckOut).getTime() - new Date(newCheckIn).getTime()) /
                  (1000 * 60 * 60 * 24),
              ) || 1,
            };
          }
          return b;
        });

        queryClient.setQueryData<CalendarData>(queryKey, {
          ...previousData,
          bookings: updatedBookings,
        });
      }

      const toastId = toast.loading(
        mode === "move" ? "Checking room..." : "Updating dates...",
      );
      try {
        if (newRoomId) {
          const availability = await checkRoomAvailability(
            newRoomId,
            newCheckIn,
            newCheckOut,
            eventData.bookingId,
          );
          if (!availability.available) {
            const conflict = availability.conflicts[0];
            throw new Error(`Conflict with ${conflict.guestName || conflict.reference}`);
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
          throw new Error(result.error || "Update failed");
        }
      } catch (err: any) {
        toast.dismiss(toastId);
        // Rollback
        if (previousData) {
          queryClient.setQueryData<CalendarData>(queryKey, previousData);
        }
        toast.error(err.message || "Update failed");
      } finally {
        fetchCalendarData(startDate, days);
      }
    },
    [bookings, canEdit, days, fetchCalendarData, startDate, orgId, hotelId, dateStr, queryClient, rooms],
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

      for (const room of rooms.filter(
        (item) =>
          item.roomTypeId === booking.roomTypeId && item.status === "available",
      )) {
        const availability = await checkRoomAvailability(
          room.id,
          booking.checkIn,
          booking.checkOut,
          booking.id,
        );
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
    [bookings, canEdit, days, fetchCalendarData, rooms, startDate],
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
    [days, fetchCalendarData, startDate],
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
    [days, fetchCalendarData, startDate],
  );

  const handleStatusUpdate = React.useCallback(
    async (bookingId: string, status: "confirmed" | "cancelled") => {
      if (!canEdit) return;
      const result = await updateBookingStatus(bookingId, status);
      if (result.success) {
        toast.success(
          status === "confirmed" ? "Booking confirmed" : "Booking cancelled",
        );
      } else {
        toast.error(result.error || "Update failed");
      }
      if (status === "cancelled") setDetailPanelOpen(false);
      fetchCalendarData(startDate, days);
    },
    [canEdit, days, fetchCalendarData, startDate],
  );

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
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

  const bookingsRef = React.useRef(bookings);
  const roomsRef = React.useRef(rooms);
  const eventsRef = React.useRef(events);
  const filteredEventsRef = React.useRef(filteredEvents);
  React.useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);
  React.useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);
  React.useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  React.useEffect(() => {
    filteredEventsRef.current = filteredEvents;
  }, [filteredEvents]);

  const schedulerConfig = React.useMemo(() => {
    const cellWidth = 48; // Fixed 48px per spec
    return {
      startDate: format(startDate, "yyyy-MM-dd"),
      days,
      scale: "Day" as const,
      cellWidth,
      rowHeight: ROW_HEIGHT,
      rowHeaderWidth: ROW_HEADER_WIDTH,
      eventHeight: ROW_HEIGHT - 6,
      height: "100%",
      heightSpec: "Parent100Pct" as const,
      eventMoveHandling: canEdit ? ("Update" as const) : ("Disabled" as const),
      eventResizeHandling: canEdit
        ? ("Update" as const)
        : ("Disabled" as const),
      timeRangeSelectedHandling: canEdit
        ? ("Enabled" as const)
        : ("Disabled" as const),
      allowEventOverlap: false,
      showNonBusiness: true,
      eventBarHidden: true,
      durationBarVisible: false,
      floatingEvents: true,
      floatingTimeHeaders: false,
      headerHeight: 56,
      timeHeaders: [{ groupBy: "Day" as const, format: "ddd d" }],
      onEventMoving: (args: any) => {
        const startStr = args.start.toString("yyyy-MM-dd");
        const endStr = args.end.toString("yyyy-MM-dd");
        const resourceId = args.resource;
        const eventId = args.e.id();

        // 1. Prevent placement in type headers
        if (resourceId.startsWith("section-")) {
          args.allowed = false;
          args.right.html = "Invalid Room Row";
          return;
        }

        // 2. Prevent dragging to start in the past unless walk-in/manual/phone or checked-in
        const todayStr = format(new Date(), "yyyy-MM-dd");
        if (startStr < todayStr) {
          const booking = bookingsRef.current.find(b => `booking-${b.id}` === eventId);
          const isAllowedPast = booking && (isManualLikeSource(booking.source) || booking.status === "checked_in");
          if (!isAllowedPast) {
            args.allowed = false;
            args.right.html = "Cannot start in the past";
            return;
          }
        }

        // 3. Room type compatibility
        const booking = bookingsRef.current.find(b => `booking-${b.id}` === eventId);
        const targetRoom = roomsRef.current.find(r => r.id === resourceId);
        if (booking && targetRoom && booking.roomTypeId !== targetRoom.roomTypeId) {
          args.allowed = false;
          args.right.html = "Room type mismatch";
          return;
        }

        // 4. Overlap checks against the UNFILTERED events array
        const hasOverlap = eventsRef.current.some(evt => {
          if (evt.id === eventId) return false;
          if (evt.resource !== resourceId) return false;
          return evt.start < endStr && evt.end > startStr;
        });

        if (hasOverlap) {
          args.allowed = false;
          args.right.html = "Room occupied / blocked";
        }
      },
      onEventResizing: (args: any) => {
        const startStr = args.start.toString("yyyy-MM-dd");
        const endStr = args.end.toString("yyyy-MM-dd");
        const resourceId = args.e.resource();
        const eventId = args.e.id();

        // Prevent resizing to start in the past unless allowed (walk-in/manual/phone or checked-in)
        const todayStr = format(new Date(), "yyyy-MM-dd");
        if (startStr < todayStr) {
          const booking = bookingsRef.current.find(b => `booking-${b.id}` === eventId);
          const isAllowedPast = booking && (isManualLikeSource(booking.source) || booking.status === "checked_in");
          if (!isAllowedPast) {
            args.allowed = false;
            args.right.html = "Cannot start in the past";
            return;
          }
        }

        // Overlap checks against the UNFILTERED events array
        const hasOverlap = eventsRef.current.some(evt => {
          if (evt.id === eventId) return false;
          if (evt.resource !== resourceId) return false;
          return evt.start < endStr && evt.end > startStr;
        });

        if (hasOverlap) {
          args.allowed = false;
          args.right.html = "Overlap conflict";
        }
      },
      onBeforeCellRender: (args: any) => {
        const date = args.cell.start.toString("yyyy-MM-dd");
        const weekday = args.cell.start.toString("ddd");
        const classes = [args.cell.properties.cssClass || ""];
        if (date === format(new Date(), "yyyy-MM-dd"))
          classes.push("today-col");
        if (weekday === "Sat" || weekday === "Sun") classes.push("weekend-col");
        if (String(args.cell.resource).startsWith("section-"))
          classes.push("cal-section-row");
        args.cell.properties.cssClass = classes.join(" ");
      },
      onBeforeTimeHeaderRender: (args: any) => {
        const date = args.header.start.toString("yyyy-MM-dd");
        const occupied = bookingsRef.current.filter(
          (booking) =>
            booking.roomId &&
            booking.checkIn <= date &&
            booking.checkOut > date &&
            booking.status !== "cancelled" &&
            booking.status !== "checked_out",
        ).length;
        const totalRooms = roomsRef.current.filter(
          (r) =>
            !r.status?.includes("maintenance") &&
            !r.status?.includes("out_of_service"),
        ).length;
        const occupancy =
          totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
        const today = date === format(new Date(), "yyyy-MM-dd");

        // Color-coded dot: green ≥70%, amber 40–69%, red <40%, gray 0%
        let dotClass = "gray";
        if (occupancy >= 70) dotClass = "green";
        else if (occupancy >= 40) dotClass = "amber";
        else if (occupancy > 0) dotClass = "red";

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        // getDayOfWeek() is the correct DayPilotDate API (not native Date.getDay())
        const dayIndex = args.header.start.getDayOfWeek();

        args.header.html = `<div class="cal-day-hdr${today ? " is-today" : ""}">
          <span class="cal-day-dow">${dayNames[dayIndex] || "Sun"}</span>
          <span class="cal-day-num">${args.header.start.toString("d")}</span>
          <div class="cal-day-occ-wrap">
            <span class="cal-day-occ-dot ${dotClass}"></span>
            <span class="cal-day-occ">${occupancy}%</span>
          </div>
        </div>`;
        if (today)
          args.header.properties = {
            ...args.header.properties,
            cssClass: `${args.header.properties?.cssClass || ""} today-col`,
          };
      },
    };
  }, [canEdit, days, startDate]);

  const filteredCount = roomTypeFilters.filter(
    (filter) => filter.visible,
  ).length;
  const hiddenTypeCount = roomTypeFilters.length - filteredCount;
  const activeFilterCount =
    hiddenTypeCount +
    statusFilters.length +
    sourceFilters.length +
    (searchQuery ? 1 : 0);

  return (
    <div className="cal-wrap flex flex-col h-[calc(100vh-3rem)] bg-background overflow-hidden min-h-0">
      {/* ── Desktop Toolbar ── */}
      <div className="hidden md:flex items-center gap-2 px-3 py-2 border-b border-border bg-background sticky top-12 z-30 min-h-[44px]">
        {/* Date nav */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden shadow-sm">
          <button
            onClick={goToPrev}
            title="Previous period (Shift + ←)"
            className="h-9 w-9 flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <Popover>
            <PopoverTrigger className="h-9 px-4 text-xs font-semibold text-foreground hover:bg-muted transition-colors flex items-center gap-2 border-x border-border min-w-[180px] justify-center">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              {format(startDate, "MMM d")}–
              {format(addDays(startDate, days - 1), "d, yyyy")}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(d) => d && setStartDate(d)}
              />
            </PopoverContent>
          </Popover>
          <button
            onClick={goToNext}
            title="Next period (Shift + →)"
            className="h-9 w-9 flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <button
          onClick={goToToday}
          title="Jump to today (T)"
          className="h-9 px-4 rounded-lg text-xs font-semibold text-muted-foreground border border-border hover:text-foreground hover:bg-muted transition-colors shadow-sm"
        >
          Today
        </button>

        <div className="cal-toolbar-divider" />

        {/* View presets - segmented control style per spec */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          {VIEW_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setViewPreset(p.label)}
              title={`View ${p.days} day${p.days > 1 ? "s" : ""}`}
              className={cn(
                "h-9 px-4 text-xs font-semibold transition-all border-r border-border last:border-r-0",
                viewPreset === p.label
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="cal-toolbar-divider" />

        {/* Search bar per spec */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search guest name or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-44 rounded-md border border-border bg-background pl-10 pr-9 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Filter with active count badge */}
        <button
          onClick={() => setShowFilters(true)}
          title="Filter bookings"
          className="h-9 px-4 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2 shadow-sm"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="flex-1" />

        {/* Legend - now more prominent */}
        <div className="hidden xl:flex items-center gap-4 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
          {CALENDAR_LEGEND.slice(0, 4).map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-sm flex-shrink-0 shadow-sm"
                style={{ background: item.color }}
              />
              <span className="text-[10px] font-medium text-foreground">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {canBlock && (
          <button
            onClick={() => {
              setBlockPrefillRoomId(undefined);
              setBlockRoomOpen(true);
            }}
            title="Block a room from bookings"
            className="h-9 px-4 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
          >
            Block Room
          </button>
        )}

        {/* Primary action - brand primary per spec */}
        <Button
          onClick={() => {
            setNewBookingPrefill(null);
            setNewBookingOpen(true);
          }}
          title="Create new booking (N)"
          className="h-9 px-5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/95 transition-all flex items-center gap-2 shadow-sm"
        >
          <Plus className="size-4" />+ New Booking
        </Button>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border bg-background">
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
      )}

      {/* Unassigned tray */}
      {unassignedBookings.length > 0 && (
        <UnassignedTray
          bookings={unassignedBookings}
          currency={currency}
          onAssign={handleAssignBooking}
          onViewBooking={openBooking}
        />
      )}

      {/* Scheduler */}
      <div className="hidden md:block flex-1 relative overflow-hidden min-h-0">
        {loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-30 bg-primary/10 overflow-hidden">
            <div
              className="h-full bg-primary/60 w-1/3"
              style={{ animation: "shimmer 1.5s ease-in-out infinite" }}
            />
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
            onEventMouseEnter={handleEventHover}
            onEventMouseLeave={handleEventHoverEnd}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-[500px] text-center px-6">
            <div className="mb-6 relative">
              <CalendarDays className="size-20 text-muted-foreground/20" />
              <div className="absolute -right-2 -bottom-2 size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus className="size-5 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">
              No rooms configured yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Set up your room types and rooms to start managing bookings on the
              calendar. You can drag and drop bookings between rooms, resize to
              change dates, and create new bookings by clicking on empty cells.
            </p>
            <div className="flex items-center gap-3">
              <a href="/dashboard/rooms/types">
                <Button variant="outline">Set up rooms</Button>
              </a>
              <a href="/dashboard/rooms/types/new">
                <Button>Create room type</Button>
              </a>
            </div>

            {/* Quick tips */}
            <div className="mt-12 grid grid-cols-3 gap-6 max-w-2xl">
              <div className="flex flex-col items-center text-center">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <svg
                    className="size-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                    />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-foreground mb-1">
                  Click to create
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Click any empty cell to book
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <svg
                    className="size-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-foreground mb-1">
                  Drag to move
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Drag bookings between rooms
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <svg
                    className="size-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-foreground mb-1">
                  Resize dates
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Drag edges to change stay
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      {hoveredEvent &&
        (() => {
          const booking = bookings.find(
            (b) => b.id === hoveredEvent.event.bookingId,
          );
          if (!booking) return null;

          const nights =
            booking.nights ||
            Math.round(
              (new Date(booking.checkOut).getTime() -
                new Date(booking.checkIn).getTime()) /
                (1000 * 60 * 60 * 24),
            );

          const balance =
            booking.totalAmount -
            (booking.paymentStatus === "paid" ? booking.totalAmount : 0);

          return (
            <div
              className="cal-evt-tooltip"
              style={{
                left: hoveredEvent.x,
                top: hoveredEvent.y,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="cal-evt-tooltip-header">
                <span className="cal-evt-tooltip-name">
                  {booking.guestName || "Guest"}
                </span>
                <span
                  className="cal-evt-tooltip-status"
                  style={{
                    background: `${hoveredEvent.event.barColor}20`,
                    color: hoveredEvent.event.barColor,
                  }}
                >
                  {booking.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="cal-evt-tooltip-row">
                <span className="cal-evt-tooltip-label">Reference</span>
                <span className="cal-evt-tooltip-value">
                  {booking.reference}
                </span>
              </div>
              <div className="cal-evt-tooltip-row">
                <span className="cal-evt-tooltip-label">Check-in</span>
                <span className="cal-evt-tooltip-value">
                  {format(parseISO(booking.checkIn), "MMM d, yyyy")}
                </span>
              </div>
              <div className="cal-evt-tooltip-row">
                <span className="cal-evt-tooltip-label">Check-out</span>
                <span className="cal-evt-tooltip-value">
                  {format(parseISO(booking.checkOut), "MMM d, yyyy")}
                </span>
              </div>
              <div className="cal-evt-tooltip-row">
                <span className="cal-evt-tooltip-label">Duration</span>
                <span className="cal-evt-tooltip-value">
                  {nights} {nights === 1 ? "night" : "nights"}
                </span>
              </div>
              {booking.adults && (
                <div className="cal-evt-tooltip-row">
                  <span className="cal-evt-tooltip-label">Guests</span>
                  <span className="cal-evt-tooltip-value">
                    {booking.adults} adult{booking.adults !== 1 ? "s" : ""}
                    {booking.children
                      ? `, ${booking.children} child${booking.children !== 1 ? "ren" : ""}`
                      : ""}
                  </span>
                </div>
              )}
              <div className="cal-evt-tooltip-row">
                <span className="cal-evt-tooltip-label">Total</span>
                <span
                  className="cal-evt-tooltip-value"
                  style={{ fontWeight: 700 }}
                >
                  {currency} {booking.totalAmount.toLocaleString()}
                </span>
              </div>
              {balance > 0 && (
                <div className="cal-evt-tooltip-row">
                  <span className="cal-evt-tooltip-label">Balance</span>
                  <span
                    className="cal-evt-tooltip-value"
                    style={{ color: "#f59e0b", fontWeight: 650 }}
                  >
                    {currency} {balance.toLocaleString()}
                  </span>
                </div>
              )}
              {booking.roomNumber && (
                <div className="cal-evt-tooltip-row">
                  <span className="cal-evt-tooltip-label">Room</span>
                  <span className="cal-evt-tooltip-value">
                    {booking.roomNumber}
                  </span>
                </div>
              )}
            </div>
          );
        })()}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <MenuButton onClick={() => openBooking(contextMenu.event.bookingId!)}>
            View Details
          </MenuButton>
          {contextMenu.event.status === "pending" && (
            <MenuButton
              onClick={() =>
                handleStatusUpdate(contextMenu.event.bookingId!, "confirmed")
              }
            >
              Confirm
            </MenuButton>
          )}
          {contextMenu.event.status === "confirmed" && (
            <MenuButton
              onClick={() => handleCheckIn(contextMenu.event.bookingId!)}
            >
              Check In
            </MenuButton>
          )}
          {contextMenu.event.status === "checked_in" && (
            <MenuButton
              onClick={() => handleCheckOut(contextMenu.event.bookingId!)}
            >
              Check Out
            </MenuButton>
          )}
          {canEdit && (
            <>
              <div className="my-1 h-px bg-border" />
              <MenuButton
                destructive
                onClick={() =>
                  handleStatusUpdate(contextMenu.event.bookingId!, "cancelled")
                }
              >
                Cancel
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
        onCancel={(id) => handleStatusUpdate(id, "cancelled")}
        onReinstate={(id) => handleStatusUpdate(id, "confirmed")}
        onAssign={handleAssignBooking}
        onConfirm={(id) => handleStatusUpdate(id, "confirmed")}
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
  onToggleStatus: (s: string) => void;
  onToggleSource: (s: string) => void;
  onClearSearch: () => void;
  onClearAll: () => void;
}) {
  return (
    <>
      {roomTypeFilters
        .filter((f) => !f.visible)
        .map((f) => (
          <Chip
            key={f.id}
            label={`Type: ${f.name}`}
            onClick={() => onToggleRoomType(f.id)}
          />
        ))}
      {statusFilters.map((s) => (
        <Chip
          key={s}
          label={`Status: ${s.replace(/_/g, " ")}`}
          onClick={() => onToggleStatus(s)}
        />
      ))}
      {sourceFilters.map((s) => (
        <Chip
          key={s}
          label={`Source: ${s.replace(/_/g, " ")}`}
          onClick={() => onToggleSource(s)}
        />
      ))}
      {searchQuery && (
        <Chip label={`"${searchQuery}"`} onClick={onClearSearch} />
      )}
      <button
        onClick={onClearAll}
        className="text-[10px] text-muted-foreground hover:text-primary transition-colors ml-1"
      >
        Clear all
      </button>
    </>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-muted/50 px-2 text-[10px] text-muted-foreground hover:border-border/80 hover:text-foreground transition-colors"
    >
      <span className="truncate max-w-[140px] capitalize">{label}</span>
      <X className="size-2.5 flex-shrink-0" />
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
  onToggleStatus: (s: string) => void;
  onToggleSource: (s: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <aside className="absolute right-0 top-0 h-full w-[min(380px,100vw)] overflow-y-auto bg-background border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-muted/20">
          <h2 className="text-base font-semibold text-foreground">Filters</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={onClear}
              className="text-sm font-medium text-primary hover:opacity-80 transition-opacity"
            >
              Reset all
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <FilterGroup title="Room Types">
            {roomTypeFilters.map((f) => (
              <FilterToggle
                key={f.id}
                label={f.name}
                active={f.visible}
                onClick={() => onToggleRoomType(f.id)}
              />
            ))}
          </FilterGroup>
          <FilterGroup title="Booking Status">
            {STATUS_OPTIONS.map((s) => (
              <FilterToggle
                key={s}
                label={s.replace(/_/g, " ")}
                active={statusFilters.includes(s)}
                onClick={() => onToggleStatus(s)}
              />
            ))}
          </FilterGroup>
          <FilterGroup title="Booking Source">
            {SOURCE_OPTIONS.map((s) => (
              <FilterToggle
                key={s}
                label={s.replace(/_/g, " ")}
                active={sourceFilters.includes(s)}
                onClick={() => onToggleSource(s)}
              />
            ))}
          </FilterGroup>
        </div>
      </aside>
    </div>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold text-foreground px-1">
        {title}
      </p>
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
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-all",
        active
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-background hover:bg-muted/50"
      )}
    >
      <span className="text-sm capitalize font-medium text-foreground">{label}</span>
      <div
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors flex-shrink-0",
          active ? "bg-primary" : "bg-muted-foreground/20",
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-md transition-transform",
            active ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </div>
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
      onClick={onClick}
      className={cn(
        "flex w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {children}
    </button>
  );
}
