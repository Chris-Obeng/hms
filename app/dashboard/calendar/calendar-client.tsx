"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { BedDouble, CalendarOff, RefreshCw, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { AlertDialog, Button, Drawer, Radio, RadioGroup, Switch, toast } from "@heroui/react";
import { keepPreviousData, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { qk } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { getQueryClient } from "@/components/providers";
import { bookingDetailCache } from "@/lib/cache/booking-detail-cache";
import { CAPS, onIdle, isFresh } from "@/lib/cache/prefetch-helpers";
import { getSourceLabel, getStatusLabel } from "@/lib/booking-status";
import { toStoredBlockRange } from "@/lib/calendar-domain";
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
import {
  PENDING_BLOCK_PREFIX,
  type TypeChangeRequest as DragTypeChangeRequest,
} from "./_components/timeline/timeline-calendar";
import { pickBestRoom } from "./_components/timeline/auto-assign";
import {
  VIEW_PRESETS,
  pastLeadDays,
  type ViewPreset,
} from "./_components/calendar-helpers";
import {
  applyBlockOverlay,
  applyBookingPatches,
  buildBookingPatch,
  pruneSettled,
  withEntry,
  withoutEntry,
  type BookingPatch,
  type PendingEntry,
} from "./_components/calendar-overlay";
import type { BlockSheetResult } from "./_components/block-room-sheet";
import { businessToday } from "@/lib/business-date";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  CalendarHorizonToggle,
  CalendarLegendList,
  CalendarToolbar,
} from "./_components/calendar-toolbar";
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

/** The window the server read `initialData` for, and when. */
export interface CalendarSeed {
  /** yyyy-MM-dd */
  startDate: string;
  days: number;
  /** Server Date.now() just after the read. */
  fetchedAt: number;
}

