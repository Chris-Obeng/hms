"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { format, startOfDay, endOfDay } from "date-fns";
import { writeAuditLog } from "@/lib/audit";
import { requireMinRole } from "@/lib/auth";
import type { ActivityBooking } from "./_components/activity-list";

// ── Get Hotel ID Helper ────────────────────────────────────────

async function getHotelScopedClient() {
  const { orgId, userId } = await auth();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel, error: hotelError } = await supabase
    .from("hotels")
    .select("id, name, currency, logo_url")
    .eq("clerk_org_id", orgId)
    .limit(1)
    .maybeSingle();

  if (hotelError) throw new Error(`DB error fetching hotel: ${hotelError.message}`);
  if (!hotel) throw new Error("Hotel not found");

  // Resolve current staff for audit logs
  const { data: staffProfile } = userId
    ? await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .eq("clerk_user_id", userId)
        .eq("clerk_org_id", orgId)
        .maybeSingle()
    : { data: null };

  return {
    supabase,
    hotelId: hotel.id,
    hotel,
    staffId: staffProfile?.id ?? null,
    staffName: staffProfile?.full_name ?? null,
  };
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
  const blocked = 0;
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
    .eq("status", "checked_in")
    .lt("check_in", dayStr)
    .gt("check_out", dayStr);

  const stayovers = allCheckedIn?.length || 0;

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
    await requireMinRole("front_desk", "check guests in");
    const { supabase, hotelId, staffId, staffName } = await getHotelScopedClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, reference, status, room_id")
      .eq("id", bookingId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "confirmed") return { success: false, error: "Booking cannot be checked in" };

    const { error } = await supabase
      .from("bookings")
      .update({ status: "checked_in", check_in_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (error) return { success: false, error: error.message };

    if (booking.room_id) {
      await supabase.from("rooms").update({ status: "occupied" }).eq("id", booking.room_id);
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId,
      staffName,
      action: "booking.checked_in",
      entityType: "booking",
      entityId: bookingId,
      afterState: { reference: booking.reference, status: "checked_in" },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Check-in failed" };
  }
}

// ── Check Out ──────────────────────────────────────────────────

export async function checkOutBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireMinRole("front_desk", "check guests out");
    const { supabase, hotelId, staffId, staffName } = await getHotelScopedClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, reference, status, room_id")
      .eq("id", bookingId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "checked_in") return { success: false, error: "Booking is not checked in" };

    const { error } = await supabase
      .from("bookings")
      .update({ status: "checked_out", check_out_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (error) return { success: false, error: error.message };

    if (booking.room_id) {
      await supabase.from("rooms").update({ status: "available" }).eq("id", booking.room_id);
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId,
      staffName,
      action: "booking.checked_out",
      entityType: "booking",
      entityId: bookingId,
      afterState: { reference: booking.reference, status: "checked_out" },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Check-out failed" };
  }
}
