"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization */

import * as React from "react";
import Link from "next/link";
import { addDays, format, parseISO, subDays } from "date-fns";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "@heroui/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { qk } from "@/lib/query-keys";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { updateBookingStatus } from "@/app/actions/bookings";
import { NewBookingModal } from "@/components/bookings/new-booking-modal";
import {
  assignBookingToRoom,
  checkRoomAvailability,
  getCalendarData,
  moveBooking,
  unassignBooking,
  type CalendarData,
} from "./actions";
import { buildEvents, type CalendarEvent } from "./_components/calendar-events";
import { buildResources } from "./_components/calendar-resources";
import {
  CALENDAR_LEGEND,
  isManualLikeSource,
  ROW_HEADER_WIDTH,
  VIEW_PRESETS,
  type ViewPreset,
} from "./_components/calendar-helpers";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { BlockRoomSheet } from "./_components/block-room-sheet";
import { UnassignedTray } from "./_components/unassigned-tray";
import { TimelineCalendar } from "./_components/timeline/timeline-calendar";
import "./calendar.css";

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
  "manual",
  "phone",
  "walk_in",
] as const;

function getDateRangeKey(startDate: Date, days: number): string {
  return `${format(startDate, "yyyy-MM-dd")}_${days}`;
}

export function CalendarClient(props: CalendarClientProps) {
  // This boundary makes CalendarClient safe when rendered in isolated route
  // previews, error recoveries, or layouts that do not inherit app providers.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <CalendarClientContent {...props} />
    </QueryClientProvider>
  );
}