interface CalendarClientProps {
  initialData: CalendarData;
  seed: CalendarSeed;
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

type PendingMap<T> = Map<string, PendingEntry<T>>;

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
  seed,
  hotelId,
  currency,
  hotelTimezone,
  canEdit,
  canBlock,
  canUnblock,
}: CalendarClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orgId } = useAuth();
  const calendarScope = React.useMemo(() => ["calendar", orgId, hotelId] as const, [orgId, hotelId]);

  // The server-rendered seed may stand in for any view inside its range until
  // the first change: after that it is stale and views load fresh data.
  const [seedValid, setSeedValid] = React.useState(true);
  // When the seed was read. The server's clock may run ahead of this one, so
  // never stamp it later than now: a seed stamped in the future would count as
  // newer than an edit confirmed a moment later. A seed restored from the
  // router cache keeps its real age and refetches.
  const [seedUpdatedAt] = React.useState(() => Math.min(seed.fetchedAt, Date.now()));

  const invalidateCalendarData = React.useCallback(() => {
    setSeedValid(false);
    void queryClient.invalidateQueries({ queryKey: calendarScope });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", orgId, hotelId] });
    void queryClient.invalidateQueries({ queryKey: ["bookingDetail"] });
  }, [calendarScope, hotelId, orgId, queryClient]);

  /** After a confirmed write: drop in-flight reads (they may predate the
   *  write), then refetch. Overlay entries stamped before this call stay
   *  applied until a read that started after it lands. */
  const resyncAfterWrite = React.useCallback(() => {
    void queryClient
      .cancelQueries({ queryKey: calendarScope })
      .finally(() => invalidateCalendarData());
  }, [calendarScope, invalidateCalendarData, queryClient]);

  const businessDateKey = businessToday(hotelTimezone);

  // The range the server actually read, not one recomputed here: the two
  // "today"s differ when render and hydration straddle midnight.
  const [seededRange] = React.useState(() => ({ start: parseISO(seed.startDate), days: seed.days }));
  const [viewPreset, setViewPreset] = React.useState<ViewPreset>("2 weeks");
  const days = VIEW_PRESETS.find((preset) => preset.label === viewPreset)?.days ?? 14;
  const [startDate, setStartDate] = React.useState(() =>
    addDays(parseISO(businessDateKey), -pastLeadDays(days))
  );
  const [todayAnchor, setTodayAnchor] = React.useState(0);
  const todayStart = addDays(parseISO(businessDateKey), -pastLeadDays(days));
  const isAtToday = startDate.getTime() === todayStart.getTime();

  const dateStr = format(startDate, "yyyy-MM-dd");

  const canReuseSeed =
    seedValid && withinSeededRange(startDate, days, seededRange.start, seededRange.days);

  const {
    data: calendarData,
    dataUpdatedAt,
    isFetching,
    isError,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: qk.calendar(orgId || "", hotelId, dateStr, days),
    queryFn: () => getCalendarData(dateStr, days),
    enabled: !!orgId,
    initialData: canReuseSeed ? initialData : undefined,
    initialDataUpdatedAt: canReuseSeed ? seedUpdatedAt : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    // Backstop for what Realtime cannot deliver: a filtered subscription never
    // receives DELETE events (a colleague removing a block), and a dropped
    // socket loses whatever changed meanwhile. Only while the tab is visible.
    refetchInterval: 60 * 1000,
  });

  // Timestamp of the data on screen. During a range switch TanStack shows the
  // previous range as placeholder data but reports the new range's
  // dataUpdatedAt (0); overlay entries are compared with the placeholder's own
  // timestamp, so an edit the placeholder already contains is not re-applied
  // (a saved block would otherwise be drawn twice).
  const shownUpdatedAt = React.useMemo(() => {
    if (!isPlaceholderData) return dataUpdatedAt;
    const source = queryClient
      .getQueryCache()
      .findAll({ queryKey: calendarScope })
      .find((query) => query.state.data === calendarData);
    return source?.state.dataUpdatedAt ?? 0;
  }, [calendarData, calendarScope, dataUpdatedAt, isPlaceholderData, queryClient]);

  /** Oldest timestamp among cached ranges. A settled entry is pruned only once
   *  every cached range has caught up, so switching back to an older cached
   *  range never shows a saved bar in its old place. */
  const oldestCachedUpdatedAt = React.useCallback(() => {
    let oldest = Number.POSITIVE_INFINITY;
    for (const query of queryClient.getQueryCache().findAll({ queryKey: calendarScope })) {
      if (query.state.data !== undefined) oldest = Math.min(oldest, query.state.dataUpdatedAt);
    }
    return oldest;
  }, [calendarScope, queryClient]);

  // ── Optimistic overlay (see calendar-overlay.ts) ─────────────────────
  const [bookingPatches, setBookingPatches] = React.useState<PendingMap<BookingPatch>>(
    () => new Map()
  );
  const [hiddenBlocks, setHiddenBlocks] = React.useState<PendingMap<null>>(() => new Map());
  const [blockUpserts, setBlockUpserts] = React.useState<PendingMap<CalendarAvailabilityBlock>>(
    () => new Map()
  );
  const tokenRef = React.useRef(0);

  /** Starts or settles one pending entry; settled entries the data has caught
   *  up with are pruned on every write so the maps stay small. */
  const putEntry = React.useCallback(
    <T,>(
      setter: React.Dispatch<React.SetStateAction<PendingMap<T>>>,
      key: string,
      entry: PendingEntry<T>
    ) => {
      const pruneBefore = oldestCachedUpdatedAt();
      setter((previous) => withEntry(pruneSettled(previous, pruneBefore), key, entry));
    },
    [oldestCachedUpdatedAt]
  );
  const settleEntry = React.useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<PendingMap<T>>>, key: string, token: number) => {
      const settledAt = Date.now();
      setter((previous) => {
        const entry = previous.get(key);
        if (!entry || entry.token !== token) return previous;
        const next = new Map(previous);
        next.set(key, { ...entry, settledAt });
        return next;
      });
    },
    []
  );
  const dropEntry = React.useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<PendingMap<T>>>, key: string, token?: number) => {
      setter((previous) => withoutEntry(previous, key, token));
    },
    []
  );

  const rooms = React.useMemo(() => calendarData?.rooms ?? [], [calendarData]);
  const serverBookings = React.useMemo(() => calendarData?.bookings ?? [], [calendarData]);
  const bookings = React.useMemo(
    () => applyBookingPatches(serverBookings, bookingPatches, shownUpdatedAt),
    [bookingPatches, serverBookings, shownUpdatedAt]
  );
  const availabilityBlocks = React.useMemo(
    () =>
      applyBlockOverlay(
        calendarData?.availabilityBlocks ?? [],
        hiddenBlocks,
        blockUpserts,
        shownUpdatedAt
      ),
    [blockUpserts, calendarData, hiddenBlocks, shownUpdatedAt]
  );

  const [savingIds, setSavingIds] = React.useState<Set<string>>(() => new Set());
  const savingRef = React.useRef(new Set<string>());
  const markSaving = React.useCallback((id: string, saving: boolean) => {
    if (saving) savingRef.current.add(id);
    else savingRef.current.delete(id);
    setSavingIds(new Set(savingRef.current));
  }, []);

  // ── Filters ──────────────────────────────────────────────────────────
  // Room-type filters come from the rooms on the rack, so a deactivated type
  // that still has rooms can be filtered too (and never hides rooms silently).
  const [hiddenTypeIds, setHiddenTypeIds] = React.useState<Set<string>>(() => new Set());
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = React.useState<string[]>([]);
  const [showFilters, setShowFilters] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [realtimeStatus, setRealtimeStatus] = React.useState<"live" | "reconnecting">(
    "reconnecting"
  );

  const roomTypeFilters = React.useMemo<RoomTypeFilter[]>(() => {
    const seen = new Map<string, RoomTypeFilter>();
    for (const room of rooms) {
      if (seen.has(room.roomTypeId)) continue;
      seen.set(room.roomTypeId, {
        id: room.roomTypeId,
        name: room.roomTypeName,
        visible: !hiddenTypeIds.has(room.roomTypeId),
      });
    }
    return [...seen.values()];
  }, [hiddenTypeIds, rooms]);

  const filteredRooms = React.useMemo(
    () => (hiddenTypeIds.size === 0 ? rooms : rooms.filter((room) => !hiddenTypeIds.has(room.roomTypeId))),
    [hiddenTypeIds, rooms]
  );

  const visibleBookings = React.useMemo(() => {
    const visibleRoomIds = new Set(filteredRooms.map((room) => room.id));
    const query = deferredSearchQuery.trim().toLowerCase();
    return bookings.filter(
      (b) =>
        (!b.roomId || visibleRoomIds.has(b.roomId)) &&
        (!statusFilters.length || statusFilters.includes(b.status)) &&
        (!sourceFilters.length || sourceFilters.includes(b.source ?? "")) &&
        (!query ||
          [b.guestName, b.reference, b.roomNumber]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query))
    );
  }, [bookings, deferredSearchQuery, filteredRooms, sourceFilters, statusFilters]);

  // ── Drawers and dialogs ──────────────────────────────────────────────
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

  // ── Booking detail prefetch ──────────────────────────────────────────
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

  // ── New-arrival highlight (bookings created elsewhere) ───────────────
  const [newBookingIds, setNewBookingIds] = React.useState<Set<string>>(new Set());
  const knownBookingIdsRef = React.useRef(
    new Set(initialData.bookings.map((booking) => booking.id))
  );
  const dateRangeKey = `${dateStr}_${days}`;
  const knownDateRangeKeyRef = React.useRef(dateRangeKey);

  React.useEffect(() => {
    const rangeChanged = dateRangeKey !== knownDateRangeKeyRef.current;
    knownDateRangeKeyRef.current = dateRangeKey;
    const current = new Set(serverBookings.map((booking) => booking.id));
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
  }, [serverBookings, dateRangeKey]);

  // ── Realtime ─────────────────────────────────────────────────────────
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
      setSeedValid(false);
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

    // The shared client fetches a fresh Clerk token on connect and on every
    // heartbeat. Awaiting it here only makes sure the join carries the token,
    // so RLS sees this staff member from the first event.
    const ensureRealtimeAuth = async () => {
      try {
        await supabase.realtime.setAuth();
      } catch (error) {
        console.error("[calendar] realtime auth failed:", error);
      }
    };

    const reportStatus = onRealtimeStatus({
      label: "calendar",
      hotelId,
      orgId,
      table: "bookings,availability_blocks",
    });

    // Changes made while the channel was down are not replayed, so the rack
    // refetches whenever the channel comes back after an interruption.
    let joined = false;
    let interrupted = false;

    const handleStatus = (status: string, err?: Error) => {
      setRealtimeStatus(status === "SUBSCRIBED" ? "live" : "reconnecting");
      if (status === "SUBSCRIBED") {
        if (interrupted) batchRefresh();
        joined = true;
        interrupted = false;
        resubscribeAttempts = 0;
        return;
      }
      if (joined) interrupted = true;
      if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
      if (resubscribeAttempts === 0) reportStatus(status, err);
      if (cancelled || resubscribeAttempts >= 5) return;
      resubscribeAttempts += 1;
      retryTimer = window.setTimeout(async () => {
        await ensureRealtimeAuth();
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

    void ensureRealtimeAuth().then(() => {
      if (!cancelled) openChannel();
    });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient]);

  // ── Navigation ───────────────────────────────────────────────────────
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
      if (!isAtToday) return;
      // Anchored on today: keep today in view with the new preset's lead.
      const nextDays = VIEW_PRESETS.find((p) => p.label === preset)?.days ?? 14;
      setStartDate(addDays(parseISO(businessDateKey), -pastLeadDays(nextDays)));
      setTodayAnchor((n) => n + 1);
    },
    [businessDateKey, isAtToday]
  );

  // ── Filter actions ───────────────────────────────────────────────────
  const clearFilters = React.useCallback(() => {
    setHiddenTypeIds(new Set());
    setStatusFilters([]);
    setSourceFilters([]);
    setSearchQuery("");
  }, []);

  const toggleRoomTypeFilter = React.useCallback((typeId: string) => {
    setHiddenTypeIds((previous) => {
      const next = new Set(previous);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
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

  // ── Opening things ───────────────────────────────────────────────────
  const openBooking = React.useCallback(
    (bookingId: string) => {
      const raw = bookingId.replace(/:v\d+$/, "");
      if (!isFresh(queryClient, bookingDetailCache.key(raw))) {
        void queryClient.prefetchQuery(bookingDetailCache.options(raw));
      }
      setDetailInitialTab("overview");
      setSelectedBookingId(raw);
      setDetailPanelOpen(true);
    },
    [queryClient]
  );

  const openNewBooking = React.useCallback(
    (prefill: typeof newBookingPrefill) => {
      if (!canEdit) return;
      setNewBookingPrefill(prefill);
      setNewBookingOpen(true);
    },
    [canEdit]
  );

  const openBlockSheet = React.useCallback(() => {
    setEditingBlock(null);
    setBlockRoomOpen(true);
  }, []);

  const openBlockEditor = React.useCallback((block: CalendarAvailabilityBlock) => {
    setEditingBlock(block);
    setBlockRoomOpen(true);
  }, []);

  const handleBlockSheetOpenChange = React.useCallback((open: boolean) => {
    setBlockRoomOpen(open);
    if (!open) setEditingBlock(null);
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

  // ── Booking writes (optimistic) ──────────────────────────────────────
  /** Applies `patch` at once, runs the write, then settles or rolls back. */
  const runBookingWrite = React.useCallback(
    async (
      bookingId: string,
      patch: BookingPatch,
      write: () => Promise<{ success: true } | { success: false; error: string }>,
      fallbackError: string
    ) => {
      if (savingRef.current.has(bookingId)) return;
      const token = ++tokenRef.current;
      markSaving(bookingId, true);
      putEntry(setBookingPatches, bookingId, { value: patch, settledAt: null, token });
      try {
        const result = await write();
        if (!result.success) throw new Error(result.error);
        settleEntry(setBookingPatches, bookingId, token);
        resyncAfterWrite();
      } catch (error) {
        dropEntry(setBookingPatches, bookingId, token);
        toast.danger(error instanceof Error && error.message ? error.message : fallbackError);
        invalidateCalendarData();
      } finally {
        markSaving(bookingId, false);
      }
    },
    [dropEntry, invalidateCalendarData, markSaving, putEntry, resyncAfterWrite, settleEntry]
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
      if (!canEdit) return;
      const room = roomId ? rooms.find((item) => item.id === roomId) ?? null : null;
      if (roomId && !room) return;
      const patch = buildBookingPatch(booking, room, checkIn, checkOut, roomTypeIdOverride);
      await runBookingWrite(
        booking.id,
        patch,
        () =>
          roomId
            ? moveBooking(booking.id, {
                roomId,
                checkIn,
                checkOut,
                ...(roomTypeIdOverride ? { roomTypeId: roomTypeIdOverride } : {}),
                ...(keepRates ? { keepRates: true } : {}),
              })
            : unassignBooking(booking.id),
        roomId ? "Couldn't move the booking. Try again." : "Couldn't unassign the booking. Try again."
      );
    },
    [canEdit, rooms, runBookingWrite]
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
      if (!canEdit) return;
      const booking = bookings.find((item) => item.id === bookingId);
      if (!booking) return;

      const target = pickBestRoom(booking, {
        rooms,
        bookings,
        blocks: availabilityBlocks,
        today: businessDateKey,
      });
      if (!target) {
        toast.danger("No room of this type is free for the whole stay. Move a booking or change the dates.");
        return;
      }
      await runBookingWrite(
        bookingId,
        buildBookingPatch(booking, target, booking.checkIn, booking.checkOut),
        () => assignBookingToRoom(bookingId, target.id),
        "Couldn't assign the room. Try again."
      );
    },
    [availabilityBlocks, bookings, businessDateKey, canEdit, rooms, runBookingWrite]
  );

  // ── Block writes ─────────────────────────────────────────────────────
  const blockTokensRef = React.useRef(new Map<string, number>());

  const handleUnblockStart = React.useCallback(
    (blockId: string) => {
      const token = ++tokenRef.current;
      blockTokensRef.current.set(blockId, token);
      putEntry(setHiddenBlocks, blockId, { value: null, settledAt: null, token });
    },
    [putEntry]
  );

  const handleUnblockEnd = React.useCallback(
    (blockId: string, removed: boolean) => {
      const token = blockTokensRef.current.get(blockId);
      blockTokensRef.current.delete(blockId);
      if (token === undefined) return;
      if (removed) {
        settleEntry(setHiddenBlocks, blockId, token);
        resyncAfterWrite();
      } else {
        dropEntry(setHiddenBlocks, blockId, token);
        invalidateCalendarData();
      }
    },
    [dropEntry, invalidateCalendarData, resyncAfterWrite, settleEntry]
  );

  /** The sheet only closes after the server saved the block (its checks often
   *  reject a range), so this shows the saved block before the refetch lands. */
  const handleBlockSaved = React.useCallback(
    (result: BlockSheetResult) => {
      const stored = toStoredBlockRange(result.startDate, result.lastNight);
      const token = ++tokenRef.current;
      const existing =
        result.blockId !== null
          ? availabilityBlocks.find((block) => block.id === result.blockId)
          : undefined;
      const id = result.blockId ?? `${PENDING_BLOCK_PREFIX}${token}`;
      const block: CalendarAvailabilityBlock = {
        id,
        roomId: result.roomId,
        startDate: stored.startDate,
        endDate: stored.endDate,
        reason: result.reason,
        notes: result.notes,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        createdByName: existing?.createdByName ?? null,
      };
      putEntry(setBlockUpserts, id, { value: block, settledAt: Date.now(), token });
      resyncAfterWrite();
    },
    [availabilityBlocks, putEntry, resyncAfterWrite]
  );

  React.useEffect(() => {
    const report = (event: Event) => toast.danger((event as CustomEvent<string>).detail);
    window.addEventListener("roomline-calendar-error", report);
    return () => window.removeEventListener("roomline-calendar-error", report);
  }, []);

  // ── Derived view state ───────────────────────────────────────────────
  const hiddenTypeCount = roomTypeFilters.filter((filter) => !filter.visible).length;
  const activeDrawerFilterCount = hiddenTypeCount + statusFilters.length + sourceFilters.length;
  const hasAnyActiveFilter = activeDrawerFilterCount > 0 || Boolean(searchQuery.trim());

  // A failed first load (or a failed switch to a new range) has nothing true
  // to show. A failed background refresh keeps the rack and says so.
  const loadFailed = isError && (!calendarData || isPlaceholderData);
  const refreshFailed = isError && !loadFailed;
  const switchingRange = isFetching && isPlaceholderData;

  return (
    <div className="cal-wrap flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden bg-background">
      <CalendarToolbar
        startDate={startDate}
        days={days}
        viewPreset={viewPreset}
        isAtToday={isAtToday}
        realtimeStatus={realtimeStatus}
        activeFilterCount={activeDrawerFilterCount}
        searchQuery={searchQuery}
        canBlock={canBlock}
        onNavigate={navigate}
        onToday={goToToday}
        onSelectDate={selectDate}
        onViewPresetChange={changeViewPreset}
        onSearchQueryChange={setSearchQuery}
        onOpenFilters={() => setShowFilters(true)}
        onBlockRoom={openBlockSheet}
      />

      {hasAnyActiveFilter && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-2 lg:px-6">
          {roomTypeFilters
            .filter((f) => !f.visible)
            .map((f) => (
              <FilterChip
                key={f.id}
                label={`Hidden: ${f.name}`}
                onRemove={() => toggleRoomTypeFilter(f.id)}
              />
            ))}
          {statusFilters.map((s) => (
            <FilterChip
              key={s}
              label={`Status: ${getStatusLabel(s)}`}
              onRemove={() => toggleStatusFilter(s)}
            />
          ))}
          {sourceFilters.map((s) => (
            <FilterChip
              key={s}
              label={`Source: ${getSourceLabel(s)}`}
              onRemove={() => toggleSourceFilter(s)}
            />
          ))}
          {searchQuery.trim() && (
            <FilterChip label={`“${searchQuery.trim()}”`} onRemove={() => setSearchQuery("")} />
          )}
          <Button
            variant="ghost"
            size="sm"
            onPress={clearFilters}
            className="font-medium text-muted-foreground max-sm:h-10"
          >
            Clear all
          </Button>
        </div>
      )}

      {refreshFailed && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-3 border-b border-amber-500/25 bg-amber-500/8 px-4 py-2 text-xs text-amber-900 lg:px-6"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Couldn&apos;t refresh the calendar. You&apos;re seeing the last loaded data.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => void refetch()}
            className="shrink-0 font-semibold text-amber-900 max-sm:h-10"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Scheduler */}
      <div className="relative min-h-0 flex-1 overflow-hidden" aria-busy={switchingRange || undefined}>
        {switchingRange && (
          <div
            className="absolute left-0 right-0 top-0 z-50 h-1 overflow-hidden bg-primary/10"
            role="progressbar"
            aria-label="Loading dates"
          >
            <div
              className="h-full w-1/3 bg-primary/60 motion-reduce:w-full motion-reduce:animate-none!"
              style={{ animation: "shimmer 1.4s ease-in-out infinite" }}
            />
          </div>
        )}

        {loadFailed ? (
          <CalendarMessage
            role="alert"
            icon={<TriangleAlert className="size-6 text-destructive/70" aria-hidden="true" />}
            title="Couldn't load the calendar"
            description="Check your connection and try again."
          >
            <Button variant="secondary" onPress={() => void refetch()} className="mt-4">
              <RefreshCw className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </CalendarMessage>
        ) : filteredRooms.length > 0 ? (
          <TimelineCalendar
            startDate={startDate}
            days={days}
            rooms={filteredRooms}
            bookings={visibleBookings}
            allBookings={bookings}
            blocks={availabilityBlocks}
            canEdit={canEdit}
            hotelTimezone={hotelTimezone}
            todayAnchor={todayAnchor}
            highlightIds={newBookingIds}
            assigningIds={savingIds}
            movingIds={savingIds}
            onOpenBooking={openBooking}
            onOpenBlock={setSelectedBlock}
            onChange={handleTimelineChange}
            onAutoAssign={handleAutoAssign}
            onRequestTypeChange={handleRequestTypeChange}
            onCreate={handleCellCreate}
            attachBarRef={attachCalendarBarRef}
          />
        ) : rooms.length > 0 ? (
          <CalendarMessage
            icon={<SlidersHorizontal className="size-6 text-muted-foreground/60" aria-hidden="true" />}
            title="All room types are hidden"
            description="Show at least one room type to see the rack."
          >
            <Button variant="secondary" onPress={clearFilters} className="mt-4">
              Reset filters
            </Button>
          </CalendarMessage>
        ) : (
          <CalendarMessage
            icon={<BedDouble className="size-6 text-muted-foreground/60" aria-hidden="true" />}
            title="No rooms yet"
            description="Add room types and room numbers to plan stays on the calendar."
          >
            <div className="mt-4 flex items-center gap-2">
              <Button variant="secondary" onPress={() => router.push("/dashboard/rooms")}>
                Manage rooms
              </Button>
              <Button variant="primary" onPress={() => router.push("/dashboard/rooms/types/new")}>
                New room type
              </Button>
            </div>
          </CalendarMessage>
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
          <AlertDialog.Dialog className="rounded-3xl border border-border/70 bg-card p-6 shadow-2xl outline-none sm:max-w-[440px]">
            <AlertDialog.Header className="pb-1">
              <AlertDialog.Heading className="text-base font-semibold text-foreground">
                Move to {pendingTypeChange?.toTypeName}?
              </AlertDialog.Heading>
              <p className="mt-1 text-xs text-muted-foreground">
                {pendingTypeChange?.guestName} ·{" "}
                {pendingTypeChange ? format(parseISO(pendingTypeChange.checkIn), "MMM d") : ""} –{" "}
                {pendingTypeChange ? format(parseISO(pendingTypeChange.checkOut), "MMM d") : ""}
                {pendingTypeChange?.fromTypeName ? ` · now ${pendingTypeChange.fromTypeName}` : ""}
              </p>
            </AlertDialog.Header>

            <AlertDialog.Body className="space-y-3 py-4">
              <RadioGroup
                aria-label="Rate for the moved stay"
                value={typeChangeRateChoice}
                onChange={(value) => setTypeChangeRateChoice(value as "keep" | "reprice")}
                className="grid gap-2"
              >
                <RateOption
                  value="keep"
                  title="Keep current rate"
                  description="Nightly prices stay as booked"
                  amount={
                    typeChangePreview
                      ? formatMoney(typeChangePreview.currentTotalMinor, typeChangePreview.currency)
                      : null
                  }
                />
                <RateOption
                  value="reprice"
                  isDisabled={repriceUnavailable}
                  title={`Reprice at ${pendingTypeChange?.toTypeName ?? "new"} rate`}
                  description={
                    typeChangePreviewBusy
                      ? "Checking rates…"
                      : typeChangePreviewQuery.isError
                        ? "Rate preview unavailable"
                        : typeChangeBlocked
                          ? `No active rate plan on ${pendingTypeChange?.toTypeName}`
                          : (typeChangePreview?.unpricedNights ?? 0) > 0
                            ? `${typeChangePreview?.unpricedNights} nights have no price`
                            : typeChangePreview && typeChangePreview.manualNights > 0
                              ? `Replaces ${typeChangePreview.manualNights} custom-priced night${typeChangePreview.manualNights === 1 ? "" : "s"}`
                              : `Uses the ${pendingTypeChange?.toTypeName} rate plan`
                  }
                  amount={
                    typeChangePreview?.repriceTotalMinor != null
                      ? formatMoney(typeChangePreview.repriceTotalMinor, typeChangePreview.currency)
                      : null
                  }
                />
              </RadioGroup>

              {typeChangeBlocked && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
                  <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
                  Set up an active rate plan on {pendingTypeChange?.toTypeName} first.
                </p>
              )}
            </AlertDialog.Body>

            <AlertDialog.Footer className="flex items-center justify-end gap-2 pt-2">
              <Button variant="tertiary" onPress={() => setPendingTypeChange(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={confirmTypeChange}
                isDisabled={
                  typeChangePreviewBusy ||
                  typeChangeBlocked ||
                  (typeChangeRateChoice === "reprice" && repriceUnavailable)
                }
              >
                Move booking
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
        canEditBlocks={canBlock}
        onEdit={openBlockEditor}
        onUnblockStart={handleUnblockStart}
        onUnblockEnd={handleUnblockEnd}
      />
      <BlockRoomSheet
        open={blockRoomOpen}
        onOpenChange={handleBlockSheetOpenChange}
        rooms={rooms}
        editBlock={editingBlock}
        minDate={parseISO(businessDateKey)}
        onSuccess={handleBlockSaved}
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
        canBlock={canBlock}
        onBlockRoom={() => {
          setShowFilters(false);
          openBlockSheet();
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

function CalendarMessage({
  icon,
  title,
  description,
  role,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  role?: "alert";
  children?: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center"
    >
      <span className="mb-4">{icon}</span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

function RateOption({
  value,
  title,
  description,
  amount,
  isDisabled,
}: {
  value: "keep" | "reprice";
  title: string;
  description: string;
  amount: string | null;
  isDisabled?: boolean;
}) {
  return (
    <Radio value={value} isDisabled={isDisabled} className="mt-0">
      <Radio.Content className="group flex w-full items-start gap-3 rounded-2xl border border-border/70 p-4 transition-colors duration-150 data-[disabled=true]:opacity-55 data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-ring data-[hovered=true]:border-border data-[selected=true]:border-primary/50 data-[selected=true]:bg-primary/[0.04]">
        <Radio.Control className="mt-px size-5 shrink-0 rounded-full border border-border bg-card shadow-none group-data-[selected=true]:border-transparent group-data-[selected=true]:bg-primary">
          <Radio.Indicator className="before:rounded-full before:bg-card group-data-[selected=true]:before:scale-[0.4]" />
        </Radio.Control>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {amount && (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {amount}
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
        </span>
      </Radio.Content>
    </Radio>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onPress={onRemove}
      aria-label={`Remove filter ${label}`}
      className="max-w-[240px] gap-2 font-medium max-sm:h-10"
    >
      <span className="truncate">{label}</span>
      <X className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Button>
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
          className="flex h-[84dvh] max-h-[84dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl md:h-dvh md:max-h-dvh md:w-[min(21rem,100vw)] md:rounded-none md:border-l md:border-border/70"
        >
          {isMobile && <Drawer.Handle className="mt-3 shrink-0" />}
          <Drawer.CloseTrigger className="ui-press absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />

          <Drawer.Header className="shrink-0 flex-row items-center justify-between border-b border-border/50 px-6 pb-4 pr-14 pt-6">
            <Drawer.Heading id="calendar-filters-title" className="text-base font-semibold text-foreground">
              View and filters
            </Drawer.Heading>
          </Drawer.Header>

          <Drawer.Body className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-4">
            {/* The toolbar shows the horizon from lg and the block button from md. */}
            <FilterGroup title="Days shown" className="lg:hidden">
              <CalendarHorizonToggle
                viewPreset={viewPreset}
                onViewPresetChange={onViewPresetChange}
                fullWidth
              />
            </FilterGroup>

            {canBlock && (
              <Button variant="secondary" fullWidth onPress={onBlockRoom} className="h-11 md:hidden">
                <CalendarOff className="size-4" aria-hidden="true" />
                Block dates
              </Button>
            )}

            {roomTypeFilters.length > 0 && (
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
            )}

            <FilterGroup title="Show only these statuses">
              {STATUS_OPTIONS.map((s) => (
                <FilterToggle
                  key={s}
                  label={getStatusLabel(s)}
                  active={statusFilters.includes(s)}
                  onToggle={() => onToggleStatus(s)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Show only these sources">
              {SOURCE_OPTIONS.map((s) => (
                <FilterToggle
                  key={s}
                  label={getSourceLabel(s)}
                  active={sourceFilters.includes(s)}
                  onToggle={() => onToggleSource(s)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Status colors">
              <CalendarLegendList className="grid-cols-2 px-1 pt-1" />
            </FilterGroup>
          </Drawer.Body>

          <Drawer.Footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/50 bg-muted/10 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <Button variant="ghost" onPress={onClear} className="font-medium text-primary">
              Reset all
            </Button>
            <Button variant="primary" onPress={() => onOpenChange(false)} className="min-w-24">
              Done
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function FilterGroup({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-2", className)}>
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
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Switch.Control className="shrink-0">
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
