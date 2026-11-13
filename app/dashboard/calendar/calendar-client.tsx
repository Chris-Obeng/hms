"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import {
  BedDouble,
  CalendarDays,
  CalendarOff,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { AlertDialog, Button, Drawer, Switch, toast } from "@heroui/react";
import { keepPreviousData, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { qk } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { getQueryClient } from "@/components/providers";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS, onIdle, isFresh } from "@/lib/cache/prefetch-helpers";
import {
  assignBookingToRoom,
  getCalendarData,
  moveBooking,
  previewRoomTypeMove,
  unassignBooking,
  type CalendarAvailabilityBlock,
  type CalendarBooking,
  type CalendarData,
  type CalendarRoom,
} from "./actions";
import { formatMoney } from "@/lib/money";
import type { TypeChangeRequest as DragTypeChangeRequest } from "./_components/timeline/timeline-calendar";
import { pickBestRoom } from "./_components/timeline/auto-assign";
import {
  CALENDAR_LEGEND,
  PAST_LEAD_MAX_DAYS,
  VIEW_PRESETS,
  pastLeadDays,
  type ViewPreset,
} from "./_components/calendar-helpers";
import { businessToday } from "@/lib/business-date";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { CalendarToolbar } from "./_components/calendar-toolbar";
import { TimelineCalendar } from "./_components/timeline/timeline-calendar";
import "./calendar.css";

const NewBookingModal = dynamic(
  () => import("@/components/bookings/new-booking-modal").then((mod) => mod.NewBookingModal),
  { ssr: false }
);
const BookingDetailDrawer = dynamic(
  () => import("@/components/bookings/booking-detail-drawer").then((mod) => mod.BookingDetailDrawer),
  { ssr: false }
);
const BlockDetailDrawer = dynamic(
  () => import("./_components/block-detail-drawer").then((mod) => mod.BlockDetailDrawer),
  { ssr: false }
);
const BlockRoomSheet = dynamic(
  () => import("./_components/block-room-sheet").then((mod) => mod.BlockRoomSheet),
  { ssr: false }
);

