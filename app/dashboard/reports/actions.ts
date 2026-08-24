"use server";

import { getHotelScope } from "@/lib/auth";
import { resolveRange, addDaysSafe } from "@/lib/reports/resolve-range";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";

// ── Types ────────────────────────────────────────────────────────

export interface OccupancyReportData {
  dailyOccupancy: { date: string; occupancy: number; occupied: number; total: number }[];
  avgOccupancy: number;
  totalNightsSold: number;
  byRoomType: { name: string; nights: number; avgOccupancy: number; totalRooms: number }[];
}

export interface RevenueReportData {
  trend: { key: string; label: string; revenue: number }[];
  granularity: "day" | "week";
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
  const { hotelId, supabase } = await getHotelScope();
  const { start, end } = resolveRange(startDate, endDate);
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

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
      .lt("check_in", endStr)
      .gt("check_out", startStr),
    supabase
      .from("room_types")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .eq("is_active", true),
  ]);

  const totalRooms = roomsResult.data?.length ?? 0;
  const bookings = bookingsResult.data ?? [];
  const roomTypes = roomTypesResult.data ?? [];

  const days = eachDayOfInterval({ start, end });

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

  const byRoomType = roomTypes
    .map((rt) => {
      const rtRooms = roomsByType.get(rt.id) ?? 0;
      const rtBookings = bookings.filter((b) => b.room_type_id === rt.id);
      const rtNights = rtBookings.reduce((s, b) => s + (b.nights ?? 0), 0);
      const rtDailyOcc = days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const occ = rtBookings.filter(
          (b) => b.check_in <= dateStr && b.check_out > dateStr
        ).length;
        return rtRooms > 0 ? (occ / rtRooms) * 100 : 0;
      });
      const rtAvgOcc =
        rtDailyOcc.length > 0
          ? Math.round(rtDailyOcc.reduce((s, v) => s + v, 0) / rtDailyOcc.length)
          : 0;
      return { name: rt.name, nights: rtNights, avgOccupancy: rtAvgOcc, totalRooms: rtRooms };
    })
    .sort((a, b) => b.nights - a.nights);

  return { dailyOccupancy, avgOccupancy, totalNightsSold, byRoomType };
}

// ── Revenue ──────────────────────────────────────────────────────

export async function getRevenueReport(
  startDate: string,
  endDate: string
): Promise<RevenueReportData> {
  const { hotelId, supabase } = await getHotelScope();
  const { start, end } = resolveRange(startDate, endDate);
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  const [bookingsResult, outstandingResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("check_in, total_amount, amount_paid, nights, source")
      .eq("hotel_id", hotelId)
      .in("status", ACTIVE)
      .gte("check_in", startStr)
      .lte("check_in", endStr),
    supabase
      .from("bookings")
      .select("outstanding_balance")
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .neq("payment_status", "paid"),
  ]);

  const bookings = bookingsResult.data ?? [];
  const spanDays = differenceInCalendarDays(end, start) + 1;
  const granularity: "day" | "week" = spanDays <= 14 ? "day" : "week";

  // Short ranges bucket per day so charts never collapse to a single bar
  const trendMap = new Map<string, number>();
  for (const b of bookings) {
    const d = parseISO(b.check_in);
    const key =
      granularity === "day"
        ? format(d, "yyyy-MM-dd")
        : format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    trendMap.set(key, (trendMap.get(key) ?? 0) + Number(b.total_amount));
  }

  // Fill empty buckets so the chart shows continuous timeline
  const trend: RevenueReportData["trend"] = [];
  if (granularity === "day") {
    for (const day of eachDayOfInterval({ start, end })) {
      const key = format(day, "yyyy-MM-dd");
      trend.push({
        key,
        label: format(day, "MMM d"),
        revenue: Math.round((trendMap.get(key) ?? 0) * 100) / 100,
      });
    }
  } else {
    for (let cursor = startOfWeek(start, { weekStartsOn: 1 }); cursor <= end; ) {
      const key = format(cursor, "yyyy-MM-dd");
      trend.push({
        key,
        label: format(cursor, "MMM d"),
        revenue: Math.round((trendMap.get(key) ?? 0) * 100) / 100,
      });
      cursor = addDaysSafe(cursor, 7);
    }
  }

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
    sourceMap.set(src, {
      revenue: cur.revenue + Number(b.total_amount),
      count: cur.count + 1,
    });
  }
  const bySource = Array.from(sourceMap.entries())
    .map(([source, v]) => ({
      source,
      revenue: Math.round(v.revenue * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    trend,
    granularity,
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
  const { hotelId, supabase } = await getHotelScope();
  const { start, end } = resolveRange(startDate, endDate);

  const { data: bookings } = await supabase
    .from("bookings")
    .select("source, total_amount")
    .eq("hotel_id", hotelId)
    .in("status", ACTIVE)
    .gte("check_in", format(start, "yyyy-MM-dd"))
    .lte("check_in", format(end, "yyyy-MM-dd"));

  const rows = bookings ?? [];
  const total = rows.length;

  const sourceMap = new Map<string, { count: number; revenue: number }>();
  for (const b of rows) {
    const src = b.source ?? "direct";
    const cur = sourceMap.get(src) ?? { count: 0, revenue: 0 };
    sourceMap.set(src, {
      count: cur.count + 1,
      revenue: cur.revenue + Number(b.total_amount),
    });
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
