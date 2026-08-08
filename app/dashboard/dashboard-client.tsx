"use client";

import * as React from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { addDays, startOfWeek } from "date-fns";
import { AlertDialog, toast } from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { CalendarClock, RotateCw } from "lucide-react";

import { Skeleton, Button } from "@heroui/react";
import { DashboardHeader } from "./_components/dashboard-header";
import { DateCard } from "./_components/date-card";
import { OccupancyCard } from "./_components/occupancy-card";
import { ActivityTabs, buildActivityTabs, type ActivityTab } from "./_components/activity-tabs";
import { ActivityList, type ActivityBooking } from "./_components/activity-list";
import { BookingDetailDrawer } from "@/components/bookings/booking-detail-drawer";
import { createClient } from "@/lib/supabase/client";
import { writeAuditLog } from "@/lib/audit";
import { qk } from "@/lib/query-keys";
import { findOverlappingBookingIds, isCheckedInStayoverOnDate, isInHouseOnDate } from "@/lib/calendar-domain";
import { updateBookingStatus } from "@/app/actions/bookings";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import PullToRefresh from "react-simple-pull-to-refresh";

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
    dateBookingsRes,
    blocksRes,
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
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, special_requests, internal_notes,
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
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, special_requests, internal_notes,
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
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, special_requests, internal_notes,
        guests(full_name, email, phone),
        rooms(room_number),
        room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .eq("status", "checked_in")
      .lte("check_in", dayStr)
      .gte("check_out", dayStr),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, special_requests, internal_notes,
        guests(full_name, email, phone), rooms(room_number), room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .gte("created_at", startOfDay(today).toISOString())
      .lte("created_at", endOfDay(today).toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, updated_at, special_requests, internal_notes,
        guests(full_name, email, phone), rooms(room_number), room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .eq("status", "cancelled")
      .gte("updated_at", startOfDay(today).toISOString())
      .lte("updated_at", endOfDay(today).toISOString())
      .order("updated_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, special_requests, internal_notes,
        guests(full_name, email, phone), rooms(room_number), room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", dayStr)
      .gt("check_out", dayStr),
    supabase
      .from("availability_blocks")
      .select("room_id, start_date, end_date")
      .eq("hotel_id", hotelId)
      .lte("start_date", dayStr)
      .gt("end_date", dayStr),
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
  if (dateBookingsRes.error) throw dateBookingsRes.error;
  if (blocksRes.error) throw blocksRes.error;
  if (todayPaymentsRes.error) throw todayPaymentsRes.error;

  const roomStatuses = roomsRes.data || [];
  const outOfService = roomStatuses.filter((r: any) => r.status === "maintenance" || r.status === "out_of_service").length;
  const activeRooms = roomStatuses.length;
  const occupiedRoomIds = new Set((dateBookingsRes.data || []).map((b: any) => b.room_id).filter(Boolean));
  const blockedRoomIds = new Set((blocksRes.data || []).map((b: any) => b.room_id));
  const occupiedRooms = occupiedRoomIds.size;
  const blocked = [...blockedRoomIds].filter((id) => !occupiedRoomIds.has(id)).length;
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
    createdAt: b.created_at || null,
    hasConflict: false,
    hasNotes: Boolean(b.special_requests?.trim() || b.internal_notes?.trim()),
  });

  const arrivalsList = (arrivalsRes.data || []).map(mapBooking);
  const departuresList = (departuresRes.data || []).map(mapBooking);
  const inHouseList = (inHouseBookingsRes.data || []).map(mapBooking);
  const recordedList = (newBookingsRes.data || []).map(mapBooking);
  const cancellationsList = (cancellationsRes.data || []).map(mapBooking);
  const dateBookingsList = (dateBookingsRes.data || []).map(mapBooking);

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
  for (const b of [...recordedList, ...cancellationsList, ...dateBookingsList]) {
    if (!seen.has(b.id)) { uniqueBookings.push(b); seen.add(b.id); }
  }

  const stayovers = (dateBookingsRes.data || []).filter((b: any) => isCheckedInStayoverOnDate({ id: b.id, roomId: b.room_id, checkIn: b.check_in, checkOut: b.check_out, status: b.status }, dayStr)).length;
  const inHouse = inHouseList.length;
  const conflictIds = findOverlappingBookingIds((dateBookingsRes.data || []).map((b: any) => ({ id: b.id, roomId: b.room_id, checkIn: b.check_in, checkOut: b.check_out })));
  for (const booking of uniqueBookings) booking.hasConflict = conflictIds.has(booking.id);
  const overbookings = conflictIds.size;

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
      newBookings: recordedList.length,
      cancellations: cancellationsList.length,
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

