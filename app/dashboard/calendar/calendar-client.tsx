"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, Plus, RefreshCw, TriangleAlert, X } from "lucide-react";
import { AlertDialog, Button, Chip, Drawer, Switch, toast } from "@heroui/react";
import { keepPreviousData, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { qk } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { getQueryClient } from "@/components/providers";
import {
  assignBookingToRoom,
  getCalendarData,
  moveBooking,
  unassignBooking,
  type CalendarAvailabilityBlock,
  type CalendarBooking,
  type CalendarData,
  type CalendarRoom,
} from "./actions";
import type { TypeChangeRequest as DragTypeChangeRequest } from "./_components/timeline/timeline-calendar";
import { pickBestRoom } from "./_components/timeline/auto-assign";
import { VIEW_PRESETS, type ViewPreset } from "./_components/calendar-helpers";
import { businessToday } from "@/lib/business-date";
import { useIsMobile } from "@/hooks/use-mobile";
import { CalendarToolbar } from "./_components/calendar-toolbar";
import { TimelineCalendar } from "./_components/timeline/timeline-calendar";
import "./calendar.css";

// ── Lazy overlays (L6) ──────────────────────────────────────────────────
// Rarely-mounted heavy surfaces (multi-step form, two drawers, one sheet).
// Splitting them keeps the timeline's initial chunk small; ssr:false is
// safe because they only render after user interaction.
const NewBookingModal = dynamic(
  () => import("@/components/bookings/new-booking-modal").then((mod) => mod.NewBookingModal),
  { ssr: false },
);
const BookingDetailDrawer = dynamic(
  () => import("@/components/bookings/booking-detail-drawer").then((mod) => mod.BookingDetailDrawer),
  { ssr: false },
);
const BlockDetailDrawer = dynamic(
  () => import("./_components/block-detail-drawer").then((mod) => mod.BlockDetailDrawer),
  { ssr: false },
);
const BlockRoomSheet = dynamic(
  () => import("./_components/block-room-sheet").then((mod) => mod.BlockRoomSheet),
  { ssr: false },
);

interface CalendarClientProps {
  initialData: CalendarData;
  roomTypes: { id: string; name: string; base_price: number }[];
  hotelId: string;
  hotelName: string;
  currency: string;
  /** Property timezone — the calendar anchors its business date to this. */
  hotelTimezone: string;
  canEdit: boolean;
  canBlock: boolean;
  canUnblock: boolean;
}

interface RoomTypeFilter {
  id: string;
  name: string;
  visible: boolean;
}

const STATUS_OPTIONS = ["pending", "confirmed", "checked_in"] as const;
const SOURCE_OPTIONS = ["direct", "manual", "phone", "walk_in"] as const;

/** Drag request enriched with display names for the confirmation dialog. */
interface TypeChangeRequest extends DragTypeChangeRequest {
  guestName: string;
  fromTypeName: string | null;
  toTypeName: string;
}

/** True when [startDate, startDate+days) fits inside the server-seeded window,
 *  letting the first paint reuse the payload the page already fetched. */
function withinSeededRange(startDate: Date, days: number, seededStart: Date, seededDays: number): boolean {
  return (
    startDate.getTime() >= seededStart.getTime() &&
    addDays(startDate, days).getTime() <= addDays(seededStart, seededDays).getTime()
  );
}

export function CalendarClient(props: CalendarClientProps) {
  // Share the app-wide QueryClient singleton (M1): a calendar-scoped client
  // silently duplicated every cached query under the same keys. In isolated
  // previews without app providers, getQueryClient() still returns the one
  // stable browser client, so this boundary remains safe.
  const [queryClient] = React.useState(() => getQueryClient());

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
  hotelTimezone,
  canEdit,
  canBlock: canBlockProp,
  canUnblock,
}: CalendarClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orgId } = useAuth();

  // Calendar mutations move money + occupancy, so dashboard KPIs and any open
  // booking-detail view would serve stale numbers without these (M1).
  const invalidateCalendarData = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["calendar", orgId, hotelId] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", orgId, hotelId] });
    void queryClient.invalidateQueries({ queryKey: ["bookingDetail"] });
  }, [queryClient, orgId, hotelId]);

  // Property business date — the single anchor for seeding, the default view
  // window, and the "today" marker. Never derived from the device clock.
  const businessDateKey = businessToday(hotelTimezone);

  // Seeded window mirrors the server payload exactly ([businessDate, +30]),
  // so the first paint can only reuse data anchored to the requested range.
  const [seededRange] = React.useState(() => ({ start: parseISO(businessDateKey), days: 30 }));
  const [startDate, setStartDate] = React.useState(() => parseISO(businessDateKey));
  const [viewPreset, setViewPreset] = React.useState<ViewPreset>("2 Wks");
  const days = VIEW_PRESETS.find((preset) => preset.label === viewPreset)?.days ?? 14;

  const dateStr = format(startDate, "yyyy-MM-dd");

  const [newBookingIds, setNewBookingIds] = React.useState<Set<string>>(new Set());
  const knownBookingIdsRef = React.useRef(new Set(initialData.bookings.map((booking) => booking.id)));

  // ── Main calendar data query ──────────────────────────────────────
  const canReuseSeed = React.useMemo(
    () => withinSeededRange(startDate, days, seededRange.start, seededRange.days),
    [days, seededRange, startDate],
  );

  const { data: calendarData, isFetching, isError, error, refetch } = useQuery({
    queryKey: qk.calendar(orgId || "", hotelId, dateStr, days),
    queryFn: () => getCalendarData(dateStr, days),
    enabled: !!orgId,
    // Only the seeded window may start from server data; every other range
    // fetches fresh so bookings never render against a mismatched anchor.
    initialData: canReuseSeed ? initialData : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  // Stable array identities keep downstream memos/effects dependency-safe.
  const rooms = React.useMemo(() => calendarData?.rooms ?? [], [calendarData]);
  const bookings = React.useMemo(() => calendarData?.bookings ?? [], [calendarData]);
  const availabilityBlocks = React.useMemo(() => calendarData?.availabilityBlocks ?? [], [calendarData]);

  const [roomTypeFilters, setRoomTypeFilters] = React.useState<RoomTypeFilter[]>(() =>
    roomTypes.map((roomType) => ({ id: roomType.id, name: roomType.name, visible: true })),
  );
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = React.useState<string[]>([]);
  const [showFilters, setShowFilters] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  // Defer so each keystroke stays responsive while the timeline re-filters
  // and re-renders hundreds of bars (M8).
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [realtimeStatus, setRealtimeStatus] = React.useState<"live" | "reconnecting">("reconnecting");

  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
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
  const [editingBlock, setEditingBlock] = React.useState<CalendarAvailabilityBlock | null>(null);
  const [selectedBlock, setSelectedBlock] = React.useState<CalendarAvailabilityBlock | null>(null);
  const [blockPrefillRoomId, setBlockPrefillRoomId] = React.useState<string | undefined>();
  const [pendingTypeChange, setPendingTypeChange] = React.useState<TypeChangeRequest | null>(null);

  const visibleRoomTypeIds = React.useMemo(
    () => new Set(roomTypeFilters.filter((filter) => filter.visible).map((filter) => filter.id)),
    [roomTypeFilters],
  );

  const filteredRooms = React.useMemo(() => rooms.filter((room) => visibleRoomTypeIds.has(room.roomTypeId)), [rooms, visibleRoomTypeIds]);

  const visibleBookings = React.useMemo(
    () =>
      bookings.filter(
        (b) =>
          (!b.roomId || filteredRooms.some((r) => r.id === b.roomId)) &&
          (!statusFilters.length || statusFilters.includes(b.status)) &&
          (!sourceFilters.length || sourceFilters.includes(b.source ?? "")) &&
          (!deferredSearchQuery.trim() || `${b.guestName} ${b.reference} ${b.roomNumber}`.toLowerCase().includes(deferredSearchQuery.toLowerCase())),
      ),
    [bookings, deferredSearchQuery, filteredRooms, sourceFilters, statusFilters],
  );

  // ── New-booking highlight animation ────────────────────────────────
  const dateRangeKey = `${dateStr}_${days}`;
  const knownDateRangeKeyRef = React.useRef(dateRangeKey);

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

  // ── Realtime subscription → invalidate React Query cache ────────────
  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    type RealtimeChannel = ReturnType<ReturnType<typeof createClient>["channel"]>;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: number | undefined;
    let retryTimer: number | undefined;
    let resubscribeAttempts = 0;

    const supabase = createClient();

    const invalidate = () => {
      void queryClient.invalidateQueries({
        queryKey: ["calendar", orgId, hotelId],
        refetchType: "active",
      });
      // Bookings feed dashboard KPIs and the detail drawer too (M1); only
      // active observers refetch, so idle views cost nothing.
      void queryClient.invalidateQueries({ queryKey: ["dashboard", orgId, hotelId], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["bookingDetail"], refetchType: "active" });
    };

    const batchRefresh = () => {
      // Several rows can change in one reservation operation. Batch those
      // events, then immediately refetch the active calendar query.
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(invalidate, 75);
    };

    const refreshRealtimeAuth = async () => {
      try {
        // The websocket bypasses the REST fetch wrapper that injects the Clerk
        // JWT, so the realtime socket must be authenticated explicitly or RLS
        // filters out every change.
        const token = await window.Clerk?.session?.getToken({ template: "supabase" });
        if (!cancelled && token) supabase.realtime.setAuth(token);
      } catch (error) {
        console.error("[calendar] realtime auth refresh failed:", error);
      }
    };

    const reportStatus = onRealtimeStatus({
      label: "calendar",
      hotelId,
      orgId,
      table: "bookings,availability_blocks",
    });

    const handleStatus = (status: string, err?: Error) => {
      setRealtimeStatus(status === "SUBSCRIBED" ? "live" : "reconnecting");
      if (status === "SUBSCRIBED") {
        resubscribeAttempts = 0;
        return;
      }
      if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
      // Reported once per outage rather than once per retry: the loop below
      // makes up to five attempts on the same broken channel, and each would
      // otherwise be its own event.
      if (resubscribeAttempts === 0) reportStatus(status, err);
      if (cancelled || resubscribeAttempts >= 5) return;
      resubscribeAttempts += 1;
      retryTimer = window.setTimeout(async () => {
        // A refreshed token only takes effect on a new subscription, and
        // subscribe() is a no-op unless the channel is closed — so the
        // channel is torn down and rebuilt with the same handlers.
        await refreshRealtimeAuth();
        if (!cancelled) openChannel();
      }, resubscribeAttempts * 2_000);
    };

    const buildChannel = () =>
      supabase
        .channel(`hotel:${hotelId}:calendar`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
          batchRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "availability_blocks", filter: `hotel_id=eq.${hotelId}` },
          batchRefresh,
        );

    const openChannel = () => {
      if (channel) supabase.removeChannel(channel);
      channel = buildChannel().subscribe(handleStatus);
    };

    // Safety net after laptop sleep / long tab background: pull fresh state.
    const onVisible = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    document.addEventListener("visibilitychange", onVisible);

    void refreshRealtimeAuth().then(() => {
      if (!cancelled) openChannel();
    });
    const authInterval = window.setInterval(() => void refreshRealtimeAuth(), 45_000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (authInterval) window.clearInterval(authInterval);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient]);

  // ── Navigation — always exactly ±view-period steps ───────────────────
  const navigate = React.useCallback(
    (direction: -1 | 1) => {
      setStartDate((previous) => addDays(previous, direction * days));
    },
    [days],
  );
  const goToToday = React.useCallback(() => setStartDate(new Date()), []);
  const selectDate = React.useCallback((date: Date) => setStartDate(date), []);

  const clearFilters = React.useCallback(() => {
    setRoomTypeFilters((previous) => previous.map((filter) => ({ ...filter, visible: true })));
    setStatusFilters([]);
    setSourceFilters([]);
    setSearchQuery("");
  }, []);

  const toggleRoomTypeFilter = React.useCallback((typeId: string) => {
    setRoomTypeFilters((previous) =>
      previous.map((filter) => (filter.id === typeId ? { ...filter, visible: !filter.visible } : filter)),
    );
  }, []);

  const toggleStatusFilter = React.useCallback((status: string) => {
    setStatusFilters((previous) =>
      previous.includes(status) ? previous.filter((item) => item !== status) : [...previous, status],
    );
  }, []);

  const toggleSourceFilter = React.useCallback((source: string) => {
    setSourceFilters((previous) =>
      previous.includes(source) ? previous.filter((item) => item !== source) : [...previous, source],
    );
  }, []);

  const openBooking = React.useCallback((bookingId: string) => {
    setDetailInitialTab("overview");
    setSelectedBookingId(bookingId);
    setDetailPanelOpen(true);
  }, []);

  const openNewBooking = React.useCallback((prefill: typeof newBookingPrefill) => {
    if (!canEdit) {
      toast.danger("No permission to create bookings");
      return;
    }
    setNewBookingPrefill(prefill);
    setNewBookingOpen(true);
  }, [canEdit]);

  // Edit handoff (H6): the detail drawer closes itself, then asks us to
  // reopen the block sheet in edit mode with this block prefilled.
  const openBlockEditor = React.useCallback((block: CalendarAvailabilityBlock) => {
    setEditingBlock(block);
    setBlockRoomOpen(true);
  }, []);

  // Clear the edit target whenever the sheet closes so the next open via the
  // toolbar always starts in create mode.
  const handleBlockSheetOpenChange = React.useCallback((open: boolean) => {
    setBlockRoomOpen(open);
    if (!open) {
      setEditingBlock(null);
      setBlockPrefillRoomId(undefined);
    }
  }, []);

  // Stable identity keeps RoomRow's React.memo intact across parent renders
  // (search keystrokes, filter toggles) — an inline arrow would defeat it.
  const handleCellCreate = React.useCallback(
    (room: CalendarRoom, date: string) => {
      openNewBooking({
        roomId: room.id,
        roomTypeId: room.roomTypeId,
        checkIn: parseISO(date),
        checkOut: addDays(parseISO(date), 1),
      });
    },
    [openNewBooking],
  );

  // ── Mutations ────────────────────────────────────────────────────────

  const handleTimelineChange = React.useCallback(
    async (
      booking: CalendarBooking,
      roomId: string | null,
      checkIn: string,
      checkOut: string,
      roomTypeIdOverride?: string,
    ) => {
      if (!canEdit) {
        toast.danger("No permission to update bookings");
        return;
      }
      const queryKey = qk.calendar(orgId || "", hotelId, dateStr, days);
      const snapshot = queryClient.getQueryData<CalendarData>(queryKey);
      const room = rooms.find((item) => item.id === roomId);
      if (snapshot) {
        queryClient.setQueryData<CalendarData>(queryKey, {
          ...snapshot,
          bookings: snapshot.bookings.map((item) =>
            item.id === booking.id
              ? {
                  ...item,
                  roomId,
                  roomNumber: room?.roomNumber ?? null,
                  checkIn,
                  checkOut,
                  nights: Math.max(1, Math.round((parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / 86_400_000)),
                  roomTypeId: roomTypeIdOverride ?? item.roomTypeId,
                  roomTypeName: roomTypeIdOverride ? room?.roomTypeName ?? item.roomTypeName : item.roomTypeName,
                }
              : item,
          ),
        });
      }
      try {
        const result = roomId
          ? await moveBooking(booking.id, {
              roomId,
              checkIn,
              checkOut,
              ...(roomTypeIdOverride ? { roomTypeId: roomTypeIdOverride } : {}),
            })
          : await unassignBooking(booking.id);
        // Toast discipline (Opera/Mews style): the moved bar IS the success
        // feedback. Only failures surface a toast.
        if (!result.success) throw new Error(result.error);
      } catch (error) {
        if (snapshot) queryClient.setQueryData(queryKey, snapshot);
        toast.danger(error instanceof Error ? error.message : "Booking update failed");
      }
    },
    [canEdit, dateStr, days, hotelId, orgId, queryClient, rooms],
  );

  const handleRequestTypeChange = React.useCallback(
    (request: DragTypeChangeRequest) => {
      const booking = bookings.find((item) => item.id === request.bookingId);
      const room = rooms.find((item) => item.id === request.roomId);
      if (!booking || !room) return;
      setPendingTypeChange({
        ...request,
        guestName: booking.guestName ?? booking.reference,
        fromTypeName: booking.roomTypeName ?? null,
        toTypeName: room.roomTypeName,
      });
    },
    [bookings, rooms],
  );

  const confirmTypeChange = React.useCallback(() => {    const request = pendingTypeChange;
    if (!request) return;
    setPendingTypeChange(null);
    const booking = bookings.find((item) => item.id === request.bookingId);
    if (!booking) return;
    void handleTimelineChange(booking, request.roomId, request.checkIn, request.checkOut, request.toRoomTypeId);
  }, [bookings, handleTimelineChange, pendingTypeChange]);

  /** Smart auto-assignment: best vacant, type-matched, conflict-free room.
   *  Optimistic — the chip leaves the tray immediately; toast only on failure. */
  const handleAutoAssign = React.useCallback(
    async (bookingId: string) => {
      if (!canEdit) {
        toast.danger("No permission to assign bookings");
        return;
      }
      const booking = bookings.find((item) => item.id === bookingId);
      if (!booking) return;

      // Auto-assign searches ALL rooms — visibility filters are a viewing
      // aid and must never hide assignable inventory from staff.
      const target = pickBestRoom(booking, { rooms, bookings });
      if (!target) {
        toast.danger("No compatible room available for these dates");
        return;
      }

      const queryKey = qk.calendar(orgId || "", hotelId, dateStr, days);
      const snapshot = queryClient.getQueryData<CalendarData>(queryKey);
      if (snapshot) {
        queryClient.setQueryData<CalendarData>(queryKey, {
          ...snapshot,
          bookings: snapshot.bookings.map((item) =>
            item.id === bookingId ? { ...item, roomId: target.id, roomNumber: target.roomNumber } : item,
          ),
        });
      }

      const result = await assignBookingToRoom(bookingId, target.id);
      if (!result.success) {
        if (snapshot) queryClient.setQueryData(queryKey, snapshot);
        toast.danger(result.error);
      }
    },
    [bookings, canEdit, dateStr, days, hotelId, orgId, queryClient, rooms],
  );

  React.useEffect(() => {
    const report = (event: Event) => toast.danger((event as CustomEvent<string>).detail);
    window.addEventListener("roomline-calendar-error", report);
    return () => window.removeEventListener("roomline-calendar-error", report);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        navigate(-1);
      }
      if (event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        navigate(1);
      }
      if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        goToToday();
      }
      if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openNewBooking(null);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [goToToday, navigate, openNewBooking]);

  const activeFilterCount =
    roomTypeFilters.filter((filter) => !filter.visible).length +
    statusFilters.length +
    sourceFilters.length +
    (searchQuery ? 1 : 0);

  return (
    <div className="cal-wrap flex h-[calc(100vh-3rem)] min-h-0 flex-col overflow-hidden bg-background">
      <CalendarToolbar
        startDate={startDate}
        days={days}
        viewPreset={viewPreset}
        realtimeStatus={realtimeStatus}
        activeFilterCount={activeFilterCount}
        searchQuery={searchQuery}
        canBlock={canBlockProp}
        onNavigate={navigate}
        onToday={goToToday}
        onSelectDate={selectDate}
        onViewPresetChange={setViewPreset}
        onSearchQueryChange={setSearchQuery}
        onOpenFilters={() => setShowFilters(true)}
        onBlockRoom={() => {
          setEditingBlock(null);
          setBlockPrefillRoomId(undefined);
          setBlockRoomOpen(true);
        }}
        onNewBooking={() => openNewBooking(null)}
      />

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-background px-4 py-2">
          {roomTypeFilters
            .filter((f) => !f.visible)
            .map((f) => (
              <FilterChip key={f.id} label={`Type: ${f.name}`} onClick={() => toggleRoomTypeFilter(f.id)} />
            ))}
          {statusFilters.map((s) => (
            <FilterChip key={s} label={`Status: ${s.replace(/_/g, " ")}`} onClick={() => toggleStatusFilter(s)} />
          ))}
          {sourceFilters.map((s) => (
            <FilterChip key={s} label={`Source: ${s.replace(/_/g, " ")}`} onClick={() => toggleSourceFilter(s)} />
          ))}
          {searchQuery && <FilterChip label={`"${searchQuery}"`} onClick={() => setSearchQuery("")} />}
          <button
            onClick={clearFilters}
            className="ml-1 text-caption text-muted-foreground transition-colors hover:text-primary"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Scheduler */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isFetching && (
          <div className="absolute left-0 right-0 top-0 z-30 h-0.5 overflow-hidden bg-primary/10">
            <div className="h-full w-1/3 bg-primary/60" style={{ animation: "shimmer 1.5s ease-in-out infinite" }} />
          </div>
        )}

        {isError ? (
          <div className="flex h-[500px] flex-col items-center justify-center px-6 text-center" role="alert">
            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-danger/10">
              <TriangleAlert className="size-7 text-danger" />
            </div>
            <h3 className="mb-1.5 text-base font-bold text-foreground">Calendar failed to load</h3>
            <p className="mb-5 max-w-md text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Something went wrong while loading the calendar."}
            </p>
            <Button variant="outline" size="sm" onPress={() => void refetch()}>
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </div>
        ) : filteredRooms.length > 0 ? (
          <TimelineCalendar
            startDate={startDate}
            days={days}
            rooms={filteredRooms}
            bookings={visibleBookings}
            blocks={availabilityBlocks}
            canEdit={canEdit}
            hotelTimezone={hotelTimezone}
            highlightIds={newBookingIds}
            onOpenBooking={openBooking}
            onOpenBlock={setSelectedBlock}
            onChange={handleTimelineChange}
            onAutoAssign={handleAutoAssign}
            onRequestTypeChange={handleRequestTypeChange}
            onCreate={handleCellCreate}
          />
        ) : (
          <div className="flex h-[500px] flex-col items-center justify-center px-6 text-center">
            <div className="relative mb-6">
              <CalendarDays className="size-20 text-muted-foreground/20" />
              <div className="absolute -bottom-2 -right-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
                <Plus className="size-5 text-primary" />
              </div>
            </div>
            <h3 className="mb-2 text-lg font-bold text-foreground">No rooms configured yet</h3>
            <p className="mb-6 max-w-md text-sm text-muted-foreground">
              Set up your room types and rooms to start managing bookings on the calendar. You can drag and drop
              bookings between rooms, resize to change dates, and create new bookings by clicking on empty cells.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onPress={() => router.push("/dashboard/rooms/types")}>
                Set up rooms
              </Button>
              <Button variant="primary" size="sm" onPress={() => router.push("/dashboard/rooms/types/new")} className={linkButtonCn}>
                Create room type
              </Button>
            </div>

            {/* Quick tips */}
            <div className="mt-12 grid max-w-2xl grid-cols-3 gap-6">
              <Tip title="Click to create" body="Click any empty cell to book" icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />} />
              <Tip title="Drag to move" body="Drag bookings between rooms" icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />} />
              <Tip title="Resize dates" body="Drag edges to change stay" icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />} />
            </div>
          </div>
        )}
      </div>

      {/* Room-type change confirmation (industry-standard upgrade/downgrade guard) */}
      <AlertDialog.Backdrop
        isOpen={pendingTypeChange !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingTypeChange(null);
        }}
        isDismissable
        isKeyboardDismissDisabled={false}
      >
        <AlertDialog.Container placement="auto" size="md">
          <AlertDialog.Dialog className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-2xl">
            <AlertDialog.CloseTrigger className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-muted/80 text-foreground/80 shadow-xs transition-all hover:scale-105 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95" />
            <AlertDialog.Header className="gap-3 pb-1">
              <AlertDialog.Icon
                status="warning"
                className="flex size-12 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/15 text-amber-600 shadow-xs"
              >
                <CalendarDays className="size-6" />
              </AlertDialog.Icon>
              <AlertDialog.Heading className="text-lg font-bold tracking-tight text-foreground">
                Change room type?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-2.5 py-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                Move <strong className="font-semibold text-foreground">{pendingTypeChange?.guestName}</strong> from{" "}
                <strong className="font-semibold text-foreground">{pendingTypeChange?.fromTypeName ?? "current type"}</strong> to{" "}
                <strong className="font-semibold text-foreground">{pendingTypeChange?.toTypeName}</strong>?
              </p>
              <p>
                Stay {pendingTypeChange ? format(parseISO(pendingTypeChange.checkIn), "MMM d") : ""} –{" "}
                {pendingTypeChange ? format(parseISO(pendingTypeChange.checkOut), "MMM d") : ""}. The room rate changes from the next night: nights already posted keep their original rate; the new type&rsquo;s rate applies from the first unposted night. Review the folio afterwards.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex items-center justify-end gap-2.5 pt-3">
              <Button
                variant="tertiary"
                onPress={() => setPendingTypeChange(null)}
                className="h-10 cursor-pointer rounded-xl border border-border/80 bg-background/80 px-4 font-medium text-foreground shadow-xs transition-all hover:border-border hover:bg-muted/80"
              >
                Cancel
              </Button>
              <Button
                onPress={confirmTypeChange}
                className="h-10 cursor-pointer rounded-xl bg-amber-600 px-5 font-semibold text-white shadow-xs transition-all hover:bg-amber-700 active:scale-[0.98]"
              >
                Confirm type change
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <BookingDetailDrawer
        bookingId={selectedBookingId}
        open={detailPanelOpen}
        onClose={() => {
          setDetailPanelOpen(false);
          setSelectedBookingId(null);
        }}
        currency={currency}
        initialTab={detailInitialTab}
        onBookingChanged={invalidateCalendarData}
      />
      <BlockDetailDrawer
        block={selectedBlock}
        open={selectedBlock !== null}
        onClose={() => setSelectedBlock(null)}
        roomNumber={
          rooms.find((r) => r.id === selectedBlock?.roomId)?.roomNumber ?? "—"
        }
        roomTypeName={rooms.find((r) => r.id === selectedBlock?.roomId)?.roomTypeName}
        canUnblock={canUnblock}
        canEditBlocks={canBlockProp}
        onEdit={openBlockEditor}
        onUnblocked={invalidateCalendarData}
      />
      <BlockRoomSheet
        open={blockRoomOpen}
        onOpenChange={handleBlockSheetOpenChange}
        rooms={rooms}
        prefillRoomId={blockPrefillRoomId}
        editBlock={editingBlock}
        minDate={parseISO(businessDateKey)}
        onSuccess={invalidateCalendarData}
      />
      <NewBookingModal
        open={newBookingOpen}
        onOpenChange={(open) => {
          setNewBookingOpen(open);
          if (!open) {
            setNewBookingPrefill(null);
            invalidateCalendarData();
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

      <FilterDrawer
        isOpen={showFilters}
        onOpenChange={setShowFilters}
        roomTypeFilters={roomTypeFilters}
        statusFilters={statusFilters}
        sourceFilters={sourceFilters}
        onClear={clearFilters}
        onToggleRoomType={toggleRoomTypeFilter}
        onToggleStatus={toggleStatusFilter}
        onToggleSource={toggleSourceFilter}
      />
    </div>
  );
}

const linkButtonCn = "bg-primary text-primary-foreground";

function Tip({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
        <svg className="size-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {icon}
        </svg>
      </div>
      <p className="mb-1 text-xs font-semibold text-foreground">{title}</p>
      <p className="text-[10px] text-muted-foreground">{body}</p>
    </div>
  );
}

/** Removable active-filter pill. HeroUI Chip is display-only, so the press
 *  affordance lives on a reset-styled wrapper button (whole chip removes). */
function FilterChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove filter ${label}`}
      className="group inline-flex items-center rounded-full transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Chip size="sm" variant="soft" className="max-w-[180px] cursor-pointer">
        <span className="truncate capitalize">{label}</span>
      </Chip>
      <X className="mr-1 size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
    </button>
  );
}

function FilterDrawer({
  isOpen,
  onOpenChange,
  roomTypeFilters,
  statusFilters,
  sourceFilters,
  onClear,
  onToggleRoomType,
  onToggleStatus,
  onToggleSource,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  roomTypeFilters: RoomTypeFilter[];
  statusFilters: string[];
  sourceFilters: string[];
  onClear: () => void;
  onToggleRoomType: (id: string) => void;
  onToggleStatus: (s: string) => void;
  onToggleSource: (s: string) => void;
}) {
  const isMobile = useIsMobile();

  return (
    <Drawer.Backdrop
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      variant="opaque"
      className="bg-black/40 dark:bg-black/60"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          aria-labelledby="calendar-filters-title"
          className="flex h-[85dvh] max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-[0_-24px_80px_rgb(0_0_0/0.35)] md:h-dvh md:max-h-dvh md:w-[min(21rem,100vw)] md:rounded-none md:border-l md:border-border/70 md:shadow-[-24px_0_80px_rgb(0_0_0/0.18)]"
        >
          {isMobile && <Drawer.Handle className="mt-2.5 shrink-0" />}
          <Drawer.CloseTrigger className="absolute right-3.5 top-3.5 z-10 inline-flex size-11 items-center justify-center rounded-full bg-muted/70 text-muted-foreground shadow-xs backdrop-blur transition-all hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />

          <Drawer.Header className="shrink-0 flex-col items-start gap-1 border-b border-border/50 px-5 pb-4 pr-14 pt-12">
            <Drawer.Heading id="calendar-filters-title" className="text-section text-foreground">
              Filters
            </Drawer.Heading>
            <p className="text-caption text-muted-foreground">Show or hide rooms and bookings</p>
          </Drawer.Header>

          <Drawer.Body className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
            <FilterGroup title="Room Types">
              {roomTypeFilters.map((f) => (
                <FilterToggle key={f.id} label={f.name} active={f.visible} onToggle={() => onToggleRoomType(f.id)} />
              ))}
            </FilterGroup>
            <FilterGroup title="Booking Status">
              {STATUS_OPTIONS.map((s) => (
                <FilterToggle key={s} label={s.replace(/_/g, " ")} active={statusFilters.includes(s)} onToggle={() => onToggleStatus(s)} />
              ))}
            </FilterGroup>
            <FilterGroup title="Booking Source">
              {SOURCE_OPTIONS.map((s) => (
                <FilterToggle key={s} label={s.replace(/_/g, " ")} active={sourceFilters.includes(s)} onToggle={() => onToggleSource(s)} />
              ))}
            </FilterGroup>
          </Drawer.Body>

          <Drawer.Footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/50 bg-muted/10 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">
            <Button variant="ghost" size="sm" onPress={onClear} className="min-h-11 font-medium text-primary">
              Reset all
            </Button>
            <Button size="sm" slot="close" onPress={() => onOpenChange(false)} className="min-h-11 min-w-24">
              Done
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <p className="px-1 text-label font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function FilterToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle(): void }) {
  return (
    <Switch isSelected={active} onChange={onToggle} aria-label={label} className="w-full">
      <Switch.Content className="min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 transition-colors hover:bg-muted/60">
        <span className="text-body font-medium capitalize text-foreground">{label}</span>
        <Switch.Control className="shrink-0">
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
