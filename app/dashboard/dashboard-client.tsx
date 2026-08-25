"use client";

import * as React from "react";
import { format, isToday, startOfDay, endOfDay } from "date-fns";
import { AlertDialog, toast } from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { Banknote, CalendarClock, Percent, RotateCw, TrendingUp } from "lucide-react";

import { Calendar, Skeleton, Button } from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import { toCalendarDate, fromCalendarDate } from "@/lib/date-convert";
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
import { formatCurrencyCompact, formatDate } from "@/lib/format";
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

type DashboardSupabase = ReturnType<typeof createClient>;

interface DashboardBookingRow {
  id: string;
  reference: string;
  check_in: string;
  check_out: string;
  status: string | null;
  payment_status: string | null;
  total_amount: number;
  amount_paid: number | null;
  outstanding_balance: number | null;
  adults: number | null;
  children: number | null;
  source: string | null;
  nights: number | null;
  room_id: string | null;
  created_at: string | null;
  updated_at?: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  guests: { full_name: string | null; email: string | null; phone: string | null } | null;
  rooms: { room_number: string | null } | null;
  room_types: { name: string | null } | null;
}

async function fetchDashboardClientData(
  supabase: DashboardSupabase,
  hotelId: string,
  dateStr: string
) {
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
  const outOfService = roomStatuses.filter((r) => r.status === "maintenance" || r.status === "out_of_service").length;
  const activeRooms = roomStatuses.length;
  const occupiedRoomIds = new Set((dateBookingsRes.data || []).map((b) => b.room_id).filter(Boolean));
  const blockedRoomIds = new Set((blocksRes.data || []).map((b) => b.room_id));
  const occupiedRooms = occupiedRoomIds.size;
  const blocked = [...blockedRoomIds].filter((id) => !occupiedRoomIds.has(id)).length;
  const availableRooms = activeRooms - occupiedRooms - outOfService - blocked;

  const mapBooking = (b: DashboardBookingRow): ActivityBooking => ({
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

  const stayovers = (dateBookingsRes.data || []).filter((b) => isCheckedInStayoverOnDate({ id: b.id, roomId: b.room_id, checkIn: b.check_in, checkOut: b.check_out, status: b.status }, dayStr)).length;
  const inHouse = inHouseList.length;
  const conflictIds = findOverlappingBookingIds((dateBookingsRes.data || []).map((b) => ({ id: b.id, roomId: b.room_id, checkIn: b.check_in, checkOut: b.check_out })));
  for (const booking of uniqueBookings) booking.hasConflict = conflictIds.has(booking.id);
  const overbookings = conflictIds.size;

  const totalRevenueToday = todayPaymentsRes.data?.reduce((s: number, p) => s + (p.amount || 0), 0) || 0;
  const roomNightsSold = uniqueBookings.reduce((s: number, b) => s + (b.nights || 1), 0);
  const adrToday = roomNightsSold > 0 ? Math.round(totalRevenueToday / roomNightsSold) : 0;
  const revparToday = activeRooms > 0 ? Math.round(totalRevenueToday / activeRooms) : 0;

  return {
    stats: {
      arrivals: arrivalsRes.data?.length || 0,
      uncheckedInArrivals: arrivalsRes.data?.filter((b) => b.status === "confirmed").length || 0,
      departures: departuresRes.data?.length || 0,
      pendingDepartures: departuresRes.data?.filter((b) => b.status !== "checked_out").length || 0,
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

type DashboardQueryData = Awaited<ReturnType<typeof fetchDashboardClientData>>;

/** Optimistic-update rollback payload captured in onMutate. */
interface MutationCtx {
  previousData?: DashboardQueryData;
  queryKey?: readonly unknown[];
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
          queryClient.invalidateQueries({ queryKey: qk.dashboard(orgId, hotelId, dateParamStr) });
          queryClient.invalidateQueries({
            queryKey: qk.dashboard(orgId, hotelId, format(new Date(), "yyyy-MM-dd")),
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, orgId, queryClient, dateParamStr]);

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
      queryClient.setQueryData(queryKey, (old: DashboardQueryData | undefined) => old ? {
        ...old,
        bookings: old.bookings.map((booking) => booking.id === bookingId ? { ...booking, status } : booking),
      } : old);
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
        return data.bookings.filter((b) => b.createdAt?.slice(0, 10) === dateParamStr);
      case "cancellations":
        return data.bookings.filter((b) => b.status === "cancelled");
      case "overbookings":
        return data.bookings.filter((b) => b.hasConflict);
      default:
        return data.bookings;
    }
  }, [data, activeTab, dateParamStr]);

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
    <div className="mx-auto max-w-[1600px] space-y-5 md:space-y-6">
      {/* ── Date header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 shadow-xs">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground/70"
          >
            <CalendarClock className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-section truncate leading-tight text-foreground">
              {isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE")}
            </p>
            <p className="text-caption tabular-nums text-muted-foreground">
              {format(selectedDate, "MMMM d, yyyy")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={() => refetch()}
            aria-label="Refresh data"
            className="size-8 min-w-8 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <RotateCw className={cn("size-3.5", isRefetching && "animate-spin")} />
          </Button>
          <DashboardHeader selectedDate={selectedDate} onDateChange={handleDateChange} />
        </div>
      </div>

      {/* ── Mobile week view (HeroUI Calendar, 1-week grid) ─────── */}
      <MobileWeekCalendar selectedDate={selectedDate} onDateChange={handleDateChange} />

      {/* ── Quick stats strip ───────────────────────────────────── */}
      <QuickStatsStrip stats={data.quickStats} currency={currency} />

      {/* ── Main 2-column grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[270px_1fr] lg:gap-6">
        {/* Left column */}
        <div className="space-y-4 lg:space-y-6">
          <DateCard selectedDate={selectedDate} onDateChange={handleDateChange} />

          <OccupancyCard
            occupancyPercent={data.occupancy.percent}
            availableUnits={data.occupancy.availableRooms}
            bookedUnits={data.occupancy.occupiedRooms}
            outOfService={data.occupancy.outOfService}
            blockedDates={data.occupancy.blocked}
            totalRooms={data.occupancy.totalRooms}
          />
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
        variant="opaque"
        isOpen={earlyCheckoutBooking !== null || earlyCheckinBooking !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeEarlyConfirmation();
        }}
      >
        <AlertDialog.Container placement="auto" size="md">
          <AlertDialog.Dialog className="rounded-2xl border border-border/80 bg-card p-6 shadow-2xl relative overflow-hidden">
            <AlertDialog.CloseTrigger
              onPress={closeEarlyConfirmation}
              className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-full bg-muted/80 text-foreground/80 hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95 border border-border/60 transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <AlertDialog.Header className="gap-3 pb-1">
              <AlertDialog.Icon
                status={earlyCheckinBooking ? "accent" : "warning"}
                className={cn(
                  "size-12 rounded-2xl flex items-center justify-center border shadow-xs transition-all",
                  earlyCheckinBooking
                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25"
                )}
              >
                <CalendarClock className="size-6" />
              </AlertDialog.Icon>
              <AlertDialog.Heading className="text-lg font-bold tracking-tight text-foreground">
                {earlyCheckinBooking ? "Confirm early check-in" : "Confirm early check-out"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-2.5 py-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                {earlyCheckinBooking?.guestName || earlyCheckoutBooking?.guestName} is scheduled to {earlyCheckinBooking ? "check in" : "check out"} on{" "}
                <strong className="font-semibold text-foreground">
                  {earlyCheckinBooking
                    ? formatDate(earlyCheckinBooking.checkIn, "dd MMM yyyy")
                    : earlyCheckoutBooking
                      ? formatDate(earlyCheckoutBooking.checkOut, "dd MMM yyyy")
                    : ""}
                </strong>.
              </p>
              <p>
                {earlyCheckinBooking
                  ? "Checking in now will assign the room before scheduled arrival date."
                  : "Checking out now will mark room available before scheduled departure date."}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer className="pt-3 gap-2.5 flex items-center justify-end">
              <Button
                variant="tertiary"
                onPress={closeEarlyConfirmation}
                className="rounded-xl font-medium px-4 h-10 border border-border/80 bg-background/80 text-foreground hover:bg-muted/80 hover:border-border transition-all shadow-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onPress={earlyCheckinBooking ? confirmEarlyCheckin : confirmEarlyCheckout}
                className={cn(
                  "rounded-xl font-semibold px-5 h-10 text-white shadow-xs transition-all active:scale-[0.98] cursor-pointer",
                  earlyCheckinBooking
                    ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 dark:text-zinc-950"
                    : "bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-zinc-950"
                )}
              >
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
    <div className="mx-auto max-w-[1600px] space-y-5 md:space-y-6">
      <Skeleton className="h-16 w-full rounded-2xl" />

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

// ── Mobile week calendar — HeroUI Calendar, single-week grid ───────

function MobileWeekCalendar({
  selectedDate,
  onDateChange,
}: {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card px-2 pb-3 pt-3 shadow-xs md:hidden">
      <Calendar
        aria-label="Select day"
        visibleDuration={{ weeks: 1 }}
        pageBehavior="single"
        firstDayOfWeek="mon"
        value={toCalendarDate(selectedDate)}
        onChange={(date) => {
          if (date) onDateChange(fromCalendarDate(date as CalendarDate));
        }}
      >
        <Calendar.Header className="pb-1">
          <Calendar.NavButton slot="previous" />
          <Calendar.Heading />
          <Calendar.NavButton slot="next" />
        </Calendar.Header>
        <Calendar.Grid>
          <Calendar.GridHeader>
            {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
          </Calendar.GridHeader>
          <Calendar.GridBody>
            {(date) => <Calendar.Cell date={date} />}
          </Calendar.GridBody>
        </Calendar.Grid>
      </Calendar>
    </div>
  );
}

// ── Today's performance strip ──────────────────────────────────────

function QuickStatsStrip({
  stats,
  currency,
}: {
  stats: { adr: number; revpar: number; totalRevenue: number; roomNightsSold: number };
  currency: string;
}) {
  const items = [
    {
      icon: Banknote,
      label: "Revenue today",
      value: formatCurrencyCompact(stats.totalRevenue, currency),
      tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
    },
    {
      icon: TrendingUp,
      label: "ADR",
      value: formatCurrencyCompact(stats.adr, currency),
      tone: "text-sky-600 dark:text-sky-400 bg-sky-500/10 ring-sky-500/20",
    },
    {
      icon: Percent,
      label: "RevPAR",
      value: formatCurrencyCompact(stats.revpar, currency),
      tone: "text-violet-600 dark:text-violet-400 bg-violet-500/10 ring-violet-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map(({ icon: Icon, label, value, tone }) => (
        <div
          key={label}
          className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card px-3 py-2.5 shadow-xs sm:gap-3 sm:px-4"
        >
          <span
            aria-hidden
            className={cn(
              "hidden size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset sm:grid",
              tone
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {label}
            </p>
            <p className="text-kpi truncate tabular-nums text-foreground">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
