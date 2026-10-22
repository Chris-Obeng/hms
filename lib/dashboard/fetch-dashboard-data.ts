import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { businessDayBounds } from "@/lib/business-date";
import { findOverlappingBookingIds, isCheckedInStayoverOnDate } from "@/lib/calendar-domain";
import type { ActivityBooking } from "@/app/dashboard/_components/activity-list";
import { fetchDashboardOccupancy } from "./fetch-dashboard-occupancy";

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
  rooms_count?: number | null;
  group_id?: string | null;
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
    occupancy,
    arrivalsRes,
    departuresRes,
    inHouseBookingsRes,
    newBookingsRes,
    cancellationsRes,
    dateBookingsRes,
    todayPaymentsRes
  ] = await Promise.all([
    fetchDashboardOccupancy(supabase, hotelId, dateStr, timeZone),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, rooms_count, created_at, special_requests, internal_notes,
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
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, rooms_count, created_at, special_requests, internal_notes,
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
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, rooms_count, created_at, special_requests, internal_notes,
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
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, rooms_count, created_at, special_requests, internal_notes,
        guests(full_name, email, phone), rooms(room_number), room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .gte("created_at", dayBounds.startISO)
      .lt("created_at", dayBounds.endISO)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(`
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, rooms_count, created_at, cancelled_at, special_requests, internal_notes,
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
        id, reference, check_in, check_out, status, payment_status, total_amount, amount_paid, outstanding_balance, adults, children, source, nights, room_id, rooms_count, group_id, created_at, special_requests, internal_notes,
        guests(full_name, email, phone), rooms(room_number), room_types(name)
      `)
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", dayStr)
      .gt("check_out", dayStr),
    supabase
      .from("payments")
      .select("amount")
      .eq("hotel_id", hotelId)
      .eq("status", "success")
      .gte("paid_at", dayBounds.startISO)
      .lt("paid_at", dayBounds.endISO)
  ]);

  if (arrivalsRes.error) throw arrivalsRes.error;
  if (departuresRes.error) throw departuresRes.error;
  if (inHouseBookingsRes.error) throw inHouseBookingsRes.error;
  if (newBookingsRes.error) throw newBookingsRes.error;
  if (cancellationsRes.error) throw cancellationsRes.error;
  if (dateBookingsRes.error) throw dateBookingsRes.error;
  if (todayPaymentsRes.error) throw todayPaymentsRes.error;

  const mapBooking = (b: DashboardBookingRow): ActivityBooking => ({
    id: b.id,
    reference: b.reference,
    guestName: b.guests?.full_name || "Unknown",
    guestPhone: b.guests?.phone || null,
    guestEmail: b.guests?.email || null,
    roomNumber: b.rooms?.room_number || null,
    roomType: b.room_types?.name || null,
    // Units held by this row: >1 only on legacy single-row multi-room bookings
    // (group reservations are one row per room, so each reads 1).
    roomsCount: Math.max(1, b.rooms_count ?? 1),
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
  const revparToday = occupancy.totalRooms && occupancy.totalRooms > 0 ? Math.round(totalRevenueToday / occupancy.totalRooms) : null;

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
    occupancy,
    quickStats: {
      adr: adrToday,
      revpar: revparToday,
      totalRevenue: totalRevenueToday,
      roomNightsSold,
    },
  };
}

export type DashboardQueryData = Awaited<ReturnType<typeof fetchDashboardData>>;