export function DashboardClient({ hotelId, currency }: DashboardClientProps) {
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuth();

  const [selectedDate, setSelectedDate] = React.useState(new Date());
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
    error: queryError,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: qk.dashboard(orgId || "", hotelId, dateParamStr),
    queryFn: () => {
      const supabase = createClient();
      return fetchDashboardClientData(supabase, hotelId, dateParamStr);
    },
    enabled: !!orgId,
    refetchInterval: 60000,
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : "Failed to load dashboard data") : null;

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

  const handleBookingChanged = React.useCallback(() => {
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: qk.dashboard(orgId, hotelId, dateParamStr) });
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

  const statusMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: "cancelled" | "no_show" }) => {
      const result = await updateBookingStatus(bookingId, status);
      if (!result.success) throw new Error(result.error || "Status update failed");
      return { bookingId, status };
    },
    onMutate: async ({ bookingId, status }) => {
      const queryKey = qk.dashboard(orgId || "", hotelId, dateParamStr);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => old ? {
        ...old,
        bookings: old.bookings.map((booking: any) => booking.id === bookingId ? { ...booking, status } : booking),
      } : old);
      return { previousData, queryKey };
    },
    onError: (err, _variables, context: any) => {
      if (context?.previousData) queryClient.setQueryData(context.queryKey, context.previousData);
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
          (b: any) => b.checkIn === format(selectedDate, "yyyy-MM-dd") &&
            ["confirmed", "checked_in"].includes(b.status)
        );
      case "departures":
        return data.bookings.filter(
          (b: any) => b.checkOut === format(selectedDate, "yyyy-MM-dd") &&
            ["confirmed", "checked_in", "checked_out"].includes(b.status)
        );
      case "in_house":
        return data.bookings.filter((b: any) => isInHouseOnDate({ id: b.id, roomId: null, checkIn: b.checkIn, checkOut: b.checkOut, status: b.status }, dateParamStr));
      case "bookings":
        return data.bookings.filter((b: any) => b.createdAt?.slice(0, 10) === dateParamStr);
      case "cancellations":
        return data.bookings.filter((b: any) => b.status === "cancelled");
      case "overbookings":
        return data.bookings.filter((b: any) => b.hasConflict);
      default:
        return data.bookings;
    }
  }, [data?.bookings, activeTab, dateParamStr]);

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
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Cloudbeds Header Row */}
      <div className="flex items-center justify-between pb-2 rounded-xl border border-border/50 bg-card/70 px-3 py-2">
        <div className="hidden lg:flex items-center gap-2 text-sm font-semibold text-foreground"><CalendarClock className="size-4 text-primary" />{format(selectedDate, "EEEE, MMM d")}</div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={() => refetch()}
            aria-label="Refresh data"
            className="hidden md:inline-flex size-8 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <RotateCw className={`size-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>

          <div className="hidden md:block">
            <DashboardHeader selectedDate={selectedDate} onDateChange={handleDateChange} />
          </div>
        </div>
      </div>

      <MobileWeekStrip selectedDate={selectedDate} onDateChange={handleDateChange} />

      {/* Cloudbeds Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr] gap-6 items-start">
        {/* Left Column: Date Widget + Occupancy Widget */}
        <div className="space-y-4 lg:space-y-6">
          <div>
            <DateCard selectedDate={selectedDate} onDateChange={handleDateChange} />
          </div>
          
          <div>
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

        {/* Right Column: Activity Card Container */}
        <div className="rounded-xl border border-border/50 bg-card shadow-xs overflow-hidden">
          <ActivityTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

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
        isOpen={earlyCheckoutBooking !== null || earlyCheckinBooking !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEarlyCheckoutBooking(null);
        }}
        variant="blur"
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card shadow-xl">
            <Button
              isIconOnly
              variant="tertiary"
              aria-label="Close confirmation"
              onPress={() => { setEarlyCheckoutBooking(null); setEarlyCheckinBooking(null); }}
              className="absolute right-4 top-4 z-10 size-9 rounded-full border border-border bg-muted text-foreground hover:bg-muted/70"
            >
              <span className="text-xl leading-none">×</span>
            </Button>
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning">
                <CalendarClock className="size-5" />
              </AlertDialog.Icon>
                <AlertDialog.Heading>
                  {earlyCheckinBooking ? "Confirm early check-in" : "Confirm early check-out"}
                </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {earlyCheckinBooking?.guestName || earlyCheckoutBooking?.guestName} is scheduled to {earlyCheckinBooking ? "check in" : "check out"} on{" "}
                <strong className="font-semibold text-foreground">
                  {earlyCheckinBooking
                    ? formatDate(earlyCheckinBooking.checkIn, "dd MMM yyyy")
                    : earlyCheckoutBooking
                      ? formatDate(earlyCheckoutBooking.checkOut, "dd MMM yyyy")
                    : ""}
                </strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                {earlyCheckinBooking
                  ? "Checking in now will assign the room before scheduled arrival date."
                  : "Checking out now will mark room available before scheduled departure date."}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={() => { setEarlyCheckoutBooking(null); setEarlyCheckinBooking(null); }}>
                Cancel
              </Button>
              <Button variant="primary" onPress={earlyCheckinBooking ? confirmEarlyCheckin : confirmEarlyCheckout}>
                Confirm {earlyCheckinBooking ? "early check-in" : "early check-out"}
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
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr] gap-6">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function MobileWeekStrip({ selectedDate, onDateChange }: { selectedDate: Date; onDateChange: (date: Date) => void }) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  return (
    <div className="-mx-1 -mt-4 overflow-x-auto pb-1 md:hidden">
      <div className="grid min-w-[350px] grid-cols-7 gap-1 rounded-xl border border-border/60 bg-card p-2 shadow-xs">
        {Array.from({ length: 7 }, (_, index) => {
          const day = addDays(weekStart, index);
          const active = format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
          return (
            <button key={day.toISOString()} type="button" onClick={() => onDateChange(day)}
              className={cn("flex min-h-16 flex-col items-center justify-center rounded-lg px-1 py-2 transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}
              aria-pressed={active}>
              <span className="text-[10px] font-semibold uppercase">{format(day, "EEE")}</span>
              <span className="mt-1 text-lg font-semibold tabular-nums">{format(day, "d")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
