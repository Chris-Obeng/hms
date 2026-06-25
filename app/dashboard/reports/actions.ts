"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { eachDayOfInterval, format, parseISO, startOfWeek } from "date-fns";

async function getHotelId() {
  const { orgId } = await auth();
  if (!orgId) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, currency")
    .eq("clerk_org_id", orgId)
    .single();
  if (!hotel) throw new Error("Hotel not found");
  return { hotelId: hotel.id, currency: hotel.currency ?? "GHS", supabase };
}

// ── Types ────────────────────────────────────────────────────────

export interface OccupancyReportData {
  dailyOccupancy: { date: string; occupancy: number; occupied: number; total: number }[];
  avgOccupancy: number;
  totalNightsSold: number;
  byRoomType: { name: string; nights: number; avgOccupancy: number; totalRooms: number }[];
}

export interface RevenueReportData {
  weeklyRevenue: { week: string; revenue: number }[];
  totalRevenue: number;
  avgNightlyRate: number;
  outstandingBalance: number;
  bySource: { source: string; revenue: number; count: number }[];
}

export interface SourcesReportData {
  totalBookings: number;
  bySource: { source: string; count: number; revenue: number; pct: number }[];
}

const ACTIVE = ["confirmed", "checked_in", "checked_out"];

// ── Occupancy ────────────────────────────────────────────────────

export async function getOccupancyReport(
  startDate: string,
  endDate: string
): Promise<OccupancyReportData> {
  const { hotelId, supabase } = await getHotelId();

  const [roomsResult, bookingsResult, roomTypesResult] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, room_type_id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true),
    supabase
      .from("bookings")
      .select("check_in, check_out, nights, room_type_id")
      .eq("hotel_id", hotelId)
      .in("status", ACTIVE)
      .lt("check_in", endDate)
      .gt("check_out", startDate),
    supabase
      .from("room_types")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .eq("is_active", true),
  ]);

  const totalRooms = roomsResult.data?.length ?? 0;
  const bookings = bookingsResult.data ?? [];
  const roomTypes = roomTypesResult.data ?? [];

  const days = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  });

  const roomsByType = new Map<string, number>();
  for (const r of roomsResult.data ?? []) {
    roomsByType.set(r.room_type_id, (roomsByType.get(r.room_type_id) ?? 0) + 1);
  }

  const dailyOccupancy = days.map((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const occupied = bookings.filter(
      (b) => b.check_in <= dateStr && b.check_out > dateStr
    ).length;
    return {
      date: dateStr,
      occupied,
      total: totalRooms,
      occupancy: totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0,
    };
  });

  const totalNightsSold = bookings.reduce((s, b) => s + (b.nights ?? 0), 0);
  const avgOccupancy =
    dailyOccupancy.length > 0
      ? Math.round(dailyOccupancy.reduce((s, d) => s + d.occupancy, 0) / dailyOccupancy.length)
      : 0;

  const byRoomType = roomTypes.map((rt) => {
    const rtRooms = roomsByType.get(rt.id) ?? 0;
    const rtBookings = bookings.filter((b) => b.room_type_id === rt.id);
    const rtNights = rtBookings.reduce((s, b) => s + (b.nights ?? 0), 0);
    const rtDailyOcc = days.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const occ = rtBookings.filter((b) => b.check_in <= dateStr && b.check_out > dateStr).length;
      return rtRooms > 0 ? (occ / rtRooms) * 100 : 0;
    });
    const rtAvgOcc =
      rtDailyOcc.length > 0
        ? Math.round(rtDailyOcc.reduce((s, v) => s + v, 0) / rtDailyOcc.length)
        : 0;
    return { name: rt.name, nights: rtNights, avgOccupancy: rtAvgOcc, totalRooms: rtRooms };
  });

  return { dailyOccupancy, avgOccupancy, totalNightsSold, byRoomType };
}

// ── Revenue ──────────────────────────────────────────────────────

export async function getRevenueReport(
  startDate: string,
  endDate: string
): Promise<RevenueReportData> {
  const { hotelId, supabase } = await getHotelId();

  const [bookingsResult, outstandingResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("check_in, total_amount, amount_paid, nights, source")
      .eq("hotel_id", hotelId)
      .in("status", ACTIVE)
      .gte("check_in", startDate)
      .lte("check_in", endDate),
    supabase
      .from("bookings")
      .select("outstanding_balance")
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .neq("payment_status", "paid"),
  ]);

  const bookings = bookingsResult.data ?? [];

  // Group by week
  const weekMap = new Map<string, number>();
  for (const b of bookings) {
    const weekStart = format(
      startOfWeek(parseISO(b.check_in), { weekStartsOn: 1 }),
      "MMM d"
    );
    weekMap.set(weekStart, (weekMap.get(weekStart) ?? 0) + Number(b.total_amount));
  }
  const weeklyRevenue = Array.from(weekMap.entries()).map(([week, revenue]) => ({
    week,
    revenue: Math.round(revenue * 100) / 100,
  }));

  const totalRevenue = bookings.reduce((s, b) => s + Number(b.total_amount), 0);
  const totalNights = bookings.reduce((s, b) => s + (b.nights ?? 0), 0);
  const avgNightlyRate = totalNights > 0 ? totalRevenue / totalNights : 0;

  const outstandingBalance = (outstandingResult.data ?? []).reduce(
    (s, b) => s + Number(b.outstanding_balance ?? 0),
    0
  );

  const sourceMap = new Map<string, { revenue: number; count: number }>();
  for (const b of bookings) {
    const src = b.source ?? "direct";
    const cur = sourceMap.get(src) ?? { revenue: 0, count: 0 };
    sourceMap.set(src, { revenue: cur.revenue + Number(b.total_amount), count: cur.count + 1 });
  }
  const bySource = Array.from(sourceMap.entries()).map(([source, v]) => ({
    source,
    revenue: Math.round(v.revenue * 100) / 100,
    count: v.count,
  }));

  return {
    weeklyRevenue,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    avgNightlyRate: Math.round(avgNightlyRate * 100) / 100,
    outstandingBalance: Math.round(outstandingBalance * 100) / 100,
    bySource,
  };
}

// ── Booking Sources ──────────────────────────────────────────────

export async function getSourcesReport(
  startDate: string,
  endDate: string
): Promise<SourcesReportData> {
  const { hotelId, supabase } = await getHotelId();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("source, total_amount")
    .eq("hotel_id", hotelId)
    .in("status", ACTIVE)
    .gte("check_in", startDate)
    .lte("check_in", endDate);

  const rows = bookings ?? [];
  const total = rows.length;

  const sourceMap = new Map<string, { count: number; revenue: number }>();
  for (const b of rows) {
    const src = b.source ?? "direct";
    const cur = sourceMap.get(src) ?? { count: 0, revenue: 0 };
    sourceMap.set(src, { count: cur.count + 1, revenue: cur.revenue + Number(b.total_amount) });
  }

  const bySource = Array.from(sourceMap.entries())
    .map(([source, v]) => ({
      source,
      count: v.count,
      revenue: Math.round(v.revenue * 100) / 100,
      pct: total > 0 ? Math.round((v.count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalBookings: total, bySource };
}
