"use client";

import * as React from "react";
import { addDays, format, isToday, startOfDay } from "date-fns";
import { AlertDialog, toast } from "@heroui/react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { CalendarClock } from "lucide-react";

import { Skeleton, Button } from "@heroui/react";
import { DateCard } from "./_components/date-card";
import { OccupancyCard } from "./_components/occupancy-card";
import { ActivityTabs, buildActivityTabs, type ActivityTab } from "./_components/activity-tabs";
import { ActivityList, type ActivityBooking } from "./_components/activity-list";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { createClient } from "@/lib/supabase/client";
import { onRealtimeStatus } from "@/lib/observability/realtime";
import { createCoalescer } from "@/lib/realtime/coalesce";
import { writeAuditLog } from "@/lib/audit";
import { qk } from "@/lib/query-keys";
import { fetchDashboardData, type DashboardQueryData } from "@/lib/dashboard/fetch-dashboard-data";
import { isCancelledOnDate, isInHouseOnDate } from "@/lib/calendar-domain";
import { businessDate, businessToday } from "@/lib/business-date";
import { updateBookingStatus } from "@/app/actions/bookings";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import PullToRefresh from "react-simple-pull-to-refresh";

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

/** Optimistic-update rollback payload captured in onMutate. */
interface MutationCtx {
  previousData?: DashboardQueryData;
  queryKey?: readonly unknown[];
}

