"use client";

import * as React from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "./_components/dashboard-header";
import { ActivityTabs, buildActivityTabs, type ActivityTab } from "./_components/activity-tabs";
import { ActivityList, type ActivityBooking } from "./_components/activity-list";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { OccupancyCard } from "./_components/occupancy-card";
import { QuickStats, TodaySummary } from "./_components/quick-stats";
import { createClient } from "@/lib/supabase/client";
import { writeAuditLog } from "@/lib/audit";
import { qk } from "@/lib/query-keys";

// ── Props ──────────────────────────────────────────────────────

interface DashboardClientProps {
  hotelId: string;
  hotelName: string;
  currency: string;
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

// ── Client-Side Fetcher ────────────────────────────────────────

async function fetchDashboardClientData(supabase: any, hotelId: string, dateStr: string): Promise<any> {
  const dayStr = dateStr;
  const today = new Date(dateStr + "T00:00:00");

  const [
    roomsRes,
    arrivalsRes,
    departuresRes,
    inHouseBookingsRes,
    newBookingsRes,
    cancellationsRes,
    todayBookingsRes,
    todayPaymentsRes
  ] = await Promise.all([
    supabase
      .from("rooms")
      .select("status, room_type_id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at,
        guests(full_name, email, phone),
        rooms(room_number),
        room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .eq("check_in", dayStr)
      .in("status", ["confirmed", "checked_in"])
      .order("check_in", { ascending: true }),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at,
        guests(full_name, email, phone),
        rooms(room_number),
        room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .eq("check_out", dayStr)
      .in("status", ["confirmed", "checked_in", "checked_out"])
      .order("check_out", { ascending: true }),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at,
        guests(full_name, email, phone),
        rooms(room_number),
        room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .eq("status", "checked_in"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .gte("created_at", startOfDay(today).toISOString())
      .lte("created_at", endOfDay(today).toISOString()),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("status", "cancelled")
      .gte("updated_at", startOfDay(today).toISOString())
      .lte("updated_at", endOfDay(today).toISOString()),
    supabase
      .from("bookings")
      .select("id, room_id")
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", dayStr)
      .gte("check_out", dayStr),
    supabase
      .from("payments")
      .select("amount")
      .eq("hotel_id", hotelId)
      .eq("status", "success")
      .gte("paid_at", startOfDay(today).toISOString())
      .lte("paid_at", endOfDay(today).toISOString())
  ]);

  if (roomsRes.error) throw roomsRes.error;
  if (arrivalsRes.error) throw arrivalsRes.error;
  if (departuresRes.error) throw departuresRes.error;
  if (inHouseBookingsRes.error) throw inHouseBookingsRes.error;
  if (newBookingsRes.error) throw newBookingsRes.error;
  if (cancellationsRes.error) throw cancellationsRes.error;
  if (todayBookingsRes.error) throw todayBookingsRes.error;
  if (todayPaymentsRes.error) throw todayPaymentsRes.error;

  const roomStatuses = roomsRes.data || [];
  const occupiedRooms = roomStatuses.filter((r: any) => r.status === "occupied").length;
  const outOfService = roomStatuses.filter((r: any) => r.status === "maintenance" || r.status === "out_of_service").length;
  const blocked = roomStatuses.filter((r: any) => r.status === "cleaning").length;
  const activeRooms = roomStatuses.length;
  const availableRooms = activeRooms - occupiedRooms - outOfService - blocked;

  const mapBooking = (b: any): ActivityBooking => ({
    id: b.id,
    reference: b.reference,
    guestName: b.guests?.full_name || "Unknown",
    guestPhone: b.guests?.phone || null,
    guestEmail: b.guests?.email || null,
    roomNumber: b.rooms?.room_number || null,
    roomType: b.room_types?.name || null,
    checkIn: b.check_in,
    checkOut: b.check_out,
    nights: b.nights,
    adults: b.adults,
    children: b.children,
    status: b.status || "confirmed",
    paymentStatus: b.payment_status || "unpaid",
    totalAmount: b.total_amount,
    source: b.source || "direct",
  });

  const arrivalsList = (arrivalsRes.data || []).map(mapBooking);
  const departuresList = (departuresRes.data || []).map(mapBooking);
  const inHouseList = (inHouseBookingsRes.data || []).map(mapBooking);
  
  const seen = new Set<string>();
  const uniqueBookings = [...arrivalsList, ...departuresList].filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });

  for (const b of inHouseList) {
    if (!seen.has(b.id)) {
      uniqueBookings.push(b);
      seen.add(b.id);
    }
  }

  const stayovers = (inHouseBookingsRes.data || []).filter(
    (b: any) => b.check_in !== dayStr && b.check_out !== dayStr
  ).length;

  const inHouse = (inHouseBookingsRes.data || []).filter(
    (b: any) => b.check_in <= dayStr && b.check_out >= dayStr
  ).length;

  const roomsNeeded = todayBookingsRes.data?.length || 0;
  const overbookings = Math.max(0, roomsNeeded - (activeRooms - outOfService));

  const totalRevenueToday = todayPaymentsRes.data?.reduce((s: number, p: any) => s + (p.amount || 0), 0) || 0;
  const roomNightsSold = uniqueBookings.reduce((s: number, b: any) => s + (b.nights || 1), 0);
  const adrToday = roomNightsSold > 0 ? Math.round(totalRevenueToday / roomNightsSold) : 0;
  const revparToday = activeRooms > 0 ? Math.round(totalRevenueToday / activeRooms) : 0;

  return {
    stats: {
      arrivals: arrivalsRes.data?.length || 0,
      uncheckedInArrivals: arrivalsRes.data?.filter((b: any) => b.status === "confirmed").length || 0,
      departures: departuresRes.data?.length || 0,
      pendingDepartures: departuresRes.data?.filter((b: any) => b.status !== "checked_out").length || 0,
      inHouse,
      stayovers,
      newBookings: newBookingsRes.count || 0,
      cancellations: cancellationsRes.count || 0,
      overbookings,
    },
    bookings: uniqueBookings,
    occupancy: {
      percent: activeRooms > 0 ? Math.round((occupiedRooms / activeRooms) * 100) : 0,
      totalRooms: activeRooms,
      occupiedRooms,
      availableRooms,
      outOfService,
      blocked,
    },
    quickStats: {
      adr: adrToday,
      revpar: revparToday,
      totalRevenue: totalRevenueToday,
      roomNightsSold,
    },
  };
}

// ── Main Component ─────────────────────────────────────────────

export function DashboardClient({ hotelId, hotelName, currency }: DashboardClientProps) {
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuth();
  
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [activeTab, setActiveTab] = React.useState<ActivityTab>("arrivals");
  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // Check-in/out loading states
  const [checkingIn, setCheckingIn] = React.useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = React.useState<Set<string>>(new Set());

  const dateParamStr = format(selectedDate, "yyyy-MM-dd");

  // Query staff profile for audit logging
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

  // Main dashboard data query
  const {
    data,
    isLoading: loading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: qk.dashboard(orgId || "", hotelId, dateParamStr),
    queryFn: () => {
      const supabase = createClient();
      return fetchDashboardClientData(supabase, hotelId, dateParamStr);
    },
    enabled: !!orgId,
    refetchInterval: 60000, // Auto-refresh every 60s
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : "Failed to load dashboard data") : null;

  // Realtime subscription — refresh on any booking change for this hotel
  React.useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`hotel:${hotelId}:dashboard`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard', orgId, hotelId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient]);

  // Re-fetch helper (called by detail drawer changes)
  const handleBookingChanged = React.useCallback(() => {
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: qk.dashboard(orgId, hotelId, dateParamStr) });
    }
  }, [queryClient, orgId, hotelId, dateParamStr]);

  // Date change handler
  const handleDateChange = React.useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  // View booking details
  const handleViewDetails = React.useCallback((booking: ActivityBooking) => {
    setSelectedBookingId(booking.id);
    setDetailOpen(true);
  }, []);

  // Mutation for check-in with optimistic UI
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
        const { error: roomError } = await supabase
          .from("rooms")
          .update({ status: "occupied" })
          .eq("id", booking.room_id);
        if (roomError) throw roomError;
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
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          bookings: old.bookings.map((b: any) =>
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
    onError: (err, bookingId, context: any) => {
      const queryKey = qk.dashboard(orgId || "", hotelId, dateParamStr);
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(err instanceof Error ? err.message : "Check-in failed");
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

  // Mutation for check-out with optimistic UI
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
        const { error: roomError } = await supabase
          .from("rooms")
          .update({ status: "cleaning" })
          .eq("id", booking.room_id);
        if (roomError) throw roomError;
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
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          bookings: old.bookings.map((b: any) =>
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
    onError: (err, bookingId, context: any) => {
      const queryKey = qk.dashboard(orgId || "", hotelId, dateParamStr);
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast.error(err instanceof Error ? err.message : "Check-out failed");
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
    checkInMutation.mutate(bookingId);
  }, [checkInMutation]);

  const handleCheckOut = React.useCallback((bookingId: string) => {
    checkOutMutation.mutate(bookingId);
  }, [checkOutMutation]);

  // ── Derived state (must be BEFORE early returns to avoid hook ordering violations) ──
  const tabs = data ? buildActivityTabs(data.stats) : buildActivityTabs(defaultEmptyStats);
  const dateStr = format(selectedDate, "EEEE, MMMM d, yyyy");

  // Filter bookings by active tab (unconditional hook call)
  const filteredBookings = React.useMemo(() => {
    if (!data) return [];
    switch (activeTab) {
      case "arrivals":
        return data.bookings.filter(
          (b: any) => b.checkIn === format(selectedDate, "yyyy-MM-dd") &&
            ["confirmed", "checked_in"].includes(b.status)
        );
      case "departures":
        return data.bookings.filter(
          (b: any) => b.checkOut === format(selectedDate, "yyyy-MM-dd") &&
            ["confirmed", "checked_in", "checked_out"].includes(b.status)
        );
      case "in_house":
        return data.bookings.filter((b: any) => b.status === "checked_in");
      case "stayovers":
        return data.bookings.filter(
          (b: any) => b.status === "checked_in" &&
            b.checkIn !== format(selectedDate, "yyyy-MM-dd") &&
            b.checkOut !== format(selectedDate, "yyyy-MM-dd")
        );
      default:
        return data.bookings;
    }
  }, [data?.bookings, activeTab, selectedDate]);

  // ── Loading State ────────────────────────────────────────────
  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  // ── Error State ──────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground">Failed to load dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{error}</p>
        <Button variant="outline" size="sm" className="mt-4 rounded-lg" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  // ── Null state ────────────────────────────────────────────────
  if (!data) return null;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Page Header with Date Nav */}
      <DashboardHeader selectedDate={selectedDate} onDateChange={handleDateChange} />

      {/* Activity Tabs Scoreboard */}
      <ActivityTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Content: Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 md:gap-8">
        {/* Left: Activity List (3 cols) */}
        <div className="xl:col-span-3 space-y-6">
          <ActivityList
            bookings={filteredBookings}
            activeTab={activeTab}
            loading={loading}
            currency={currency}
            onCheckIn={(id) => {
              if (!checkingIn.has(id)) handleCheckIn(id);
            }}
            onCheckOut={(id) => {
              if (!checkingOut.has(id)) handleCheckOut(id);
            }}
            onViewDetails={handleViewDetails}
          />
        </div>

        {/* Right Panel: Occupancy + Quick Stats + Summary (1 col) */}
        <div className="space-y-5">
          {/* Occupancy Card */}
          <OccupancyCard
            occupancyPercent={data.occupancy.percent}
            availableUnits={data.occupancy.availableRooms}
            bookedUnits={data.occupancy.occupiedRooms}
            outOfService={data.occupancy.outOfService}
            blockedDates={data.occupancy.blocked}
            totalRooms={data.occupancy.totalRooms}
          />

          {/* Quick Stats */}
          <QuickStats data={data.quickStats} currency={currency} />

          {/* Today's Summary */}
          <TodaySummary data={{ arrivals: data.stats.arrivals, departures: data.stats.departures, inHouse: data.stats.inHouse }} />
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
        onBookingChanged={handleBookingChanged}
      />
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-52 rounded-xl" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 flex-1 rounded-xl" />
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 md:gap-8">
        <div className="xl:col-span-3 space-y-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <div className="space-y-5">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