interface CalendarClientProps {
  initialData: CalendarData;
  roomTypes: { id: string; name: string; base_price: number }[];
  hotelId: string;
  hotelName: string;
  currency: string;
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

interface TypeChangeRequest extends DragTypeChangeRequest {
  guestName: string;
  fromTypeName: string | null;
  toTypeName: string;
}

function withinSeededRange(
  startDate: Date,
  days: number,
  seededStart: Date,
  seededDays: number
): boolean {
  return (
    startDate.getTime() >= seededStart.getTime() &&
    addDays(startDate, days).getTime() <= addDays(seededStart, seededDays).getTime()
  );
}

export function CalendarClient(props: CalendarClientProps) {
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

  const invalidateCalendarData = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["calendar", orgId, hotelId] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", orgId, hotelId] });
    void queryClient.invalidateQueries({ queryKey: ["bookingDetail"] });
  }, [queryClient, orgId, hotelId]);

  const businessDateKey = businessToday(hotelTimezone);

  const [seededRange] = React.useState(() => ({
    start: addDays(parseISO(businessDateKey), -PAST_LEAD_MAX_DAYS),
    days: 30 + PAST_LEAD_MAX_DAYS,
  }));
  const [viewPreset, setViewPreset] = React.useState<ViewPreset>("2 Wks");
  const days = VIEW_PRESETS.find((preset) => preset.label === viewPreset)?.days ?? 14;
  const [startDate, setStartDate] = React.useState(() =>
    addDays(parseISO(businessDateKey), -pastLeadDays(days))
  );
  const [todayAnchor, setTodayAnchor] = React.useState(0);

  const dateStr = format(startDate, "yyyy-MM-dd");
  const unblockKeysRef = React.useRef(new Map<string, readonly unknown[]>());
  const assigningRef = React.useRef(new Set<string>());
  const movingRef = React.useRef(new Set<string>());
  const [assigningIds, setAssigningIds] = React.useState<Set<string>>(() => new Set());
  const [movingIds, setMovingIds] = React.useState<Set<string>>(() => new Set());
  const rateRadioRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleBlockUnblocked = React.useCallback(
    async (optimisticDeletedId?: string, restoreBlock?: CalendarAvailabilityBlock) => {
      if (optimisticDeletedId) {
        const queryKey = qk.calendar(orgId || "", hotelId, dateStr, days);
        unblockKeysRef.current.set(optimisticDeletedId, queryKey);
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData<CalendarData>(queryKey, (old) =>
          old
            ? {
                ...old,
                availabilityBlocks: old.availabilityBlocks.filter(
                  (b) => b.id !== optimisticDeletedId
                ),
              }
            : old
        );
        return;
      }
      if (restoreBlock) {
        const savedKey =
          unblockKeysRef.current.get(restoreBlock.id) ??
          qk.calendar(orgId || "", hotelId, dateStr, days);
        unblockKeysRef.current.delete(restoreBlock.id);
        queryClient.setQueryData<CalendarData>(savedKey, (old) => {
          if (!old) return old;
          if (old.availabilityBlocks.some((b) => b.id === restoreBlock.id)) return old;
          return {
            ...old,
            availabilityBlocks: [...old.availabilityBlocks, restoreBlock],
          };
        });
        return;
      }
      invalidateCalendarData();
    },
    [dateStr, days, hotelId, invalidateCalendarData, orgId, queryClient]
  );

  const [newBookingIds, setNewBookingIds] = React.useState<Set<string>>(new Set());
  const knownBookingIdsRef = React.useRef(
    new Set(initialData.bookings.map((booking) => booking.id))
  );

  const canReuseSeed = React.useMemo(
    () => withinSeededRange(startDate, days, seededRange.start, seededRange.days),
    [days, seededRange, startDate]
  );

  const {
    data: calendarData,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.calendar(orgId || "", hotelId, dateStr, days),
    queryFn: () => getCalendarData(dateStr, days),
    enabled: !!orgId,
    initialData: canReuseSeed ? initialData : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const rooms = React.useMemo(() => calendarData?.rooms ?? [], [calendarData]);
  const bookings = React.useMemo(() => calendarData?.bookings ?? [], [calendarData]);
  const availabilityBlocks = React.useMemo(
    () => calendarData?.availabilityBlocks ?? [],
    [calendarData]
  );

  const [roomTypeFilters, setRoomTypeFilters] = React.useState<RoomTypeFilter[]>(() =>
    roomTypes.map((roomType) => ({ id: roomType.id, name: roomType.name, visible: true }))
  );
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = React.useState<string[]>([]);
  const [showFilters, setShowFilters] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [realtimeStatus, setRealtimeStatus] = React.useState<"live" | "reconnecting">(
    "reconnecting"
  );

  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = React.useState(false);
  const [detailInitialTab, setDetailInitialTab] = React.useState<"overview" | "payments">(
    "overview"
  );
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
  const [typeChangeRateChoice, setTypeChangeRateChoice] = React.useState<"keep" | "reprice">(
    "keep"
  );

  const typeChangePreviewQuery = useQuery({
    queryKey: [
      "calendar-move-preview",
      hotelId,
      pendingTypeChange?.bookingId ?? null,
      pendingTypeChange?.toRoomTypeId ?? null,
      pendingTypeChange?.checkIn ?? null,
      pendingTypeChange?.checkOut ?? null,
    ],
    enabled: pendingTypeChange !== null,
    staleTime: 0,
    retry: 1,
    queryFn: async () => {
      const request = pendingTypeChange;
      if (!request) throw new Error("No pending move");
      const result = await previewRoomTypeMove(
        request.bookingId,
        request.toRoomTypeId,
        request.checkIn,
        request.checkOut
      );
      if (!result.success) throw new Error(result.error);
      return result.preview;
    },
  });

  const typeChangePreview = typeChangePreviewQuery.data ?? null;
  const typeChangePreviewBusy = pendingTypeChange !== null && typeChangePreviewQuery.isPending;
  const typeChangeBlocked = typeChangePreview?.noRatePlan === true;
  const repriceUnavailable =
    typeChangePreviewBusy ||
    typeChangePreviewQuery.isError ||
    typeChangeBlocked ||
    (typeChangePreview?.unpricedNights ?? 0) > 0;

  const visibleRoomTypeIds = React.useMemo(
    () => new Set(roomTypeFilters.filter((filter) => filter.visible).map((filter) => filter.id)),
    [roomTypeFilters]
  );

  const filteredRooms = React.useMemo(
    () => rooms.filter((room) => visibleRoomTypeIds.has(room.roomTypeId)),
    [rooms, visibleRoomTypeIds]
  );

  const visibleBookings = React.useMemo(
    () =>
      bookings.filter(
        (b) =>
          (!b.roomId || filteredRooms.some((r) => r.id === b.roomId)) &&
          (!statusFilters.length || statusFilters.includes(b.status)) &&
          (!sourceFilters.length || sourceFilters.includes(b.source ?? "")) &&
          (!deferredSearchQuery.trim() ||
            `${b.guestName} ${b.reference} ${b.roomNumber}`
              .toLowerCase()
              .includes(deferredSearchQuery.toLowerCase()))
      ),
    [bookings, deferredSearchQuery, filteredRooms, sourceFilters, statusFilters]
  );

  const calendarPrefetchEnabled = !!orgId;
  const calendarIdleKey = React.useMemo(
    () =>
      calendarPrefetchEnabled
        ? visibleBookings
            .slice(0, CAPS.clientIdle)
            .map((b) => b.id.replace(/:v\d+$/, ""))
            .join(",")
        : "",
    [visibleBookings, calendarPrefetchEnabled]
  );
  const observedCalendarRef = React.useRef<Set<string>>(new Set());
  const calendarObsRef = React.useRef<IntersectionObserver | null>(null);
  const getCalendarObserver = React.useCallback(() => {
    if (calendarObsRef.current) return calendarObsRef.current;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null;
    calendarObsRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.bookingId;
          if (!id || observedCalendarRef.current.has(id)) continue;
          observedCalendarRef.current.add(id);
          calendarObsRef.current?.unobserve(e.target);
          if (isFresh(queryClient, bookingDetailCache.key(id))) continue;
          if (observedCalendarRef.current.size > CAPS.serverWarm + CAPS.viewportAhead) continue;
          void queryClient.prefetchQuery(bookingDetailCache.options(id));
        }
      },
      { rootMargin: "400px" }
    );
    return calendarObsRef.current;
  }, [queryClient]);

  const attachCalendarBarRef = React.useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const id = (el as HTMLElement).dataset.bookingId;
      if (!id || observedCalendarRef.current.has(id)) return;
      getCalendarObserver()?.observe(el);
    },
    [getCalendarObserver]
  );
  React.useEffect(() => () => calendarObsRef.current?.disconnect(), []);

  const dateRangeKey = `${dateStr}_${days}`;
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

  React.useEffect(() => {
    if (!calendarPrefetchEnabled || !calendarIdleKey) return;
    const ids = calendarIdleKey.split(",").filter(Boolean);
    return onIdle(() => {
      for (const id of ids) {
        if (isFresh(queryClient, bookingDetailCache.key(id))) continue;
        void queryClient.prefetchQuery(bookingDetailCache.options(id));
      }
    });
  }, [calendarIdleKey, calendarPrefetchEnabled, queryClient]);

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
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", orgId, hotelId],
        refetchType: "active",
      });
      void queryClient.invalidateQueries({ queryKey: ["bookingDetail"], refetchType: "active" });
    };

    const batchRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(invalidate, 75);
    };

    const refreshRealtimeAuth = async () => {
      try {
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
      if (resubscribeAttempts === 0) reportStatus(status, err);
      if (cancelled || resubscribeAttempts >= 5) return;
      resubscribeAttempts += 1;
      retryTimer = window.setTimeout(async () => {
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
          batchRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "availability_blocks",
            filter: `hotel_id=eq.${hotelId}`,
          },
          batchRefresh
        );

    const openChannel = () => {
      if (channel) supabase.removeChannel(channel);
      channel = buildChannel().subscribe(handleStatus);
    };

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

  const navigate = React.useCallback(
    (direction: -1 | 1) => {
      setStartDate((previous) => addDays(previous, direction * days));
    },
    [days]
  );

  const goToToday = React.useCallback(() => {
    setStartDate(addDays(parseISO(businessDateKey), -pastLeadDays(days)));
    setTodayAnchor((n) => n + 1);
  }, [businessDateKey, days]);

  const selectDate = React.useCallback((date: Date) => setStartDate(date), []);

  const changeViewPreset = React.useCallback(
    (preset: ViewPreset) => {
      setViewPreset(preset);
      if (startDate.getTime() !== addDays(parseISO(businessDateKey), -pastLeadDays(days)).getTime())
        return;
      const nextDays = VIEW_PRESETS.find((p) => p.label === preset)?.days ?? 14;
      setStartDate(addDays(parseISO(businessDateKey), -pastLeadDays(nextDays)));
      setTodayAnchor((n) => n + 1);
    },
    [businessDateKey, days, startDate]
  );

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
      previous.includes(status)
        ? previous.filter((item) => item !== status)
        : [...previous, status]
    );
  }, []);

  const toggleSourceFilter = React.useCallback((source: string) => {
    setSourceFilters((previous) =>
      previous.includes(source)
        ? previous.filter((item) => item !== source)
        : [...previous, source]
    );
  }, []);

  const openBooking = React.useCallback(
    (bookingId: string) => {
      const raw = bookingId.replace(/:v\d+$/, "");
      void (async () => {
        const [{ bookingDetailCache }, { isFresh }] = await Promise.all([
          import("@/lib/cache/booking-detail-cache"),
          import("@/lib/cache/prefetch-helpers"),
        ]);
        if (!isFresh(queryClient, bookingDetailCache.key(raw))) {
          void queryClient.prefetchQuery(bookingDetailCache.options(raw));
        }
      })();
      setDetailInitialTab("overview");
      setSelectedBookingId(raw);
      setDetailPanelOpen(true);
    },
    [queryClient]
  );

  const openNewBooking = React.useCallback(
    (prefill: typeof newBookingPrefill) => {
      if (!canEdit) {
        toast.danger("No permission to create bookings");
        return;
      }
      setNewBookingPrefill(prefill);
      setNewBookingOpen(true);
    },
    [canEdit]
  );

  const openBlockEditor = React.useCallback((block: CalendarAvailabilityBlock) => {
    setEditingBlock(block);
    setBlockRoomOpen(true);
  }, []);

  const handleBlockSheetOpenChange = React.useCallback((open: boolean) => {
    setBlockRoomOpen(open);
    if (!open) {
      setEditingBlock(null);
      setBlockPrefillRoomId(undefined);
    }
  }, []);

  const handleCellCreate = React.useCallback(
    (room: CalendarRoom, date: string) => {
      openNewBooking({
        roomId: room.id,
        roomTypeId: room.roomTypeId,
        checkIn: parseISO(date),
        checkOut: addDays(parseISO(date), 1),
      });
    },
    [openNewBooking]
  );

  const handleTimelineChange = React.useCallback(
    async (
      booking: CalendarBooking,
      roomId: string | null,
      checkIn: string,
      checkOut: string,
      roomTypeIdOverride?: string,
      keepRates?: boolean
    ) => {
      if (!canEdit) {
        toast.danger("No permission to update bookings");
        return;
      }
      if (movingRef.current.has(booking.id)) return;
      movingRef.current.add(booking.id);
      setMovingIds((prev) => new Set(prev).add(booking.id));
      const queryKey = qk.calendar(orgId || "", hotelId, dateStr, days);
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<CalendarData>(queryKey);
      const previousItem = snapshot?.bookings.find((item) => item.id === booking.id);
      const room = rooms.find((item) => item.id === roomId);
      queryClient.setQueryData<CalendarData>(queryKey, (old) =>
        old
          ? {
              ...old,
              bookings: old.bookings.map((item) =>
                item.id === booking.id
                  ? {
                      ...item,
                      roomId,
                      roomNumber: room?.roomNumber ?? null,
                      checkIn,
                      checkOut,
                      nights: Math.max(
                        1,
                        Math.round(
                          (parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / 86_400_000
                        )
                      ),
                      roomTypeId: roomTypeIdOverride ?? item.roomTypeId,
                      roomTypeName: roomTypeIdOverride
                        ? room?.roomTypeName ?? item.roomTypeName
                        : item.roomTypeName,
                    }
                  : item
              ),
            }
          : old
      );
      try {
        const result = roomId
          ? await moveBooking(booking.id, {
              roomId,
              checkIn,
              checkOut,
              ...(roomTypeIdOverride ? { roomTypeId: roomTypeIdOverride } : {}),
              ...(keepRates ? { keepRates: true } : {}),
            })
          : await unassignBooking(booking.id);
        if (!result.success) throw new Error(result.error);
      } catch (error) {
        if (previousItem) {
          queryClient.setQueryData<CalendarData>(queryKey, (old) =>
            old
              ? {
                  ...old,
                  bookings: old.bookings.map((item) =>
                    item.id === booking.id ? previousItem : item
                  ),
                }
              : old
          );
        }
        toast.danger(error instanceof Error ? error.message : "Booking update failed");
      } finally {
        movingRef.current.delete(booking.id);
        setMovingIds((prev) => {
          const next = new Set(prev);
          next.delete(booking.id);
          return next;
        });
        invalidateCalendarData();
      }
    },
    [canEdit, dateStr, days, hotelId, invalidateCalendarData, orgId, queryClient, rooms]
  );

  const handleRequestTypeChange = React.useCallback(
    (request: DragTypeChangeRequest) => {
      const booking = bookings.find((item) => item.id === request.bookingId);
      const room = rooms.find((item) => item.id === request.roomId);
      if (!booking || !room) return;
      setTypeChangeRateChoice("keep");
      setPendingTypeChange({
        ...request,
        guestName: booking.guestName ?? booking.reference,
        fromTypeName: booking.roomTypeName ?? null,
        toTypeName: room.roomTypeName,
      });
    },
    [bookings, rooms]
  );

  const confirmTypeChange = React.useCallback(() => {
    const request = pendingTypeChange;
    if (!request) return;
    setPendingTypeChange(null);
    const booking = bookings.find((item) => item.id === request.bookingId);
    if (!booking) return;
    void handleTimelineChange(
      booking,
      request.roomId,
      request.checkIn,
      request.checkOut,
      request.toRoomTypeId,
      typeChangeRateChoice === "keep"
    );
  }, [bookings, handleTimelineChange, pendingTypeChange, typeChangeRateChoice]);

  const handleAutoAssign = React.useCallback(
    async (bookingId: string) => {
      if (!canEdit) {
        toast.danger("No permission to assign bookings");
        return;
      }
      if (assigningRef.current.has(bookingId)) return;
      const booking = bookings.find((item) => item.id === bookingId);
      if (!booking) return;

      const target = pickBestRoom(booking, { rooms, bookings });
      if (!target) {
        toast.danger("No compatible room available for these dates");
        return;
      }

      assigningRef.current.add(bookingId);
      setAssigningIds((prev) => new Set(prev).add(bookingId));
      const queryKey = qk.calendar(orgId || "", hotelId, dateStr, days);
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<CalendarData>(queryKey);
      const previousItem = snapshot?.bookings.find((item) => item.id === bookingId);

      queryClient.setQueryData<CalendarData>(queryKey, (old) =>
        old
          ? {
              ...old,
              bookings: old.bookings.map((item) =>
                item.id === bookingId
                  ? { ...item, roomId: target.id, roomNumber: target.roomNumber }
                  : item
              ),
            }
          : old
      );

      try {
        const result = await assignBookingToRoom(bookingId, target.id);
        if (!result.success) throw new Error(result.error);
      } catch (err) {
        if (previousItem) {
          queryClient.setQueryData<CalendarData>(queryKey, (old) =>
            old
              ? {
                  ...old,
                  bookings: old.bookings.map((item) =>
                    item.id === bookingId ? previousItem : item
                  ),
                }
              : old
          );
        }
        toast.danger(err instanceof Error ? err.message : "Assignment failed — try again");
      } finally {
        assigningRef.current.delete(bookingId);
        setAssigningIds((prev) => {
          const next = new Set(prev);
          next.delete(bookingId);
          return next;
        });
        invalidateCalendarData();
      }
    },
    [bookings, canEdit, dateStr, days, hotelId, invalidateCalendarData, orgId, queryClient, rooms]
  );

  React.useEffect(() => {
    const report = (event: Event) => toast.danger((event as CustomEvent<string>).detail);
    window.addEventListener("roomline-calendar-error", report);
    return () => window.removeEventListener("roomline-calendar-error", report);
  }, []);

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;
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

  const activeDrawerFilterCount =
    roomTypeFilters.filter((filter) => !filter.visible).length +
    statusFilters.length +
    sourceFilters.length;

  const hasAnyActiveFilter = activeDrawerFilterCount > 0 || Boolean(searchQuery.trim());

  return (
    <div className="cal-wrap flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden bg-background">
      <CalendarToolbar
        startDate={startDate}
        days={days}
        viewPreset={viewPreset}
        realtimeStatus={realtimeStatus}
        activeFilterCount={activeDrawerFilterCount}
        searchQuery={searchQuery}
        canEdit={canEdit}
        canBlock={canBlockProp}
        onNavigate={navigate}
        onToday={goToToday}
        onSelectDate={selectDate}
        onViewPresetChange={changeViewPreset}
        onSearchQueryChange={setSearchQuery}
        onOpenFilters={() => setShowFilters(true)}
        onNewBooking={() => openNewBooking(null)}
        onBlockRoom={() => {
          setEditingBlock(null);
          setBlockPrefillRoomId(undefined);
          setBlockRoomOpen(true);
        }}
      />

      {/* Active filter strip */}
      {hasAnyActiveFilter && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 md:px-4">
          {roomTypeFilters
            .filter((f) => !f.visible)
            .map((f) => (
              <FilterChip
                key={f.id}
                label={`Hidden: ${f.name}`}
                onClick={() => toggleRoomTypeFilter(f.id)}
              />
            ))}
          {statusFilters.map((s) => (
            <FilterChip
              key={s}
              label={`Status: ${s.replace(/_/g, " ")}`}
              onClick={() => toggleStatusFilter(s)}
            />
          ))}
          {sourceFilters.map((s) => (
            <FilterChip
              key={s}
              label={`Source: ${s.replace(/_/g, " ")}`}
              onClick={() => toggleSourceFilter(s)}
            />
          ))}
          {searchQuery.trim() && (
            <FilterChip label={`“${searchQuery.trim()}”`} onClick={() => setSearchQuery("")} />
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="ui-press ml-1 inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-7 [@media(hover:hover)_and_(pointer:fine)]:hover:text-primary"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Scheduler */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isFetching && (
          <div className="absolute left-0 right-0 top-0 z-30 h-1 overflow-hidden bg-primary/10">
            <div
              className="h-full w-1/3 bg-primary/60 motion-reduce:w-full motion-reduce:animate-none!"
              style={{ animation: "shimmer 1.5s ease-in-out infinite" }}
            />
          </div>
        )}

        {isError ? (
          <div
            className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center"
            role="alert"
          >
            <span className="mb-3 grid size-11 place-items-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">
              Couldn&apos;t load the calendar
            </h2>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Check your connection and try again."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ui-press mt-4 rounded-xl"
              onPress={() => void refetch()}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
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
            todayAnchor={todayAnchor}
            highlightIds={newBookingIds}
            assigningIds={assigningIds}
            movingIds={movingIds}
            onOpenBooking={openBooking}
            onOpenBlock={setSelectedBlock}
            onChange={handleTimelineChange}
            onAutoAssign={handleAutoAssign}
            onRequestTypeChange={handleRequestTypeChange}
            onCreate={handleCellCreate}
            attachBarRef={attachCalendarBarRef}
          />
        ) : rooms.length > 0 ? (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 grid size-11 place-items-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
              <SlidersHorizontal className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">
              All room types are hidden
            </h2>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Turn on at least one room type in filters to see the room rack.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ui-press mt-4 rounded-xl"
              onPress={clearFilters}
            >
              Reset filters
            </Button>
          </div>
        ) : (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 grid size-11 place-items-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
              <BedDouble className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">No rooms configured</h2>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Add your room types and room numbers to manage stays on the timeline.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="ui-press rounded-xl"
                onPress={() => router.push("/dashboard/rooms")}
              >
                Manage rooms
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="ui-press rounded-xl"
                onPress={() => router.push("/dashboard/rooms/types/new")}
              >
                New room type
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Room-type change confirmation */}
      <AlertDialog.Backdrop
        variant="blur"
        isOpen={pendingTypeChange !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingTypeChange(null);
        }}
        isDismissable
        isKeyboardDismissDisabled={false}
      >
        <AlertDialog.Container placement="center" size="md">
          <AlertDialog.Dialog className="relative overflow-hidden rounded-[24px] border border-border/70 bg-card p-6 shadow-2xl outline-none sm:max-w-[440px]">
            <AlertDialog.Header className="flex items-center gap-3 pb-1">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/12 text-amber-700"
              >
                <CalendarDays className="size-5" />
              </span>
              <div className="min-w-0">
                <AlertDialog.Heading className="text-base font-semibold text-foreground">
                  Change room type?
                </AlertDialog.Heading>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {pendingTypeChange?.guestName} ·{" "}
                  {pendingTypeChange?.fromTypeName ?? "Current"} → {pendingTypeChange?.toTypeName} (
                  {pendingTypeChange ? format(parseISO(pendingTypeChange.checkIn), "MMM d") : ""} –{" "}
                  {pendingTypeChange ? format(parseISO(pendingTypeChange.checkOut), "MMM d") : ""})
                </p>
              </div>
            </AlertDialog.Header>

            <AlertDialog.Body className="space-y-3 py-3 text-sm">
              <div
                role="radiogroup"
                aria-label="Rate for the moved stay"
                onKeyDown={(e) => {
                  if (
                    e.key === "ArrowDown" ||
                    e.key === "ArrowRight" ||
                    e.key === "ArrowUp" ||
                    e.key === "ArrowLeft"
                  ) {
                    e.preventDefault();
                    if (typeChangeRateChoice === "keep" && !repriceUnavailable) {
                      setTypeChangeRateChoice("reprice");
                      rateRadioRefs.current[1]?.focus();
                    } else if (typeChangeRateChoice === "reprice") {
                      setTypeChangeRateChoice("keep");
                      rateRadioRefs.current[0]?.focus();
                    }
                  }
                }}
                className="space-y-2"
              >
                <button
                  ref={(el) => {
                    rateRadioRefs.current[0] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={typeChangeRateChoice === "keep"}
                  tabIndex={typeChangeRateChoice === "keep" ? 0 : -1}
                  onClick={() => setTypeChangeRateChoice("keep")}
                  className={cn(
                    "ui-press flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    typeChangeRateChoice === "keep"
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary/20"
                      : "border-border bg-background [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/35"
                  )}
                >
                  <span className="flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-semibold text-foreground">
                        Keep current rate
                      </span>
                      {typeChangePreview && (
                        <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">
                          {formatMoney(
                            typeChangePreview.currentTotalMinor,
                            typeChangePreview.currency
                          )}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Keep existing nightly prices
                    </span>
                  </span>
                </button>

                <button
                  ref={(el) => {
                    rateRadioRefs.current[1] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={typeChangeRateChoice === "reprice"}
                  tabIndex={typeChangeRateChoice === "reprice" ? 0 : -1}
                  disabled={repriceUnavailable}
                  onClick={() => setTypeChangeRateChoice("reprice")}
                  className={cn(
                    "ui-press flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55",
                    typeChangeRateChoice === "reprice"
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary/20"
                      : "border-border bg-background [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/35"
                  )}
                >
                  <span className="flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-semibold text-foreground">
                        Reprice at {pendingTypeChange?.toTypeName} rate
                      </span>
                      {typeChangePreview?.repriceTotalMinor != null && (
                        <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">
                          {formatMoney(
                            typeChangePreview.repriceTotalMinor,
                            typeChangePreview.currency
                          )}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {typeChangePreviewBusy
                        ? "Checking target rates…"
                        : typeChangePreviewQuery.isError
                          ? "Rate preview unavailable — will re-verify on confirm"
                          : typeChangeBlocked
                            ? `No active rate plan on ${pendingTypeChange?.toTypeName}`
                            : (typeChangePreview?.unpricedNights ?? 0) > 0
                              ? `${typeChangePreview?.unpricedNights} nights lack pricing`
                              : typeChangePreview && typeChangePreview.manualNights > 0
                                ? `Replaces ${typeChangePreview.manualNights} custom-priced night${typeChangePreview.manualNights === 1 ? "" : "s"}`
                                : `Apply ${pendingTypeChange?.toTypeName} rate plan`}
                    </span>
                  </span>
                </button>
              </div>

              {typeChangeBlocked && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                  <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden />
                  Set up an active rate plan on {pendingTypeChange?.toTypeName} first.
                </p>
              )}
            </AlertDialog.Body>

            <AlertDialog.Footer className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="tertiary"
                onPress={() => setPendingTypeChange(null)}
                className="ui-press h-10 rounded-xl border border-border/70 bg-background px-4 text-xs font-semibold text-foreground"
              >
                Cancel
              </Button>
              <Button
                onPress={confirmTypeChange}
                isDisabled={
                  typeChangePreviewBusy ||
                  typeChangeBlocked ||
                  (typeChangeRateChoice === "reprice" && repriceUnavailable)
                }
                className="ui-press h-10 rounded-xl bg-amber-600 px-4 text-xs font-semibold text-white [@media(hover:hover)_and_(pointer:fine)]:hover:bg-amber-700"
              >
                Confirm move
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
        roomNumber={rooms.find((r) => r.id === selectedBlock?.roomId)?.roomNumber ?? "—"}
        roomTypeName={rooms.find((r) => r.id === selectedBlock?.roomId)?.roomTypeName}
        canUnblock={canUnblock}
        canEditBlocks={canBlockProp}
        onEdit={openBlockEditor}
        onUnblocked={handleBlockUnblocked}
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
        rooms={rooms}
        currency={currency}
        prefillRoomTypeId={newBookingPrefill?.roomTypeId}
        prefillRoomId={newBookingPrefill?.roomId}
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
        viewPreset={viewPreset}
        onViewPresetChange={changeViewPreset}
        canBlock={canBlockProp}
        onBlockRoom={() => {
          setShowFilters(false);
          setEditingBlock(null);
          setBlockPrefillRoomId(undefined);
          setBlockRoomOpen(true);
        }}
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

function FilterChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove filter ${label}`}
      className="ui-press inline-flex min-h-9 max-w-[212px] cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-7 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60"
    >
      <span className="truncate capitalize">{label}</span>
      <X className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function FilterDrawer({
  isOpen,
  onOpenChange,
  viewPreset,
  onViewPresetChange,
  canBlock,
  onBlockRoom,
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
  viewPreset: ViewPreset;
  onViewPresetChange: (preset: ViewPreset) => void;
  canBlock: boolean;
  onBlockRoom: () => void;
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
      className="bg-black/40"
    >
      <Drawer.Content placement={isMobile ? "bottom" : "right"}>
        <Drawer.Dialog
          aria-labelledby="calendar-filters-title"
          className="flex h-[84dvh] max-h-[84dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-background shadow-2xl md:h-dvh md:max-h-dvh md:w-[min(21rem,100vw)] md:rounded-none md:border-l md:border-border/70"
        >
          {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}
          <Drawer.CloseTrigger className="ui-press absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />

          <Drawer.Header className="shrink-0 flex-row items-center justify-between border-b border-border/50 px-5 pb-4 pr-14 pt-5">
            <Drawer.Heading id="calendar-filters-title" className="text-[15px] font-semibold text-foreground">
              View &amp; filters
            </Drawer.Heading>
          </Drawer.Header>

          <Drawer.Body className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-4">
            {/* Mobile-only view horizon, block room & color legend */}
            <div className="space-y-4 md:hidden">
              <FilterGroup title="Horizon">
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-1">
                  {VIEW_PRESETS.map((preset) => {
                    const active = viewPreset === preset.label;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onViewPresetChange(preset.label)}
                        className={cn(
                          "ui-press min-h-10 cursor-pointer rounded-lg text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "bg-card font-semibold text-foreground shadow-2xs ring-1 ring-border/60"
                            : "text-muted-foreground"
                        )}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </FilterGroup>

              {canBlock && (
                <button
                  type="button"
                  onClick={onBlockRoom}
                  className="ui-press flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/70 bg-card px-4 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CalendarOff className="size-4 text-muted-foreground" aria-hidden="true" />
                  Block room dates
                </button>
              )}
            </div>

            <FilterGroup title="Room types">
              {roomTypeFilters.map((f) => (
                <FilterToggle
                  key={f.id}
                  label={f.name}
                  active={f.visible}
                  onToggle={() => onToggleRoomType(f.id)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Booking status">
              {STATUS_OPTIONS.map((s) => (
                <FilterToggle
                  key={s}
                  label={s.replace(/_/g, " ")}
                  active={statusFilters.includes(s)}
                  onToggle={() => onToggleStatus(s)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Booking source">
              {SOURCE_OPTIONS.map((s) => (
                <FilterToggle
                  key={s}
                  label={s.replace(/_/g, " ")}
                  active={sourceFilters.includes(s)}
                  onToggle={() => onToggleSource(s)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Status colors">
              <ul className="grid grid-cols-2 gap-2 pt-1">
                {CALENDAR_LEGEND.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className="size-3 shrink-0 rounded-sm"
                      style={
                        item.type === "block"
                          ? {
                              background:
                                "repeating-linear-gradient(135deg, color-mix(in oklch, var(--cal-closure) 25%, transparent) 0 3px, color-mix(in oklch, var(--cal-closure) 50%, transparent) 3px 6px)",
                            }
                          : { background: item.color }
                      }
                    />
                    <span className="truncate">{item.label}</span>
                  </li>
                ))}
              </ul>
            </FilterGroup>
          </Drawer.Body>

          <Drawer.Footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/50 bg-muted/10 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">
            <Button
              variant="ghost"
              size="sm"
              onPress={onClear}
              className="ui-press min-h-10 rounded-xl font-medium text-primary"
            >
              Reset all
            </Button>
            <Button
              size="sm"
              slot="close"
              onPress={() => onOpenChange(false)}
              className="ui-press min-h-10 min-w-24 rounded-xl font-semibold"
            >
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
    <section className="space-y-2">
      <p className="px-1 text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function FilterToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle(): void;
}) {
  return (
    <Switch isSelected={active} onChange={onToggle} aria-label={label} className="w-full">
      <Switch.Content className="min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60">
        <span className="text-sm font-medium capitalize text-foreground">{label}</span>
        <Switch.Control className="shrink-0">
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
