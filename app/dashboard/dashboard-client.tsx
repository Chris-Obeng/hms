"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import { AlertDialog, Button, Skeleton, toast } from "@heroui/react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { CalendarClock, Plus } from "lucide-react";
import PullToRefresh from "react-simple-pull-to-refresh";

import { DateCard, MobileWeekCalendar } from "./_components/date-card";
import { OccupancyCard } from "./_components/occupancy-card";
import { ActivityTabs, buildActivityTabs, type ActivityTab } from "./_components/activity-tabs";
import { ActivityList, type ActivityBooking } from "./_components/activity-list";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";
import { qk } from "@/lib/query-keys";
import { fetchDashboardData, type DashboardQueryData } from "@/lib/dashboard/fetch-dashboard-data";
import { calculateRoomsSold } from "@/lib/metrics/dashboard-occupancy";
import { isCancelledOnDate, isInHouseOnDate } from "@/lib/calendar-domain";
import { businessDate, businessToday } from "@/lib/business-date";
import { updateBookingStatus } from "@/app/actions/bookings";
import { checkInBooking, checkOutBooking } from "./actions";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DashboardClientProps {
  hotelId: string;
  /** Clerk org id from the server — seeds the query key so hydrated data matches on first paint. */
  orgId: string;
  hotelName: string;
  currency: string;
  /** Property timezone — day boundaries follow the hotel's calendar, not the device clock. */
  hotelTimezone: string;
  /** Server-computed business day (YYYY-MM-DD); seeds selectedDate so the first query key matches hydration. */
  initialDate: string;
}

const defaultEmptyStats = {
  arrivals: 0,
  uncheckedInArrivals: 0,
  departures: 0,
  pendingDepartures: 0,
  inHouse: 0,
  stayovers: 0,
  newBookings: 0,
  cancellations: 0,
  overbookings: 0,
};

interface MutationCtx {
  previousData?: DashboardQueryData;
  queryKey?: readonly unknown[];
}

const COARSE_QUERY = "(pointer: coarse)";

