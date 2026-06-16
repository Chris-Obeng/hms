"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { format, startOfDay, endOfDay, addDays, eachDayOfInterval } from "date-fns";
import type { ActivityBooking } from "./_components/activity-list";
import type { ForecastDay } from "./_components/forecast-strip";

// ── Get Hotel ID Helper ────────────────────────────────────────

async function getHotelScopedClient() {
  const { orgId } = await auth();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency, logo_url")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) throw new Error("Hotel not found");

  return { supabase, hotelId: hotel.id, hotel };
}

// ── Get Dashboard Data ────────────────────────────────────────

export type DashboardData = {
  stats: {
    arrivals: number;
    uncheckedInArrivals: number;
    departures: number;
    pendingDepartures: number;
    inHouse: number;
    stayovers: number;
    newBookings: number;
    cancellations: number;
    overbookings: number;
  };
  bookings: ActivityBooking[];
  occupancy: {
    percent: number;
    totalRooms: number;
    occupiedRooms: number;
    availableRooms: number;
    outOfService: number;
    blocked: number;
  };
  forecast: ForecastDay[];
  quickStats: {
    adr: number;
    revpar: number;
    totalRevenue: number;
    roomNightsSold: number;
  };
};

export async function getDashboardData(dateStr?: string): Promise<DashboardData> {
  const { supabase, hotelId } = await getHotelScopedClient();
  const today = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const dayStr = format(today, "yyyy-MM-dd");

  // ── Parallel Queries ────────────────────────────────────────

  // Total rooms
  const { count: totalRooms } = await supabase
    .from("rooms")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("is_active", true);

  // Room breakdown
  const { data: roomStatuses } = await supabase
    .from("rooms")
    .select("status, room_type_id")
    .eq("hotel_id", hotelId)
    .eq("is_active", true);

  const occupiedRooms = roomStatuses?.filter((r) => r.status === "occupied").length || 0;
  const outOfService = roomStatuses?.filter((r) => r.status === "maintenance" || r.status === "out_of_service").length || 0;
  const blocked = roomStatuses?.filter((r) => r.status === "cleaning").length || 0;
  const activeRooms = roomStatuses?.length || 0;
  const availableRooms = activeRooms - occupiedRooms - outOfService - blocked;

  // Today's arrivals (confirmed or checked_in with check_in = today)
  const { data: arrivals } = await supabase
    .from("bookings")
    .select("id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, guests(full_name, email, phone), rooms(room_number), room_types(name)")
    .eq("hotel_id", hotelId)
    .eq("check_in", dayStr)
    .in("status", ["confirmed", "checked_in"])
    .order("check_in", { ascending: true });

  // Today's departures
  const { data: departures } = await supabase
    .from("bookings")
    .select("id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, guests(full_name, email, phone), rooms(room_number), room_types(name)")
    .eq("hotel_id", hotelId)
    .eq("check_out", dayStr)
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .order("check_out", { ascending: true });

  // In-house (currently checked in)
  const { count: inHouse } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("status", "checked_in")
    .lte("check_in", dayStr)
    .gte("check_out", dayStr);

  // Stayovers (checked in, not arriving or departing today)
  const { data: allCheckedIn } = await supabase
    .from("bookings")
    .select("id, check_in, check_out")
    .eq("hotel_id", hotelId)
    .eq("status", "checked_in");

  const stayovers = (allCheckedIn || []).filter(
    (b) => b.check_in !== dayStr && b.check_out !== dayStr
  ).length;

  // New bookings today
  const { count: newBookings } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .gte("created_at", startOfDay(today).toISOString())
    .lte("created_at", endOfDay(today).toISOString());

  // Cancellations today
  const { count: cancellations } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("status", "cancelled")
    .gte("updated_at", startOfDay(today).toISOString())
    .lte("updated_at", endOfDay(today).toISOString());

  // Detect overbookings (bookings for today that exceed available rooms)
  const { data: todayBookings } = await supabase
    .from("bookings")
    .select("id, room_id")
    .eq("hotel_id", hotelId)
    .in("status", ["confirmed", "checked_in"])
    .lte("check_in", dayStr)
    .gte("check_out", dayStr);

  const roomsNeeded = todayBookings?.length || 0;
  const overbookings = Math.max(0, roomsNeeded - (activeRooms - outOfService));

  // ── Build Activity Bookings ──────────────────────────────────

  type BookingQueryResult = {
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
    guests: { full_name: string | null; email: string | null; phone: string | null } | null;
    rooms: { room_number: string | null } | null;
    room_types: { name: string | null } | null;
  };

  const mapBooking = (b: BookingQueryResult): ActivityBooking => ({
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

  const allBookings = [
    ...(arrivals || []).map(mapBooking),
    ...(departures || []).map(mapBooking),
  ];
  // Deduplicate by id
  const seen = new Set<string>();
  const uniqueBookings = allBookings.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });

  // Also get in-house bookings for the activity list
  const { data: inHouseBookings } = await supabase
    .from("bookings")
    .select("id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, guests(full_name, email, phone), rooms(room_number), room_types(name)")
    .eq("hotel_id", hotelId)
    .eq("status", "checked_in")
    .lte("check_in", dayStr)
    .gte("check_out", dayStr);

  for (const b of inHouseBookings || []) {
    if (!seen.has(b.id)) {
      uniqueBookings.push(mapBooking(b));
      seen.add(b.id);
    }
  }

  // ── 14-Day Forecast ──────────────────────────────────────────

  const forecastDays = eachDayOfInterval({
    start: today,
    end: addDays(today, 13),
  });

  const forecast: ForecastDay[] = await Promise.all(
    forecastDays.map(async (day) => {
      const dStr = format(day, "yyyy-MM-dd");

      const { data: dayBookings } = await supabase
        .from("bookings")
        .select("id, total_amount, room_rate, room_id")
        .eq("hotel_id", hotelId)
        .in("status", ["confirmed", "checked_in"])
        .lte("check_in", dStr)
        .gte("check_out", dStr);

      const roomsSold = dayBookings?.length || 0;
      const totalRevenue = dayBookings?.reduce((s, b) => s + (b.room_rate || 0), 0) || 0;
      const occupancyRate = activeRooms > 0 ? Math.round((roomsSold / activeRooms) * 100) : 0;
      const adr = roomsSold > 0 ? Math.round(totalRevenue / roomsSold) : 0;
      const revpar = activeRooms > 0 ? Math.round(totalRevenue / activeRooms) : 0;

      return {
        date: format(day, "MMM dd"),
        iso: dStr,
        occupancyRate,
        adr,
        roomsSold,
        totalRooms: activeRooms,
        revpar,
      };
    })
  );

  // ── Quick Stats (today) ──────────────────────────────────────

  const { data: todayPayments } = await supabase
    .from("payments")
    .select("amount")
    .eq("hotel_id", hotelId)
    .eq("status", "success")
    .gte("paid_at", startOfDay(today).toISOString())
    .lte("paid_at", endOfDay(today).toISOString());

  const totalRevenueToday = todayPayments?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
  const roomNightsSold = uniqueBookings.reduce((s, b) => s + (b.nights || 1), 0);
  const adrToday = roomNightsSold > 0 ? Math.round(totalRevenueToday / roomNightsSold) : 0;
  const revparToday = activeRooms > 0 ? Math.round(totalRevenueToday / activeRooms) : 0;

  return {
    stats: {
      arrivals: arrivals?.length || 0,
      uncheckedInArrivals: arrivals?.filter((b) => b.status === "confirmed").length || 0,
      departures: departures?.length || 0,
      pendingDepartures: departures?.filter((b) => b.status !== "checked_out").length || 0,
      inHouse: inHouse || 0,
      stayovers,
      newBookings: newBookings || 0,
      cancellations: cancellations || 0,
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
    forecast,
    quickStats: {
      adr: adrToday,
      revpar: revparToday,
      totalRevenue: totalRevenueToday,
      roomNightsSold,
    },
  };
}

// ── Check In ───────────────────────────────────────────────────

export async function checkInBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await getHotelScopedClient();

    // Verify booking exists and belongs to this hotel
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, room_id")
      .eq("id", bookingId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "confirmed") return { success: false, error: "Booking cannot be checked in" };

    // Update booking status
    const { error } = await supabase
      .from("bookings")
      .update({
        status: "checked_in",
        check_in_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (error) return { success: false, error: error.message };

    // Update room status if a room is assigned
    if (booking.room_id) {
      await supabase
        .from("rooms")
        .update({ status: "occupied" })
        .eq("id", booking.room_id);
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Check-in failed" };
  }
}

// ── Check Out ──────────────────────────────────────────────────

export async function checkOutBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await getHotelScopedClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, room_id")
      .eq("id", bookingId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "checked_in") return { success: false, error: "Booking is not checked in" };

    // Update booking status
    const { error } = await supabase
      .from("bookings")
      .update({
        status: "checked_out",
        check_out_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (error) return { success: false, error: error.message };

    // Mark room as cleaning/available
    if (booking.room_id) {
      await supabase
        .from("rooms")
        .update({ status: "cleaning" })
        .eq("id", booking.room_id);
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Check-out failed" };
  }
}
