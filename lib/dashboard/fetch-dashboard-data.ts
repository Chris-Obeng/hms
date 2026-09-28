import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { businessDayBounds } from "@/lib/business-date";
import { findOverlappingBookingIds, isCheckedInStayoverOnDate } from "@/lib/calendar-domain";
import type { ActivityBooking } from "@/app/dashboard/_components/activity-list";

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
  cancelled_at?: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  guests: { full_name: string | null; email: string | null; phone: string | null } | null;
  rooms: { room_number: string | null } | null;
  room_types: { name: string | null } | null;
}

/**
 * Dashboard data for one business day. Runs on the server (initial prefetch +
 * hydration) and on the client (date stepping, refetch) — the caller passes
 * whichever RLS-scoped Supabase client fits the context.
 */
export async function fetchDashboardData(
  supabase: SupabaseClient<Database>,
  hotelId: string,
  dateStr: string,
  timeZone: string
) {
  const dayStr = dateStr;
  // Timestamp-day queries (created_at / cancelled_at / paid_at) use the
  // property's business-day bounds — the same rule the tab predicates apply —
  // so badge counts and list contents can never diverge on non-UTC devices.
  const dayBounds = businessDayBounds(dateStr, timeZone);

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
      .gte("created_at", dayBounds.startISO)
      .lt("created_at", dayBounds.endISO)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, created_at, cancelled_at, special_requests, internal_notes,
        guests(full_name, email, phone), rooms(room_number), room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .eq("status", "cancelled")
      .gte("cancelled_at", dayBounds.startISO)
      .lt("cancelled_at", dayBounds.endISO)
      .order("cancelled_at", { ascending: false }),
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
      .gte("paid_at", dayBounds.startISO)
      .lt("paid_at", dayBounds.endISO)
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
    createdAt: b.created_at ?? null,
    cancelledAt: b.cancelled_at ?? null,
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

export type DashboardQueryData = Awaited<ReturnType<typeof fetchDashboardData>>;
