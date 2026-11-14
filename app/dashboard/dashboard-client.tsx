"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import { Alert, AlertDialog, Button, Card, SearchField, Skeleton, toast } from "@heroui/react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { CalendarClock, ListFilter, RotateCw } from "lucide-react";
import PullToRefresh from "react-simple-pull-to-refresh";

import { OccupancyCard } from "./_components/occupancy-card";
import { DateNavigator } from "./_components/date-card";
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
import { EarlyCheckoutDialog } from "./_components/early-checkout-dialog";
import { isEarlyDeparture, type EarlyDeparturePolicy } from "@/lib/bookings/early-departure";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DashboardClientProps {
  hotelId: string;
  /** Clerk org id from the server — seeds the query key so hydrated data matches on first paint. */
  orgId: string;
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

interface CheckOutVars {
  bookingId: string;
  unusedNights?: EarlyDeparturePolicy;
}

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
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterOpen, setFilterOpen] = React.useState(false);
  const showFilter = filterOpen || searchQuery.length > 0;
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
    const refreshDashboard = () =>
      refresh.schedule(() => {
        queryClient.invalidateQueries({
          queryKey: qk.dashboard(orgId, hotelId, dateParamStr),
        });
        queryClient.invalidateQueries({
          queryKey: qk.dashboard(orgId, hotelId, businessToday(hotelTimezone)),
        });
      });
    const channel = supabase
      .channel(`hotel:${hotelId}:dashboard`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        refreshDashboard
      )
      .subscribe(
        onRealtimeStatus({
          label: "dashboard",
          hotelId,
          orgId,
          table: "bookings",
          onRecovered: refreshDashboard,
        })
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
    mutationFn: async ({ bookingId, unusedNights }: CheckOutVars) => {
      const result = await checkOutBooking(bookingId, unusedNights ? { unusedNights } : {});
      if (!result.success) throw new Error(result.error || "Check-out failed");
      return { bookingId, early: result.early };
    },
    onMutate: async ({ bookingId }) => {
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
    onSuccess: ({ early }) => {
      if (!early) {
        toast.success("Guest checked out successfully");
      } else if (early.overpaid > 0) {
        toast.warning(
          `Checked out early. Refund ${formatCurrency(early.overpaid, early.currency)} to the guest.`
        );
      } else if (early.policy === "release") {
        toast.success(
          `Checked out early. The bill is now ${formatCurrency(early.totalAfter, early.currency)}.`
        );
      } else {
        toast.success(
          `Checked out early. ${formatCurrency(early.earlyDepartureFee, early.currency)} kept as an early departure fee.`
        );
      }
    },
    onSettled: (_data, _error, { bookingId }) => {
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
      if (booking && isEarlyDeparture(booking.checkIn, booking.checkOut, propertyTodayStr)) {
        setEarlyCheckoutBooking(booking);
        return;
      }
      checkOutMutation.mutate({ bookingId });
    },
    [checkOutMutation, data?.bookings, propertyTodayStr]
  );

  const confirmEarlyCheckout = React.useCallback(
    (unusedNights: EarlyDeparturePolicy | undefined) => {
      if (!earlyCheckoutBooking) return;
      checkOutMutation.mutate({ bookingId: earlyCheckoutBooking.id, unusedNights });
      setEarlyCheckoutBooking(null);
    },
    [checkOutMutation, earlyCheckoutBooking]
  );

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
            if (targetDateStr < propertyTodayStr) {
              // A past night counts only guests who were in house; a
              // confirmed or pending booking was never in its totals.
              if (booking.status === "checked_in") soldRoomsDelta -= units;
            } else if (booking.status === "confirmed" || booking.status === "checked_in") {
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
  const tabs = buildActivityTabs(stats, activeTab);
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
        <h2 className="text-lg font-semibold text-foreground">Couldn&apos;t load the front desk</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
        <Button variant="secondary" className="mt-4 rounded-xl" onPress={() => refetch()}>
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
          "mx-auto w-full max-w-7xl space-y-4 pt-4 transition-opacity duration-150 ease-[ease] md:space-y-6 md:pt-6",
          isDateSwitching && "opacity-60"
        )}
      >
        {/* One row of controls. The list filter stays an icon until it is
            needed, so the header search is the only search box on screen. */}
        <div className="flex flex-wrap items-center gap-2">
          <DateNavigator
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            todayDateStr={propertyTodayStr}
            className="min-w-0 flex-1 sm:flex-initial"
          />
          {showFilter && (
            <SearchField
              autoFocus={filterOpen}
              aria-label="Filter this list"
              value={searchQuery}
              onChange={setSearchQuery}
              onBlur={() => {
                if (!searchQuery) setFilterOpen(false);
              }}
              // Grows in from the filter icon it replaces (right edge), 200 ms ease-out.
              // Reduced motion keeps only the fade.
              className="order-last basis-full origin-right transition-[opacity,scale] duration-200 ease-[var(--ease-out-ui)] starting:scale-[0.97] starting:opacity-0 motion-reduce:transition-opacity motion-reduce:starting:scale-100 sm:order-none sm:ml-auto sm:w-72 sm:basis-auto"
            >
              <SearchField.Group className="rounded-full border border-border bg-card shadow-none max-md:h-11">
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Guest, room or reference" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          )}
          <div className={cn("flex items-center gap-1", !showFilter && "sm:ml-auto")}>
            {!showFilter && (
              <Button
                isIconOnly
                variant="ghost"
                aria-label="Filter this list"
                onPress={() => setFilterOpen(true)}
                className="shrink-0 rounded-full text-muted-foreground max-md:size-11"
              >
                <ListFilter className="size-4" />
              </Button>
            )}
            {/* Phones pull to refresh instead. */}
            <Button
              isIconOnly
              variant="ghost"
              aria-label="Refresh"
              onPress={() => void refetch()}
              className="hidden shrink-0 rounded-full text-muted-foreground md:inline-flex"
            >
              <RotateCw className="size-4" />
            </Button>
          </div>
        </div>

        {error && (
          <Alert status="warning" className="rounded-2xl">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Refresh failed</Alert.Title>
              <Alert.Description>Figures may be out of date.</Alert.Description>
            </Alert.Content>
            <Button size="sm" variant="secondary" className="rounded-xl" onPress={() => refetch()}>
              Try again
            </Button>
          </Alert>
        )}

        {/* Occupancy leads on phones and tablets (one compact card), and moves
            to a sticky side column from 1280 px. */}
        <div className="grid grid-cols-1 items-start gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <aside className="min-w-0 xl:sticky xl:top-20 xl:col-start-2 xl:row-start-1">
            <OccupancyCard metric={data.occupancy} isDateSwitching={isDateSwitching} />
          </aside>

          <Card
            id="front-desk-activity"
            role="region"
            aria-label="Front-desk activity"
            className="min-w-0 gap-0 overflow-hidden rounded-2xl border border-border p-0 shadow-[0_1px_2px_rgb(20_20_19/0.04)] xl:col-start-1 xl:row-start-1"
          >
            <ActivityTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
              <ActivityList
                bookings={filteredBookings}
                activeTab={activeTab}
                pendingCount={activePendingCount}
                loading={loading}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
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
            </ActivityTabs>
          </Card>
        </div>

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

        <EarlyCheckoutDialog
          target={earlyCheckoutBooking}
          onCancel={closeEarlyConfirmation}
          onConfirm={confirmEarlyCheckout}
        />

        {/* Early check-in confirmation */}
        <AlertDialog.Backdrop
          isOpen={earlyCheckinBooking !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) closeEarlyConfirmation();
          }}
        >
          <AlertDialog.Container placement="center" size="sm">
            <AlertDialog.Dialog className="rounded-3xl sm:max-w-[400px]">
              <AlertDialog.Header className="items-center text-center">
                <span
                  aria-hidden="true"
                  className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"
                >
                  <CalendarClock className="size-5" />
                </span>
                <AlertDialog.Heading className="text-lg font-semibold text-foreground">
                  Check in early?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="text-center">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {earlyCheckinBooking?.guestName} is due to arrive on{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {earlyCheckinBooking ? formatDate(earlyCheckinBooking.checkIn, "EEE, d MMM") : ""}
                  </span>
                  . The room is assigned before the scheduled arrival.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row">
                <Button
                  slot="close"
                  variant="tertiary"
                  fullWidth
                  onPress={closeEarlyConfirmation}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  autoFocus
                  fullWidth
                  variant="primary"
                  onPress={confirmEarlyCheckin}
                  className="rounded-xl font-semibold"
                >
                  Check in early
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
    <div className="mx-auto w-full max-w-7xl space-y-4 pt-4 md:space-y-6 md:pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full rounded-full sm:w-64" />
        <Skeleton className="h-10 w-full rounded-full sm:w-72" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex items-center gap-6 rounded-2xl border border-border bg-card p-4 sm:p-6 xl:col-start-2 xl:row-start-1 xl:flex-col xl:items-stretch">
          <Skeleton className="size-28 shrink-0 rounded-full xl:mx-auto xl:size-44" />
          <div className="flex-1 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full rounded-md" />
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card xl:col-start-1 xl:row-start-1">
          <div className="flex gap-6 border-b border-border px-6 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20 shrink-0 rounded-md" />
            ))}
          </div>
          <div className="space-y-4 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