export function DashboardClient({ hotelId, currency, hotelTimezone, orgId: initialOrgId, initialDate }: DashboardClientProps) {
  const queryClient = useQueryClient();
  const { orgId: liveOrgId, userId } = useAuth();
  const orgId = initialOrgId || liveOrgId || "";

  // Seed from the server-computed business day so the first-render query key
  // matches the hydrated one exactly — no day-boundary hydration miss. A
  // device-local midnight keeps format(selectedDate, "yyyy-MM-dd") a round-trip.
  const [selectedDate, setSelectedDate] = React.useState(() => new Date(`${initialDate}T00:00:00`));
  const [activeTab, setActiveTab] = React.useState<ActivityTab>("arrivals");
  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailInitialTab, setDetailInitialTab] = React.useState<"overview" | "payments">("overview");
  const [earlyCheckoutBooking, setEarlyCheckoutBooking] = React.useState<ActivityBooking | null>(null);
  const [earlyCheckinBooking, setEarlyCheckinBooking] = React.useState<ActivityBooking | null>(null);

  const [checkingIn, setCheckingIn] = React.useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = React.useState<Set<string>>(new Set());

  const dateParamStr = format(selectedDate, "yyyy-MM-dd");

  const { data: staffProfile } = useQuery({
    queryKey: qk.staffProfile(orgId || "", userId || ""),
    queryFn: async () => {
      if (!orgId || !userId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .eq("clerk_user_id", userId)
        .eq("clerk_org_id", orgId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && !!userId,
  });

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
    // Keep the current day on screen while the next loads (no full skeleton).
    placeholderData: keepPreviousData,
    // A day revisited within 30s serves from cache without a refetch.
    staleTime: 30_000,
    refetchInterval: 60000,
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : "Failed to load dashboard data") : null;

  // Warm the neighbouring days so the ± chevron stepper resolves instantly.
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
    // A night audit or group check-in changes many bookings at once, and each
    // change arrives as its own event. Invalidate once the burst settles.
    const refresh = createCoalescer();
    const channel = supabase
      .channel(`hotel:${hotelId}:dashboard`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => refresh.schedule(() => {
          queryClient.invalidateQueries({ queryKey: qk.dashboard(orgId, hotelId, dateParamStr) });
          queryClient.invalidateQueries({
            queryKey: qk.dashboard(orgId, hotelId, businessToday(hotelTimezone)),
          });
        }),
      )
      .subscribe(
        onRealtimeStatus({ label: "dashboard", hotelId, orgId, table: "bookings" }),
      );
    return () => {
      refresh.cancel();
      supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient, dateParamStr, hotelTimezone]);

  const handleBookingChanged = React.useCallback(() => {
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: qk.dashboard(orgId, hotelId, dateParamStr) });
      // Detail mutations change booking detail; keep drawer fresh next open
      void queryClient.invalidateQueries({ queryKey: ["bookingDetail"] });
    }
  }, [queryClient, orgId, hotelId, dateParamStr]);

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
      const supabase = createClient();
      const { data: booking, error: findError } = await supabase
        .from("bookings")
        .select("id, reference, status, room_id")
        .eq("id", bookingId)
        .single();

      if (findError) throw findError;
      if (!booking) throw new Error("Booking not found");
      if (booking.status !== "confirmed") throw new Error("Booking cannot be checked in");

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: "checked_in", check_in_at: new Date().toISOString() })
        .eq("id", bookingId);

      if (updateError) throw updateError;

      if (booking.room_id) {
        await supabase
          .from("rooms")
          .update({ status: "occupied" })
          .eq("id", booking.room_id);
      }

      if (staffProfile) {
        await writeAuditLog(supabase, {
          hotelId,
          staffId: staffProfile.id,
          staffName: staffProfile.full_name,
          action: "booking.checked_in",
          entityType: "booking",
          entityId: bookingId,
          afterState: { reference: booking.reference, status: "checked_in" },
        });
      }
      return booking;
    },
    onMutate: async (bookingId) => {
      setCheckingIn((prev) => new Set(prev).add(bookingId));
      const queryKey = qk.dashboard(orgId || "", hotelId, dateParamStr);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<DashboardQueryData>(queryKey);

      queryClient.setQueryData(queryKey, (old: DashboardQueryData | undefined) => {
        if (!old) return old;
        return {
          ...old,
          bookings: old.bookings.map((b) =>
            b.id === bookingId ? { ...b, status: "checked_in" } : b
          ),
          stats: {
            ...old.stats,
            arrivals: Math.max(0, old.stats.arrivals - 1),
            inHouse: old.stats.inHouse + 1,
            uncheckedInArrivals: Math.max(0, old.stats.uncheckedInArrivals - 1),
          },
        };
      });

      return { previousData };
    },
    onError: (err, bookingId, context?: MutationCtx) => {
      const queryKey = qk.dashboard(orgId || "", hotelId, dateParamStr);
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.danger(err instanceof Error ? err.message : "Check-in failed");
    },
    onSuccess: () => {
      toast.success("Guest checked in successfully");
    },
    onSettled: (data, error, bookingId) => {
      setCheckingIn((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: qk.dashboard(orgId || "", hotelId, dateParamStr) });
    }
  });

  const checkOutMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const supabase = createClient();
      const { data: booking, error: findError } = await supabase
        .from("bookings")
        .select("id, reference, status, room_id")
        .eq("id", bookingId)
        .single();

      if (findError) throw findError;
      if (!booking) throw new Error("Booking not found");
      if (booking.status !== "checked_in") throw new Error("Booking is not checked in");

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: "checked_out", check_out_at: new Date().toISOString() })
        .eq("id", bookingId);

      if (updateError) throw updateError;

      if (booking.room_id) {
        await supabase
          .from("rooms")
          .update({ status: "available" })
          .eq("id", booking.room_id);
      }

      if (staffProfile) {
        await writeAuditLog(supabase, {
          hotelId,
          staffId: staffProfile.id,
          staffName: staffProfile.full_name,
          action: "booking.checked_out",
          entityType: "booking",
          entityId: bookingId,
          afterState: { reference: booking.reference, status: "checked_out" },
        });
      }
      return booking;
    },
    onMutate: async (bookingId) => {
      setCheckingOut((prev) => new Set(prev).add(bookingId));
      const queryKey = qk.dashboard(orgId || "", hotelId, dateParamStr);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<DashboardQueryData>(queryKey);

      queryClient.setQueryData(queryKey, (old: DashboardQueryData | undefined) => {
        if (!old) return old;
        return {
          ...old,
          bookings: old.bookings.map((b) =>
            b.id === bookingId ? { ...b, status: "checked_out" } : b
          ),
          stats: {
            ...old.stats,
            departures: Math.max(0, old.stats.departures + 1),
            inHouse: Math.max(0, old.stats.inHouse - 1),
            pendingDepartures: Math.max(0, old.stats.pendingDepartures - 1),
          },
        };
      });

      return { previousData };
    },
    onError: (err, bookingId, context?: MutationCtx) => {
      const queryKey = qk.dashboard(orgId || "", hotelId, dateParamStr);
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.danger(err instanceof Error ? err.message : "Check-out failed");
    },
    onSuccess: () => {
      toast.success("Guest checked out successfully");
    },
    onSettled: (data, error, bookingId) => {
      setCheckingOut((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: qk.dashboard(orgId || "", hotelId, dateParamStr) });
    }
  });

  const handleCheckIn = React.useCallback((bookingId: string) => {
    const booking = data?.bookings.find((item: ActivityBooking) => item.id === bookingId);
    const today = format(new Date(), "yyyy-MM-dd");
    if (booking && booking.checkIn > today) {
      setEarlyCheckinBooking(booking);
      return;
    }
    checkInMutation.mutate(bookingId);
  }, [checkInMutation, data?.bookings]);

  const handleCheckOut = React.useCallback((bookingId: string) => {
    const booking = data?.bookings.find((item: ActivityBooking) => item.id === bookingId);
    const today = format(new Date(), "yyyy-MM-dd");

    if (booking && booking.checkOut > today) {
      setEarlyCheckoutBooking(booking);
      return;
    }

    checkOutMutation.mutate(bookingId);
  }, [checkOutMutation, data?.bookings]);

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
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: "cancelled" | "no_show" }) => {
      const result = await updateBookingStatus(bookingId, status);
      if (!result.success) throw new Error(result.error || "Status update failed");
      return { bookingId, status };
    },
    onMutate: async ({ bookingId, status }) => {
      const queryKey = qk.dashboard(orgId || "", hotelId, dateParamStr);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<DashboardQueryData>(queryKey);
      queryClient.setQueryData(queryKey, (old: DashboardQueryData | undefined) => {
        if (!old) return old;
        // Keep the badge in sync with the list predicate below: count the
        // cancellation only when its event date lands on the viewed business
        // day (property timezone), and never double-count an already-listed
        // row. The generic delta also covers a future reinstate direction.
        const nowIso = new Date().toISOString();
        let cancellationsDelta = 0;
        const bookings = old.bookings.map((booking) => {
          if (booking.id !== bookingId) return booking;
          const wasCounted = isCancelledOnDate(
            { status: booking.status, cancelledAt: booking.cancelledAt },
            dateParamStr,
            hotelTimezone,
          );
          const next = { ...booking, status, cancelledAt: status === "cancelled" ? nowIso : booking.cancelledAt };
          cancellationsDelta +=
            (isCancelledOnDate(next, dateParamStr, hotelTimezone) ? 1 : 0) - (wasCounted ? 1 : 0);
          return next;
        });
        return {
          ...old,
          bookings,
          stats: cancellationsDelta === 0
            ? old.stats
            : { ...old.stats, cancellations: Math.max(0, old.stats.cancellations + cancellationsDelta) },
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
    onSuccess: ({ status }) => toast.success(status === "cancelled" ? "Booking cancelled" : "Booking marked no-show"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.dashboard(orgId || "", hotelId, dateParamStr) }),
  });

  const tabs = data ? buildActivityTabs(data.stats) : buildActivityTabs(defaultEmptyStats);

  const filteredBookings = React.useMemo(() => {
    if (!data) return [];
    switch (activeTab) {
      case "arrivals":
        return data.bookings.filter(
          (b) => b.checkIn === dateParamStr &&
            ["confirmed", "checked_in"].includes(b.status)
        );
      case "departures":
        return data.bookings.filter(
          (b) => b.checkOut === dateParamStr &&
            ["confirmed", "checked_in", "checked_out"].includes(b.status)
        );
      case "in_house":
        return data.bookings.filter((b) => isInHouseOnDate({ id: b.id, roomId: null, checkIn: b.checkIn, checkOut: b.checkOut, status: b.status }, dateParamStr));
      case "bookings":
        // Same rule as the badge query: the creation day is resolved in the
        // property timezone, not by slicing the UTC ISO string.
        return data.bookings.filter((b) => !!b.createdAt && businessDate(hotelTimezone, new Date(b.createdAt)) === dateParamStr);
      case "cancellations":
        return data.bookings.filter((b) => isCancelledOnDate({ status: b.status, cancelledAt: b.cancelledAt }, dateParamStr, hotelTimezone));
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <h2 className="text-lg font-semibold text-foreground">Failed to load dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onPress={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <PullToRefresh
      onRefresh={async () => { await refetch(); }}
      pullingContent={<div className="flex h-8 items-center justify-center text-xs text-muted-foreground md:hidden">Pull to refresh</div>}
      refreshingContent={<div className="flex h-8 items-center justify-center text-xs text-primary md:hidden">Refreshing...</div>}
      maxPullDownDistance={96}
      resistance={2.5}
    >
    <div
      aria-busy={isDateSwitching}
      className={cn(
        "mx-auto max-w-[1600px] space-y-5 pt-1 transition-opacity duration-200 md:space-y-6",
        isDateSwitching && "opacity-60"
      )}
    >
      {/* ── Mobile week strip (phone only) ───────────────────────── */}
      <MobileWeekCalendar selectedDate={selectedDate} onDateChange={handleDateChange} />

      {/* ── Main 2-column grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr] lg:gap-6">
        {/* Date + occupancy — mobile: occupancy only; tablet: side-by-side row; desktop: stacked column */}
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-5 lg:block lg:space-y-6">
          {/* Date card: hidden on phone (week strip covers it); equal half on tablet, full width on desktop */}
          <div className="hidden md:block md:flex-1 lg:w-full">
            <DateCard selectedDate={selectedDate} onDateChange={handleDateChange} />
          </div>

          <div className="min-w-0 md:flex-1 lg:w-full">
            <OccupancyCard
              occupancyPercent={data.occupancy.percent}
              availableUnits={data.occupancy.availableRooms}
              bookedUnits={data.occupancy.occupiedRooms}
              outOfService={data.occupancy.outOfService}
              blockedDates={data.occupancy.blocked}
              totalRooms={data.occupancy.totalRooms}
            />
          </div>
        </div>

        {/* Right column — activity */}
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xs">
          <ActivityTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

          <ActivityList
            bookings={filteredBookings}
            loading={loading}
            onRefresh={() => void refetch()}
            onCheckIn={(id) => {
              if (!checkingIn.has(id)) handleCheckIn(id);
            }}
            onCheckOut={(id) => {
              if (!checkingOut.has(id)) handleCheckOut(id);
            }}
            onCancel={(id) => statusMutation.mutate({ bookingId: id, status: "cancelled" })}
            onNoShow={(id) => statusMutation.mutate({ bookingId: id, status: "no_show" })}
            onViewDetails={handleViewDetails}
            onTakePayment={handleTakePayment}
          />
        </div>
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

      <AlertDialog.Backdrop
        variant="blur"
        isOpen={earlyCheckoutBooking !== null || earlyCheckinBooking !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeEarlyConfirmation();
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-[28px] border border-border/60 bg-card px-6 pb-6 pt-7 shadow-2xl outline-none sm:max-w-[400px] sm:px-7 sm:pb-7 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none">
                        <AlertDialog.Header className="flex flex-col items-center gap-4 pb-0 text-center">
              <span
                className={cn(
                  "grid size-14 place-items-center rounded-[18px] border shadow-sm",
                  earlyCheckinBooking
                    ? "bg-primary/10 text-primary border-primary/15 dark:bg-primary/15"
                    : "bg-amber-700/10 text-amber-700 border-amber-700/15 dark:bg-amber-500/12 dark:text-amber-400"
                )}
                aria-hidden
              >
                <CalendarClock className="size-[22px]" />
              </span>
              <AlertDialog.Heading className="text-balance text-center text-[17px] font-semibold leading-tight tracking-tight text-foreground">
                {earlyCheckinBooking ? "Check in early?" : "Check out early?"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="px-1 pb-0 pt-3 text-center">
              <p className="text-balance text-[13.5px] leading-relaxed text-muted-foreground">
                {earlyCheckinBooking?.guestName || earlyCheckoutBooking?.guestName} is scheduled for{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {earlyCheckinBooking
                    ? formatDate(earlyCheckinBooking.checkIn, "dd MMM yyyy")
                    : earlyCheckoutBooking
                      ? formatDate(earlyCheckoutBooking.checkOut, "dd MMM yyyy")
                    : ""}
                </span>.{" "}
                {earlyCheckinBooking
                  ? "This assigns the room before the scheduled arrival."
                  : "This releases the room before the scheduled departure."}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex w-full flex-col gap-2.5 pt-6">
              <Button
                autoFocus={!!earlyCheckinBooking}
                onPress={earlyCheckinBooking ? confirmEarlyCheckin : confirmEarlyCheckout}
                className={cn(
                  "h-12 w-full rounded-full text-[15px] font-semibold text-white shadow-sm transition-all active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  earlyCheckinBooking
                    ? "bg-primary hover:bg-[var(--accent-hover)]"
                    : "bg-amber-700 hover:bg-amber-800"
                )}
              >
                {earlyCheckinBooking ? "Check In Early" : "Check Out Early"}
              </Button>
              <Button
                slot="close"
                variant="tertiary"
                onPress={closeEarlyConfirmation}
                className="h-12 w-full rounded-full border border-border/70 bg-background text-[15px] font-semibold text-foreground hover:bg-muted/60 hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 md:space-y-6">
      {/* 2-column body */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr] lg:gap-6">
        <div className="space-y-4 lg:space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-5 shadow-xs">
            <Skeleton className="mx-auto aspect-square w-full max-w-[184px] rounded-full" />
            <div className="space-y-2.5 pt-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full rounded-md" />
              ))}
            </div>
          </div>
        </div>
        <Skeleton className="h-[480px] w-full rounded-2xl" />
      </div>
    </div>
  );
}

// ── Mobile week calendar — custom week strip ──────────────────────

function MobileWeekCalendar({
  selectedDate,
  onDateChange,
}: {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}) {
  const weekDays = React.useMemo(() => {
    // Get Monday of the week containing selectedDate
    const dayOfWeek = selectedDate.getDay(); // 0=Sun
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // shift to Monday
    const monday = new Date(selectedDate);
    monday.setDate(monday.getDate() + diff);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [selectedDate]);

  const goToPrevWeek = React.useCallback(() => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 7);
    onDateChange(prev);
  }, [selectedDate, onDateChange]);

  const goToNextWeek = React.useCallback(() => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 7);
    onDateChange(next);
  }, [selectedDate, onDateChange]);

  const rangeLabel = `${format(weekDays[0], "MMMM d")} \u2013 ${format(weekDays[6], "d, yyyy")}`;

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-xs md:hidden">
      {/* Week range header with nav */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <button
          type="button"
          onClick={goToPrevWeek}
          aria-label="Previous week"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-foreground tracking-tight">
          {rangeLabel}
        </span>
        <button
          type="button"
          onClick={goToNextWeek}
          aria-label="Next week"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Day strip */}
      <div className="grid grid-cols-7 gap-0.5 px-2 pb-2.5">
        {weekDays.map((day) => {
          const isSel = startOfDay(day).getTime() === startOfDay(selectedDate).getTime();
          const isTod = isToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDateChange(day)}
              aria-pressed={isSel}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 outline-none transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-ring",
                isSel
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : isTod
                    ? "text-primary ring-1 ring-inset ring-primary/30 hover:bg-primary/5"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className={cn(
                "text-[10px] font-medium uppercase tracking-wide",
                isSel ? "text-primary-foreground/70" : isTod ? "text-primary/80" : "text-muted-foreground"
              )}>
                {format(day, "EEE")}
              </span>
              <span className={cn(
                "text-[15px] font-bold tabular-nums leading-none",
                isSel ? "text-primary-foreground" : isTod ? "text-primary" : "text-foreground"
              )}>
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// (QuickStatsStrip removed - Revenue/ADR/RevPAR KPIs only in Night Audit)