function subscribeCoarsePointer(onChange: () => void) {
  const mql = window.matchMedia(COARSE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getCoarsePointerSnapshot() {
  return window.matchMedia(COARSE_QUERY).matches;
}

function getServerPointerSnapshot() {
  return false;
}

export function DashboardClient({
  hotelId,
  hotelName,
  currency,
  hotelTimezone,
  orgId: initialOrgId,
  initialDate,
}: DashboardClientProps) {
  const queryClient = useQueryClient();
  const { orgId: liveOrgId } = useAuth();
  const orgId = initialOrgId || liveOrgId || "";
  const isMobile = useIsMobile();
  const isTouchPointer = React.useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointerSnapshot,
    getServerPointerSnapshot
  );

  const [selectedDate, setSelectedDate] = React.useState(
    () => new Date(`${initialDate}T00:00:00`)
  );
  const [activeTab, setActiveTab] = React.useState<ActivityTab>("arrivals");
  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailInitialTab, setDetailInitialTab] = React.useState<"overview" | "payments">(
    "overview"
  );
  const [earlyCheckoutBooking, setEarlyCheckoutBooking] = React.useState<ActivityBooking | null>(
    null
  );
  const [earlyCheckinBooking, setEarlyCheckinBooking] = React.useState<ActivityBooking | null>(
    null
  );

  const [checkingIn, setCheckingIn] = React.useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = React.useState<Set<string>>(new Set());
  const [mutatingStatus, setMutatingStatus] = React.useState<Set<string>>(new Set());

  const dateParamStr = format(selectedDate, "yyyy-MM-dd");
  const propertyTodayStr = businessToday(hotelTimezone);

  const openNewBookingModal = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent("roomline:new-booking"));
  }, []);

  const {
    data,
    isLoading: loading,
    isPlaceholderData: isDateSwitching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: qk.dashboard(orgId || "", hotelId, dateParamStr),
    queryFn: () => {
      const supabase = createClient();
      return fetchDashboardData(supabase, hotelId, dateParamStr, hotelTimezone);
    },
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 60000,
  });

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load dashboard data"
    : null;

  // Warm neighbouring days so ±1-day stepping resolves immediately from cache.
  React.useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    for (const offset of [-1, 1]) {
      const day = format(addDays(selectedDate, offset), "yyyy-MM-dd");
      queryClient.prefetchQuery({
        queryKey: qk.dashboard(orgId, hotelId, day),
        queryFn: () => fetchDashboardData(supabase, hotelId, day, hotelTimezone),
        staleTime: 30_000,
      });
    }
  }, [selectedDate, orgId, hotelId, hotelTimezone, queryClient]);

  React.useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    const refresh = createCoalescer();
    const channel = supabase
      .channel(`hotel:${hotelId}:dashboard`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () =>
          refresh.schedule(() => {
            queryClient.invalidateQueries({
              queryKey: qk.dashboard(orgId, hotelId, dateParamStr),
            });
            queryClient.invalidateQueries({
              queryKey: qk.dashboard(orgId, hotelId, businessToday(hotelTimezone)),
            });
          })
      )
      .subscribe(
        onRealtimeStatus({ label: "dashboard", hotelId, orgId, table: "bookings" })
      );
    return () => {
      refresh.cancel();
      supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient, dateParamStr, hotelTimezone]);

  const invalidateOperationalCaches = React.useCallback(
    (bookingId?: string) => {
      if (orgId) {
        void queryClient.invalidateQueries({ queryKey: ["dashboard", orgId, hotelId] });
        void queryClient.invalidateQueries({ queryKey: ["calendar", orgId, hotelId] });
      }
      if (bookingId) {
        void queryClient.invalidateQueries({ queryKey: qk.bookingDetail(bookingId) });
      } else {
        void queryClient.invalidateQueries({ queryKey: ["bookingDetail"] });
      }
    },
    [queryClient, orgId, hotelId]
  );

  const handleBookingChanged = React.useCallback(() => {
    invalidateOperationalCaches();
  }, [invalidateOperationalCaches]);

  const handleDateChange = React.useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const handleViewDetails = React.useCallback((booking: ActivityBooking) => {
    setDetailInitialTab("overview");
    setSelectedBookingId(booking.id);
    setDetailOpen(true);
  }, []);

  const handleTakePayment = React.useCallback((booking: ActivityBooking) => {
    setDetailInitialTab("payments");
    setSelectedBookingId(booking.id);
    setDetailOpen(true);
  }, []);

  const checkInMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const result = await checkInBooking(bookingId);
      if (!result.success) throw new Error(result.error || "Check-in failed");
      return { bookingId };
    },
    onMutate: async (bookingId) => {
      setCheckingIn((prev) => new Set(prev).add(bookingId));
      const targetDateStr = dateParamStr;
      const queryKey = qk.dashboard(orgId || "", hotelId, targetDateStr);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<DashboardQueryData>(queryKey);

      queryClient.setQueryData(queryKey, (old: DashboardQueryData | undefined) => {
        if (!old) return old;
        const target = old.bookings.find((b) => b.id === bookingId);
        if (!target || target.status !== "confirmed") return old;
        const isArrivalOnDate = target.checkIn === targetDateStr;
        const spansDate = target.checkIn <= targetDateStr && target.checkOut >= targetDateStr;
        return {
          ...old,
          bookings: old.bookings.map((b) =>
            b.id === bookingId ? { ...b, status: "checked_in" } : b
          ),
          stats: {
            ...old.stats,
            // `stats.arrivals` counts confirmed + checked_in arrivals, so total arrivals is unchanged
            uncheckedInArrivals: isArrivalOnDate
              ? Math.max(0, old.stats.uncheckedInArrivals - 1)
              : old.stats.uncheckedInArrivals,
            inHouse: spansDate ? old.stats.inHouse + 1 : old.stats.inHouse,
          },
        };
      });

      return { previousData, queryKey };
    },
    onError: (err, _bookingId, context?: MutationCtx) => {
      if (context?.previousData && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.danger(err instanceof Error ? err.message : "Check-in failed");
    },
    onSuccess: () => {
      toast.success("Guest checked in successfully");
    },
    onSettled: (_data, _error, bookingId) => {
      setCheckingIn((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
      invalidateOperationalCaches(bookingId);
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const result = await checkOutBooking(bookingId);
      if (!result.success) throw new Error(result.error || "Check-out failed");
      return { bookingId };
    },
    onMutate: async (bookingId) => {
      setCheckingOut((prev) => new Set(prev).add(bookingId));
      const targetDateStr = dateParamStr;
      const queryKey = qk.dashboard(orgId || "", hotelId, targetDateStr);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<DashboardQueryData>(queryKey);

      queryClient.setQueryData(queryKey, (old: DashboardQueryData | undefined) => {
        if (!old) return old;
        const target = old.bookings.find((b) => b.id === bookingId);
        if (!target || target.status !== "checked_in") return old;
        const isDepartureOnDate = target.checkOut === targetDateStr;
        const spansDate = target.checkIn <= targetDateStr && target.checkOut >= targetDateStr;
        return {
          ...old,
          bookings: old.bookings.map((b) =>
            b.id === bookingId ? { ...b, status: "checked_out" } : b
          ),
          stats: {
            ...old.stats,
            // `stats.departures` counts confirmed + checked_in + checked_out, so total departures is unchanged
            pendingDepartures: isDepartureOnDate
              ? Math.max(0, old.stats.pendingDepartures - 1)
              : old.stats.pendingDepartures,
            inHouse: spansDate ? Math.max(0, old.stats.inHouse - 1) : old.stats.inHouse,
          },
        };
      });

      return { previousData, queryKey };
    },
    onError: (err, _bookingId, context?: MutationCtx) => {
      if (context?.previousData && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.danger(err instanceof Error ? err.message : "Check-out failed");
    },
    onSuccess: () => {
      toast.success("Guest checked out successfully");
    },
    onSettled: (_data, _error, bookingId) => {
      setCheckingOut((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
      invalidateOperationalCaches(bookingId);
    },
  });

  const handleCheckIn = React.useCallback(
    (bookingId: string) => {
      const booking = data?.bookings.find((item: ActivityBooking) => item.id === bookingId);
      if (booking && booking.checkIn > propertyTodayStr) {
        setEarlyCheckinBooking(booking);
        return;
      }
      checkInMutation.mutate(bookingId);
    },
    [checkInMutation, data?.bookings, propertyTodayStr]
  );

  const handleCheckOut = React.useCallback(
    (bookingId: string) => {
      const booking = data?.bookings.find((item: ActivityBooking) => item.id === bookingId);
      if (booking && booking.checkOut > propertyTodayStr) {
        setEarlyCheckoutBooking(booking);
        return;
      }
      checkOutMutation.mutate(bookingId);
    },
    [checkOutMutation, data?.bookings, propertyTodayStr]
  );

  const confirmEarlyCheckout = React.useCallback(() => {
    if (!earlyCheckoutBooking) return;
    checkOutMutation.mutate(earlyCheckoutBooking.id);
    setEarlyCheckoutBooking(null);
  }, [checkOutMutation, earlyCheckoutBooking]);

  const confirmEarlyCheckin = React.useCallback(() => {
    if (!earlyCheckinBooking) return;
    checkInMutation.mutate(earlyCheckinBooking.id);
    setEarlyCheckinBooking(null);
  }, [checkInMutation, earlyCheckinBooking]);

  const closeEarlyConfirmation = React.useCallback(() => {
    setEarlyCheckoutBooking(null);
    setEarlyCheckinBooking(null);
  }, []);

  const statusMutation = useMutation({
    mutationFn: async ({
      bookingId,
      status,
    }: {
      bookingId: string;
      status: "cancelled" | "no_show";
    }) => {
      const result = await updateBookingStatus(bookingId, status);
      if (!result.success) throw new Error(result.error || "Status update failed");
      return { bookingId, status };
    },
    onMutate: async ({ bookingId, status }) => {
      setMutatingStatus((prev) => new Set(prev).add(bookingId));
      const targetDateStr = dateParamStr;
      const queryKey = qk.dashboard(orgId || "", hotelId, targetDateStr);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<DashboardQueryData>(queryKey);
      queryClient.setQueryData(queryKey, (old: DashboardQueryData | undefined) => {
        if (!old) return old;
        const nowIso = new Date().toISOString();
        let cancellationsDelta = 0;
        let arrivalsDelta = 0;
        let uncheckedArrivalsDelta = 0;
        let departuresDelta = 0;
        let pendingDeparturesDelta = 0;
        let inHouseDelta = 0;
        let soldRoomsDelta = 0;
        let heldRoomsDelta = 0;
        const bookings = old.bookings.map((booking) => {
          if (booking.id !== bookingId) return booking;
          const wasCounted = isCancelledOnDate(
            { status: booking.status, cancelledAt: booking.cancelledAt },
            targetDateStr,
            hotelTimezone
          );
          if (
            booking.checkIn === targetDateStr &&
            (booking.status === "confirmed" || booking.status === "checked_in")
          ) {
            arrivalsDelta -= 1;
            if (booking.status === "confirmed") uncheckedArrivalsDelta -= 1;
          }
          if (
            booking.checkOut === targetDateStr &&
            ["confirmed", "checked_in", "checked_out"].includes(booking.status)
          ) {
            departuresDelta -= 1;
            if (booking.status !== "checked_out") pendingDeparturesDelta -= 1;
          }
          if (
            booking.status === "checked_in" &&
            booking.checkIn <= targetDateStr &&
            booking.checkOut >= targetDateStr
          ) {
            inHouseDelta -= 1;
          }
          if (booking.checkIn <= targetDateStr && booking.checkOut > targetDateStr) {
            const units = Math.max(1, booking.roomsCount ?? 1);
            if (booking.status === "confirmed" || booking.status === "checked_in") {
              soldRoomsDelta -= units;
            } else if (booking.status === "pending") {
              heldRoomsDelta -= units;
            }
          }
          const next = {
            ...booking,
            status,
            cancelledAt: status === "cancelled" ? nowIso : booking.cancelledAt,
            hasConflict: false,
          };
          cancellationsDelta +=
            (isCancelledOnDate(next, targetDateStr, hotelTimezone) ? 1 : 0) -
            (wasCounted ? 1 : 0);
          return next;
        });

        let nextOccupancy = old.occupancy;
        if (
          (soldRoomsDelta !== 0 || heldRoomsDelta !== 0) &&
          old.occupancy.totalRooms !== null &&
          old.occupancy.outOfService !== null &&
          old.occupancy.blocked !== null &&
          old.occupancy.soldRooms !== null &&
          old.occupancy.heldRooms !== null
        ) {
          nextOccupancy = calculateRoomsSold(
            {
              date: old.occupancy.date,
              businessToday: propertyTodayStr,
              asOf: old.occupancy.asOf,
            },
            {
              totalRooms: old.occupancy.totalRooms,
              outOfService: old.occupancy.outOfService,
              blocked: old.occupancy.blocked,
              soldRooms: Math.max(0, old.occupancy.soldRooms + soldRoomsDelta),
              heldRooms: Math.max(0, old.occupancy.heldRooms + heldRoomsDelta),
            }
          );
        }

        return {
          ...old,
          bookings,
          occupancy: nextOccupancy,
          stats: {
            ...old.stats,
            arrivals: Math.max(0, old.stats.arrivals + arrivalsDelta),
            uncheckedInArrivals: Math.max(
              0,
              old.stats.uncheckedInArrivals + uncheckedArrivalsDelta
            ),
            departures: Math.max(0, old.stats.departures + departuresDelta),
            pendingDepartures: Math.max(
              0,
              old.stats.pendingDepartures + pendingDeparturesDelta
            ),
            inHouse: Math.max(0, old.stats.inHouse + inHouseDelta),
            cancellations: Math.max(0, old.stats.cancellations + cancellationsDelta),
          },
        };
      });
      return { previousData, queryKey };
    },
    onError: (err, _variables, context) => {
      if (context?.previousData && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.danger(err instanceof Error ? err.message : "Status update failed");
    },
    onSuccess: ({ status }) =>
      toast.success(status === "cancelled" ? "Booking cancelled" : "Booking marked no-show"),
    onSettled: (_data, _err, variables) => {
      setMutatingStatus((prev) => {
        const next = new Set(prev);
        next.delete(variables.bookingId);
        return next;
      });
      invalidateOperationalCaches(variables.bookingId);
    },
  });

  const stats = data ? data.stats : defaultEmptyStats;
  const tabs = buildActivityTabs(stats);
  const activePendingCount =
    activeTab === "arrivals"
      ? stats.uncheckedInArrivals
      : activeTab === "departures"
        ? stats.pendingDepartures
        : undefined;

  const filteredBookings = React.useMemo(() => {
    if (!data) return [];
    switch (activeTab) {
      case "arrivals":
        return data.bookings.filter(
          (b) => b.checkIn === dateParamStr && ["confirmed", "checked_in"].includes(b.status)
        );
      case "departures":
        return data.bookings.filter(
          (b) =>
            b.checkOut === dateParamStr &&
            ["confirmed", "checked_in", "checked_out"].includes(b.status)
        );
      case "in_house":
        return data.bookings.filter((b) =>
          isInHouseOnDate(
            {
              id: b.id,
              roomId: null,
              checkIn: b.checkIn,
              checkOut: b.checkOut,
              status: b.status,
            },
            dateParamStr
          )
        );
      case "bookings":
        return data.bookings.filter(
          (b) =>
            !!b.createdAt &&
            businessDate(hotelTimezone, new Date(b.createdAt)) === dateParamStr
        );
      case "cancellations":
        return data.bookings.filter((b) =>
          isCancelledOnDate(
            { status: b.status, cancelledAt: b.cancelledAt },
            dateParamStr,
            hotelTimezone
          )
        );
      case "overbookings":
        return data.bookings.filter((b) => b.hasConflict);
      default:
        return data.bookings;
    }
  }, [data, activeTab, dateParamStr, hotelTimezone]);

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <h2 className="text-lg font-semibold text-foreground">Failed to load dashboard</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onPress={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <PullToRefresh
      isPullable={isTouchPointer && isMobile}
      onRefresh={async () => {
        await refetch();
      }}
      pullingContent={
        <div className="flex h-8 items-center justify-center text-xs text-muted-foreground md:hidden">
          Pull to refresh
        </div>
      }
      refreshingContent={
        <div className="flex h-8 items-center justify-center text-xs text-primary md:hidden">
          Refreshing…
        </div>
      }
      maxPullDownDistance={88}
      resistance={2.5}
    >
      <div
        aria-busy={isDateSwitching}
        className={cn(
          "mx-auto w-full max-w-[1440px] space-y-4 pt-1 transition-opacity duration-150 md:space-y-6",
          isDateSwitching && "opacity-65"
        )}
      >
        {/* Compact page header — wayfinding + explicit New booking CTA */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-2xl">
              Front desk
            </h1>
            <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
              {hotelName}
              {dateParamStr !== propertyTodayStr && (
                <span> · Viewing {formatDate(dateParamStr, "EEE, MMM d, yyyy")}</span>
              )}
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onPress={openNewBookingModal}
            className="ui-press inline-flex h-11 shrink-0 gap-2 rounded-xl px-4 text-xs font-semibold shadow-2xs sm:h-10"
          >
            <Plus className="size-4" aria-hidden="true" />
            New booking
          </Button>
        </header>

        {/* Phone week strip (<768px) */}
        <MobileWeekCalendar
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          todayDateStr={propertyTodayStr}
        />

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-card px-4 py-3 text-xs sm:text-sm"
          >
            <p className="text-foreground">
              Dashboard refresh failed. Displayed figures may be out of date.
            </p>
            <Button variant="outline" size="sm" className="min-h-10" onPress={() => refetch()}>
              Try again
            </Button>
          </div>
        )}

        {/*
         * Responsive workspace grid (one DOM tree, zero duplication):
         * - Mobile (<768px): Activity first (order-1), compact Rooms Sold below (order-2)
         * - Tablet (768px–1023px): [DateCard | Rooms Sold] side-by-side top row (md:order-1),
         *   full-width Activity below (md:order-2)
         * - Desktop (≥1024px): Left rail [DateCard + Rooms Sold] 312px (md:order-1),
         *   Activity main workspace on right (md:order-2)
         */}
        <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-[312px_minmax(0,1fr)] lg:gap-6">
          <div className="order-2 flex flex-col gap-4 md:order-1 md:grid md:grid-cols-[260px_minmax(0,1fr)] md:items-stretch md:gap-6 lg:flex lg:flex-col lg:gap-6">
            <div className="hidden md:block">
              <DateCard
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                todayDateStr={propertyTodayStr}
              />
            </div>

            <div className="min-w-0">
              <OccupancyCard metric={data.occupancy} isDateSwitching={isDateSwitching} />
            </div>
          </div>

          <section
            aria-label="Front-desk activity"
            className="order-1 min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.04)] md:order-2"
          >
            <ActivityTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

            <div
              id={`activity-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`activity-tab-${activeTab}`}
            >
              <ActivityList
                bookings={filteredBookings}
                activeTab={activeTab}
                pendingCount={activePendingCount}
                loading={loading}
                onRefresh={() => void refetch()}
                onNewBooking={openNewBookingModal}
                onCheckIn={(id) => {
                  if (!checkingIn.has(id)) handleCheckIn(id);
                }}
                onCheckOut={(id) => {
                  if (!checkingOut.has(id)) handleCheckOut(id);
                }}
                onCancel={(id) => {
                  if (!mutatingStatus.has(id)) {
                    statusMutation.mutate({ bookingId: id, status: "cancelled" });
                  }
                }}
                onNoShow={(id) => {
                  if (!mutatingStatus.has(id)) {
                    statusMutation.mutate({ bookingId: id, status: "no_show" });
                  }
                }}
                onViewDetails={handleViewDetails}
                onTakePayment={handleTakePayment}
              />
            </div>
          </section>
        </div>

        {/* Booking Detail Drawer */}
        <BookingDetailDrawer
          bookingId={selectedBookingId}
          open={detailOpen}
          onClose={() => {
            setDetailOpen(false);
            setSelectedBookingId(null);
          }}
          currency={currency}
          initialTab={detailInitialTab}
          onBookingChanged={handleBookingChanged}
        />

        {/* Early Check-In / Early Check-Out Confirmation */}
        <AlertDialog.Backdrop
          variant="blur"
          isOpen={earlyCheckoutBooking !== null || earlyCheckinBooking !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) closeEarlyConfirmation();
          }}
        >
          <AlertDialog.Container placement="center" size="sm">
            <AlertDialog.Dialog className="rounded-3xl border border-border/60 bg-card px-6 pb-6 pt-8 shadow-2xl outline-none sm:max-w-[400px] sm:px-8 sm:pb-8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none">
              <AlertDialog.Header className="flex flex-col items-center gap-4 pb-0 text-center">
                <span
                  className={cn(
                    "grid size-14 place-items-center rounded-2xl border shadow-xs",
                    earlyCheckinBooking
                      ? "border-primary/15 bg-primary/10 text-primary"
                      : "border-amber-700/15 bg-amber-700/10 text-amber-700"
                  )}
                  aria-hidden
                >
                  <CalendarClock className="size-[24px]" />
                </span>
                <AlertDialog.Heading className="text-balance text-center text-lg font-semibold leading-tight tracking-tight text-foreground">
                  {earlyCheckinBooking ? "Check in early?" : "Check out early?"}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="px-1 pb-0 pt-3 text-center">
                <p className="text-balance text-sm leading-relaxed text-muted-foreground">
                  {earlyCheckinBooking?.guestName || earlyCheckoutBooking?.guestName} is scheduled
                  for{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {earlyCheckinBooking
                      ? formatDate(earlyCheckinBooking.checkIn, "dd MMM yyyy")
                      : earlyCheckoutBooking
                        ? formatDate(earlyCheckoutBooking.checkOut, "dd MMM yyyy")
                        : ""}
                  </span>
                  .{" "}
                  {earlyCheckinBooking
                    ? "This assigns the room before the scheduled arrival."
                    : "This releases the room before the scheduled departure."}
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer className="flex w-full flex-col gap-3 pt-6">
                <Button
                  autoFocus={!!earlyCheckinBooking}
                  onPress={earlyCheckinBooking ? confirmEarlyCheckin : confirmEarlyCheckout}
                  className={cn(
                    "ui-press h-12 w-full rounded-full text-md font-semibold text-white shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    earlyCheckinBooking
                      ? "bg-primary [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--accent-hover)]"
                      : "bg-amber-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-amber-800"
                  )}
                >
                  {earlyCheckinBooking ? "Check In Early" : "Check Out Early"}
                </Button>
                <Button
                  slot="close"
                  variant="tertiary"
                  onPress={closeEarlyConfirmation}
                  className="ui-press h-12 w-full rounded-full border border-border/70 bg-background text-md font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60"
                >
                  Cancel
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </div>
    </PullToRefresh>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 pt-1 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded-md" />
        </div>
        <Skeleton className="h-11 w-32 shrink-0 rounded-xl sm:h-10" />
      </div>

      {/* Mobile week strip skeleton */}
      <Skeleton className="h-[108px] w-full rounded-3xl md:hidden" />

      <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-[312px_minmax(0,1fr)] lg:gap-6">
        <div className="order-2 flex flex-col gap-4 md:order-1 md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6 lg:flex lg:flex-col lg:gap-6">
          <Skeleton className="hidden h-[176px] w-full rounded-3xl md:block" />
          <div className="space-y-4 rounded-3xl border border-border/60 bg-card p-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-4 w-36 rounded-md" />
            </div>
            <Skeleton className="mx-auto aspect-square w-[124px] rounded-full lg:w-[172px]" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
            </div>
          </div>
        </div>

        <div className="order-1 overflow-hidden rounded-3xl border border-border/60 bg-card md:order-2">
          <div className="flex gap-2 border-b border-border/50 bg-muted/20 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-xl" />
            ))}
          </div>
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full rounded-xl" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