function CalendarClientContent({
  initialData,
  roomTypes,
  hotelId,
  currency,
  canEdit,
  canBlock,
}: CalendarClientProps) {
  const queryClient = useQueryClient();
  const { orgId } = useAuth();

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
  const [showSearch, setShowSearch] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [rangePopoverOpen, setRangePopoverOpen] = React.useState(false);
  const [realtimeStatus, setRealtimeStatus] = React.useState<
    "live" | "reconnecting"
  >("reconnecting");

  React.useEffect(() => {
    if (showSearch) {
      // Small delay to allow the input to mount/expand before focusing
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showSearch]);

  const [selectedBookingId, setSelectedBookingId] = React.useState<
    string | null
  >(null);
  const [detailPanelOpen, setDetailPanelOpen] = React.useState(false);
  const [detailInitialTab, setDetailInitialTab] = React.useState<"overview" | "payments">("overview");
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

  const todayKey = React.useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  // Scheduler callbacks run for every pointer movement. Keep lookup work indexed
  // so a large property does not turn drag feedback into repeated array scans.
  const bookingByEventId = React.useMemo(
    () => new Map(bookings.map((booking) => [`booking-${booking.id}`, booking])),
    [bookings],
  );
  const roomById = React.useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms],
  );
  const eventsByResource = React.useMemo(() => {
    const index = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const row = index.get(event.resource) ?? [];
      row.push(event);
      index.set(event.resource, row);
    }
    return index;
  }, [events]);
  const occupancyByDate = React.useMemo(() => {
    const occupancy = new Map<string, number>();
    const firstDay = format(startDate, "yyyy-MM-dd");
    const lastDay = format(addDays(startDate, days), "yyyy-MM-dd");

    for (const booking of bookings) {
      if (!booking.roomId || booking.status === "cancelled" || booking.status === "checked_out") continue;
      const from = booking.checkIn > firstDay ? booking.checkIn : firstDay;
      const until = booking.checkOut < lastDay ? booking.checkOut : lastDay;
      for (let cursor = from; cursor < until; cursor = format(addDays(parseISO(cursor), 1), "yyyy-MM-dd")) {
        occupancy.set(cursor, (occupancy.get(cursor) ?? 0) + 1);
      }
    }
    return occupancy;
  }, [bookings, days, startDate]);

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
    let refreshTimer: number | undefined;
    const refresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      // Several rows can change in one reservation operation. Batch those
      // events, then immediately refetch the active calendar query.
      refreshTimer = window.setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: ["calendar", orgId, hotelId],
          refetchType: "active",
        });
      }, 75);
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
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "availability_blocks",
          filter: `hotel_id=eq.${hotelId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        setRealtimeStatus(status === "SUBSCRIBED" ? "live" : "reconnecting");
      });
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
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
    (dateArg: Date, daysArg: number) => {
      void dateArg;
      void daysArg;
      invalidateCalendar();
    },
    [invalidateCalendar],
  );

  React.useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const goToPrev = React.useCallback(() => {
    setStartDate((previous) => {
      const next = subDays(previous, days);
      return next;
    });
  }, [days]);

  const goToNext = React.useCallback(() => {
    setStartDate((previous) => {
      const next = addDays(previous, days);
      return next;
    });
  }, [days]);
  const goToToday = React.useCallback(() => {
    const today = new Date();
    setStartDate(today);
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
    setDetailInitialTab("overview");
    setSelectedBookingId(bookingId);
    setDetailPanelOpen(true);
  }, []);

  const handleTimeRangeSelected = React.useCallback(
    (args: any) => {
      if (!canEdit) {
        toast.danger("No permission to create bookings");
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
        toast.danger("No permission to update bookings");
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
      // DayPilot.Date is NOT a JS Date — use toString().split("T")[0] to extract
      // the date string safely, matching the same pattern used in handleTimeRangeSelected.
      const newCheckIn = args.newStart.toString().split("T")[0] as string;
      const newCheckOut = args.newEnd.toString().split("T")[0] as string;

      if (newCheckOut <= newCheckIn) {
        toast.danger("Check-out must be after check-in");
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

      const toastId = toast(
        mode === "move" ? "Checking room..." : "Updating dates...",
        { isLoading: true, timeout: 0 },
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

        toast.close(toastId);
        if (result.success) {
          toast.success(mode === "move" ? "Booking moved" : "Dates updated");
        } else {
          throw new Error(result.error || "Update failed");
        }
      } catch (err: any) {
        toast.close(toastId);
        // Rollback
        if (previousData) {
          queryClient.setQueryData<CalendarData>(queryKey, previousData);
        }
        toast.danger(err.message || "Update failed");
      } finally {
        fetchCalendarData(startDate, days);
      }
    },
    [bookings, canEdit, days, fetchCalendarData, startDate, orgId, hotelId, dateStr, queryClient, rooms],
  );

  const handleAssignBooking = React.useCallback(
    async (bookingId: string) => {
      if (!canEdit) {
        toast.danger("No permission to assign bookings");
        return;
      }
      const booking = bookings.find((item) => item.id === bookingId);
      if (!booking?.roomTypeId) {
        toast.danger("Booking has no room type");
        return;
      }

      for (const room of rooms.filter(
        (item) =>
          item.roomTypeId === booking.roomTypeId && !["maintenance", "out_of_service"].includes(item.status),
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
      toast.danger("No available room for this booking");
    },
    [bookings, canEdit, days, fetchCalendarData, rooms, startDate],
  );

  const handleCheckIn = React.useCallback(
    async (bookingId: string) => {
      const result = await checkInBooking(bookingId);
      if (result.success) {
        toast.success("Guest checked in");
      } else {
        toast.danger(result.error || "Check-in failed");
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
        toast.danger(result.error || "Check-out failed");
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
        toast.danger(result.error || "Update failed");
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
  const bookingByEventIdRef = React.useRef(bookingByEventId);
  const roomByIdRef = React.useRef(roomById);
  const eventsByResourceRef = React.useRef(eventsByResource);
  const occupancyByDateRef = React.useRef(occupancyByDate);
  const serviceableRoomCountRef = React.useRef(0);
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
  React.useEffect(() => {
    bookingByEventIdRef.current = bookingByEventId;
  }, [bookingByEventId]);
  React.useEffect(() => {
    roomByIdRef.current = roomById;
  }, [roomById]);
  React.useEffect(() => {
    eventsByResourceRef.current = eventsByResource;
  }, [eventsByResource]);
  React.useEffect(() => {
    occupancyByDateRef.current = occupancyByDate;
  }, [occupancyByDate]);
  React.useEffect(() => {
    serviceableRoomCountRef.current = rooms.filter(
      (room) => !room.status?.includes("maintenance") && !room.status?.includes("out_of_service"),
    ).length;
  }, [rooms]);

  const schedulerConfig = React.useMemo(() => {
    let cellWidth = 72;
    let rowHeight = 46;
    let eventHeight = 38;

    switch (viewPreset) {
      case "Day":
        cellWidth = 320;
        rowHeight = 52;
        eventHeight = 44;
        break;
      case "3 Day":
        cellWidth = 180;
        rowHeight = 50;
        eventHeight = 42;
        break;
      case "Week":
        cellWidth = 120;
        rowHeight = 48;
        eventHeight = 40;
        break;
      case "2 Wks":
        cellWidth = 84;
        rowHeight = 46;
        eventHeight = 38;
        break;
      case "Month":
        cellWidth = 54;
        rowHeight = 42;
        eventHeight = 34;
        break;
    }

    return {
      startDate: format(startDate, "yyyy-MM-dd"),
      days,
      scale: "Day" as const,
      cellWidth,
      rowHeight,
      rowHeaderWidth: ROW_HEADER_WIDTH,
      eventHeight,
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
      headerHeight: 52,
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
        const todayStr = todayKey;
        if (startStr < todayStr) {
          const booking = bookingByEventIdRef.current.get(eventId);
          const isAllowedPast = booking && (isManualLikeSource(booking.source) || booking.status === "checked_in");
          if (!isAllowedPast) {
            args.allowed = false;
            args.right.html = "Cannot start in the past";
            return;
          }
        }

        // 3. Room type compatibility
        const booking = bookingByEventIdRef.current.get(eventId);
        const targetRoom = roomByIdRef.current.get(resourceId);
        if (booking && targetRoom && booking.roomTypeId !== targetRoom.roomTypeId) {
          args.allowed = false;
          args.right.html = "Room type mismatch";
          return;
        }

        // 4. Overlap checks against the UNFILTERED events array
        const hasOverlap = (eventsByResourceRef.current.get(resourceId) ?? []).some(evt => {
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
        const todayStr = todayKey;
        if (startStr < todayStr) {
          const booking = bookingByEventIdRef.current.get(eventId);
          const isAllowedPast = booking && (isManualLikeSource(booking.source) || booking.status === "checked_in");
          if (!isAllowedPast) {
            args.allowed = false;
            args.right.html = "Cannot start in the past";
            return;
          }
        }

        // Overlap checks against the UNFILTERED events array
        const hasOverlap = (eventsByResourceRef.current.get(resourceId) ?? []).some(evt => {
          if (evt.id === eventId) return false;
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
        if (date === todayKey)
          classes.push("today-col");
        if (weekday === "Sat" || weekday === "Sun") classes.push("weekend-col");
        if (String(args.cell.resource).startsWith("section-"))
          classes.push("cal-section-row");
        args.cell.properties.cssClass = classes.join(" ");
      },
      onBeforeTimeHeaderRender: (args: any) => {
        const date = args.header.start.toString("yyyy-MM-dd");
        const occupied = occupancyByDateRef.current.get(date) ?? 0;
        const totalRooms = serviceableRoomCountRef.current;
        const occupancy =
          totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
        const today = date === todayKey;

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        // getDayOfWeek() is the correct DayPilotDate API (not native Date.getDay())
        const dayIndex = args.header.start.getDayOfWeek();

        args.header.html = `<div class="cal-day-hdr${today ? " is-today" : ""}">
          <span class="cal-day-dow">${dayNames[dayIndex] || "Sun"}</span>
          <span class="cal-day-num">${args.header.start.toString("d")}</span>
          <span class="cal-day-occ">${occupancy}%</span>
        </div>`;
        if (today)
          args.header.properties = {
            ...args.header.properties,
            cssClass: `${args.header.properties?.cssClass || ""} today-col`,
          };
      },
    };
  }, [canEdit, days, startDate, todayKey, viewPreset]);

  const filteredCount = roomTypeFilters.filter(
    (filter) => filter.visible,
  ).length;
  const hiddenTypeCount = roomTypeFilters.length - filteredCount;
  const mobileSchedulerConfig = React.useMemo(
    () => ({
      ...schedulerConfig,
      days: 7,
      cellWidth: 64,
      rowHeaderWidth: 104,
      rowHeight: 48,
      eventHeight: 40,
      height: 560,
      heightSpec: "Fixed" as const,
      floatingEvents: false,
    }),
    [schedulerConfig],
  );

  const handleTimelineChange = React.useCallback(async (booking: CalendarData["bookings"][number], roomId: string | null, checkIn: string, checkOut: string) => {
    if (!canEdit) { toast.danger("No permission to update bookings"); return; }
    const queryKey = qk.calendar(orgId || "", hotelId, dateStr, days);
    const snapshot = queryClient.getQueryData<CalendarData>(queryKey);
    const room = rooms.find(item => item.id === roomId);
    if (snapshot) queryClient.setQueryData<CalendarData>(queryKey, { ...snapshot, bookings: snapshot.bookings.map(item => item.id === booking.id ? { ...item, roomId, roomNumber: room?.roomNumber ?? null, checkIn, checkOut, nights: Math.max(1, Math.round((parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / 86_400_000)) } : item) });
    try {
      const result = roomId ? await moveBooking(booking.id, { roomId, checkIn, checkOut }) : await unassignBooking(booking.id);
      if (!result.success) throw new Error(result.error);
      toast.success(roomId ? "Booking updated" : "Booking unassigned");
    } catch (error) {
      if (snapshot) queryClient.setQueryData(queryKey, snapshot);
      toast.danger(error instanceof Error ? error.message : "Booking update failed");
    }
  }, [canEdit, dateStr, days, hotelId, orgId, queryClient, rooms]);

  React.useEffect(() => {
    const report = (event: Event) => toast.danger((event as CustomEvent<string>).detail);
    window.addEventListener("roomline-calendar-error", report);
    return () => window.removeEventListener("roomline-calendar-error", report);
  }, []);

  const activeFilterCount =
    hiddenTypeCount +
    statusFilters.length +
    sourceFilters.length +
    (searchQuery ? 1 : 0);

  return (
    <div className="cal-wrap flex flex-col h-[calc(100vh-3rem)] bg-background overflow-hidden min-h-0">
      {/* ── Desktop Toolbar ── */}
      <div className="hidden md:flex items-center gap-1.5 px-3 border-b border-border bg-background sticky top-0 z-30 h-11">

        {/* Prev */}
        <button
          onClick={goToPrev}
          title="Previous period"
          className="h-8 w-8 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {/* Date range picker */}
        <Popover open={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
          <PopoverTrigger
            render={
              <button className="h-8 px-3 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-1.5 min-w-[148px] justify-center" />
            }
          >
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <span>{format(startDate, "MMMM yyyy")}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(d) => {
                if (d) {
                  setStartDate(d);
                  setTimeout(() => setRangePopoverOpen(false), 0);
                }
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Next */}
        <button
          onClick={goToNext}
          title="Next period"
          className="h-8 w-8 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ChevronRight className="size-3.5" />
        </button>

        {/* View preset dropdown */}
        <Popover>
          <PopoverTrigger
            render={
              <button className="h-8 px-3 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-1 min-w-[60px] justify-center" />
            }
          >
            <span>{viewPreset}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="start">
            {VIEW_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setViewPreset(p.label)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors",
                  viewPreset === p.label
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground hover:bg-muted"
                )}
              >
                {p.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Today */}
        <button
          onClick={goToToday}
          title="Jump to today (T)"
          className="h-8 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          Today
        </button>

        <div className="flex-1" />

        {/* Legend */}
        <Popover>
          <PopoverTrigger
            render={
              <button className="h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1.5">
                <span className="flex gap-1">
                  <span className="size-2 rounded-sm" style={{ background: "#16A7D8" }} />
                  <span className="size-2 rounded-sm" style={{ background: "#2FAA67" }} />
                  <span className="size-2 rounded-sm" style={{ background: "#16A34A" }} />
                </span>
                Legend
              </button>
            }
          />
          <PopoverContent className="w-52 p-3" align="end">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Status colors
            </p>
            <ul className="space-y-1.5">
              {CALENDAR_LEGEND.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-xs text-foreground">
                  <span
                    className={cn("size-2.5 rounded-sm shrink-0", item.type === "block" && "rounded-[3px]")}
                    style={
                      item.type === "block"
                        ? {
                            background:
                              "repeating-linear-gradient(135deg, rgba(100,116,139,0.25) 0 3px, rgba(100,116,139,0.5) 3px 6px)",
                          }
                        : { background: item.color }
                    }
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        {/* Search — icon that expands inline */}
        <div className={cn(
          "flex items-center rounded-md border border-border transition-all duration-200 overflow-hidden bg-background",
          showSearch ? "w-52" : "w-8"
        )}>
          <button
            onClick={() => {
              if (showSearch && searchQuery) { setSearchQuery(""); setShowSearch(false); }
              else setShowSearch((v) => !v);
            }}
            title="Search"
            className="h-8 w-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSearch && searchQuery
              ? <X className="size-3.5" />
              : <Search className="size-3.5" />
            }
          </button>
          {showSearch && (
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); setShowSearch(false); } }}
              placeholder="Guest or reference…"
              className="flex-1 h-8 pr-2 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            />
          )}
        </div>

        {/* Filters */}
        <button
          onClick={() => setShowFilters(true)}
          title="Filters"
          className={cn(
            "h-8 w-8 rounded-md flex items-center justify-center border transition-colors relative",
            activeFilterCount > 0
              ? "border-primary/40 bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Block room */}
        {canBlock && (
          <button
            onClick={() => { setBlockPrefillRoomId(undefined); setBlockRoomOpen(true); }}
            title="Block room"
            className="h-8 w-8 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="size-3.5" aria-hidden>
              <rect x="1" y="1" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <line x1="3.5" y1="7.5" x2="11.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* New Reservation — primary CTA */}
        <button
          onClick={() => { setNewBookingPrefill(null); setNewBookingOpen(true); }}
          title="Create new reservation (N)"
          className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5"
        >
          <Plus className="size-3.5" />
          New Reservation
        </button>

      </div>

      {/* ── Mobile Toolbar ── */}
      <div className="flex md:hidden items-center gap-2 px-3 border-b border-border bg-background sticky top-0 z-30 h-12">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground leading-tight">
            Calendar
            <span
              className={cn(
                "size-1.5 rounded-full",
                realtimeStatus === "live" ? "bg-emerald-500" : "bg-amber-400",
              )}
              aria-label={realtimeStatus === "live" ? "Live updates connected" : "Live updates reconnecting"}
            />
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">
            {format(startDate, "MMM d")} – {format(addDays(startDate, 6), "MMM d")}
          </p>
        </div>
        <div className="ml-auto flex items-center rounded-md border border-border bg-muted/30 p-0.5">
          <button onClick={() => setStartDate((date) => subDays(date, 7))} className="grid size-7 place-items-center rounded text-muted-foreground active:bg-background" aria-label="Previous week">
            <ChevronLeft className="size-3.5" />
          </button>
          <button onClick={goToToday} className="h-7 px-2 text-[11px] font-semibold text-foreground active:bg-background">Today</button>
          <button onClick={() => setStartDate((date) => addDays(date, 7))} className="grid size-7 place-items-center rounded text-muted-foreground active:bg-background" aria-label="Next week">
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        {canBlock && (
          <button
            onClick={() => { setBlockPrefillRoomId(undefined); setBlockRoomOpen(true); }}
            aria-label="Block room"
            className="h-9 w-9 rounded-md flex items-center justify-center border border-border text-muted-foreground active:bg-muted"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="size-4" aria-hidden>
              <rect x="1" y="1" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <line x1="3.5" y1="7.5" x2="11.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        <button
          onClick={() => { setNewBookingPrefill(null); setNewBookingOpen(true); }}
          className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus className="size-3.5" />
          New
        </button>
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

      {/* Scheduler (desktop) */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-30 bg-primary/10 overflow-hidden">
            <div
              className="h-full bg-primary/60 w-1/3"
              style={{ animation: "shimmer 1.5s ease-in-out infinite" }}
            />
          </div>
        )}

        {resources.length > 0 ? (
          <TimelineCalendar startDate={startDate} days={days} rooms={filteredRooms} bookings={bookings.filter(b => (!b.roomId || filteredRooms.some(r => r.id === b.roomId)) && (!statusFilters.length || statusFilters.includes(b.status)) && (!sourceFilters.length || sourceFilters.includes(b.source ?? "")) && (!searchQuery.trim() || `${b.guestName} ${b.reference} ${b.roomNumber}`.toLowerCase().includes(searchQuery.toLowerCase())))} blocks={availabilityBlocks} canEdit={canEdit} onOpenBooking={openBooking} onChange={handleTimelineChange} onCreate={(room, date) => { setNewBookingPrefill({ roomId: room.id, roomTypeId: room.roomTypeId, checkIn: parseISO(date), checkOut: addDays(parseISO(date), 1) }); setNewBookingOpen(true); }} />
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
              <Link href="/dashboard/rooms/types">
                <Button variant="outline">Set up rooms</Button>
              </Link>
              <Link href="/dashboard/rooms/types/new">
                <Button>Create room type</Button>
              </Link>
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

      {/* Mobile operations view — timeline stays available instead of collapsing into agenda only. */}
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

      <BookingDetailDrawer
        bookingId={selectedBookingId}
        open={detailPanelOpen}
        onClose={() => {
          setDetailPanelOpen(false);
          setSelectedBookingId(null);
        }}
        currency={currency}
        initialTab={detailInitialTab}
        onBookingChanged={() => fetchCalendarData(startDate, days)}
      />
      <BlockRoomSheet
        open={blockRoomOpen}
        onOpenChange={setBlockRoomOpen}
        rooms={rooms}
        prefillRoomId={blockPrefillRoomId}
        onSuccess={() => fetchCalendarData(startDate, days)}
      />
      <NewBookingModal
        open={newBookingOpen}
        onOpenChange={(open) => {
          setNewBookingOpen(open);
          if (!open) {
            setNewBookingPrefill(null);
            fetchCalendarData(startDate, days);
          }
        }}
        roomTypes={roomTypes}
        rooms={rooms}
        currency={currency}
        prefillRoomTypeId={newBookingPrefill?.roomTypeId}
        prefillCheckIn={newBookingPrefill?.checkIn}
        prefillCheckOut={newBookingPrefill?.checkOut}
        onReservationCreated={({ bookingId, payNow }) => {
          if (!payNow) return;
          setDetailInitialTab("payments");
          setSelectedBookingId(bookingId);
          setDetailPanelOpen(true);
        }}
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
