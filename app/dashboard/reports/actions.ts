"use server";

import { differenceInCalendarDays, eachDayOfInterval, format, parseISO, startOfWeek, subDays } from "date-fns";
import { fromMinor, sumMinor } from "@/lib/money";
import { adr, allocateNightlyRevenue, assertCurrency, moneyMinor, occupancy, pctDelta, revpag, revpar, type NightFact, type NightRow } from "@/lib/reports/bi-math";
import { historicalCapacity, type CapacityDay, type InventorySnapshot } from "@/lib/reports/inventory";
import { BALANCE_BASIS, INVENTORY_BASIS, ROOM_BASIS, STAYED, loadInventory, loadNights, loadOutstanding, loadStays, reportContext, withWarnings, type ReportContext, type ReportMeta, type ReportScope, type ReportStay } from "@/lib/reports/data";
import { readAllPages, reportReadError } from "@/lib/reports/pagination";
import { classifyArrivingGuests } from "@/lib/reports/guests";

export type { ReportMeta, ReportScope } from "@/lib/reports/data";
export interface KpiDelta { revenue: number | null; revpar: number | null; adr: number | null; occupancy: number | null; roomNights: number | null }
export interface OverviewSeriesPoint { date: string; label: string; revenue: number; occupancy: number | null; roomNights: number; adr: number; revpar: number | null }
export interface SourceSlice { source: string; count: number; revenue: number; pct: number; roomNights: number }
export interface OverviewData { currency: string; revenue: number; revpar: number | null; adr: number; occupancy: number | null; roomNights: number; revpag: number; deltas: KpiDelta; series: OverviewSeriesPoint[]; sources: SourceSlice[]; meta: ReportMeta }
export interface RevenueTrendPoint { key: string; label: string; revenue: number }
export interface RevenueData { currency: string; totalRevenue: number; adr: number; revpar: number | null; outstanding: number; granularity: "day" | "week"; deltas: { revenue: number | null; adr: number | null; revpar: number | null }; trend: RevenueTrendPoint[]; bySource: SourceSlice[]; meta: ReportMeta }
export interface RoomTypeOcc { name: string; booked: number; capacity: number | null; occupancy: number | null }
export interface OccupancyData { currency: string; occupancy: number | null; roomNights: number; availableRoomNights: number | null; avgLengthOfStay: number; newBookings: number; deltas: { occupancy: number | null; roomNights: number | null }; daily: { date: string; label: string; occupancy: number | null }[]; byRoomType: RoomTypeOcc[]; meta: ReportMeta }
export interface MethodSlice { method: string; count: number; amount: number }
export interface OriginSlice { nationality: string; count: number }
export interface GuestsData { currency: string; totalCollected: number; outstanding: number; newGuests: number; repeatGuests: number; totalGuests: number; byMethod: MethodSlice[]; origins: OriginSlice[]; meta: ReportMeta }

const ymd = (date: Date) => format(date, "yyyy-MM-dd");
function foldRange(ctx: ReportContext, stays: ReportStay[], nights: NightRow[], inventory: InventorySnapshot[], start: Date, end: Date) {
  // Current calendar night has not finished. Never label on-the-books nights as earned.
  const earnedEnd = end < parseISO(ctx.today) ? end : subDays(parseISO(ctx.today), 1);
  const allocation = earnedEnd < start
    ? { revenue: 0, revenueMinor: 0, roomNights: 0, guests: 0, facts: [] as NightFact[], warnings: [] as string[] }
    : allocateNightlyRevenue(stays, start, earnedEnd, ctx.currency, nights);
  const capacity = historicalCapacity(inventory, start, end, ctx.today, ctx.timeZone);
  const completed = capacity.filter(day => day.date < ctx.today);
  const availableRoomNights = !completed.length || completed.some(day => day.capacity == null) ? null : completed.reduce((sum, day) => sum + day.capacity!, 0);
  const warnings = [...allocation.warnings];
  if (completed.some(day => day.capacity == null)) warnings.push(`Historical capacity is unavailable for part or all of ${ymd(start)}–${ymd(end)}: no matching dated inventory baseline exists. Occupancy and RevPAR are unavailable; current rooms are never used to invent past capacity.`);
  if (capacity.some(day => day.date >= ctx.today)) warnings.push("Today's room night is incomplete and excluded from revenue, room-nights and capacity; today's occupancy and RevPAR are unavailable.");
  if (availableRoomNights === 0) warnings.push("Recorded capacity is zero; occupancy and RevPAR have no valid denominator.");
  const participating = new Set(allocation.facts.map(n => n.bookingId));
  return { ...allocation, warnings, availableRoomNights, capacity,
    occupancy: occupancy(allocation.roomNights, availableRoomNights), adr: adr(allocation.revenue, allocation.roomNights), revpar: revpar(allocation.revenue, availableRoomNights),
    stays: stays.filter(stay => participating.has(stay.id)) };
}
type RangeCore = ReturnType<typeof foldRange>;
async function comparison(ctx: ReportContext) {
  const [stays, inventory] = await Promise.all([loadStays(ctx), loadInventory(ctx)]);
  const nights = await loadNights(ctx, stays);
  return { cur: foldRange(ctx, stays, nights, inventory, ctx.start, ctx.end), prev: foldRange(ctx, stays, nights, inventory, ctx.prior.start, ctx.prior.end) };
}
function roomDelta(ctx: ReportContext, current: number | null, previous: number | null): number | null {
  // Today's incomplete night shortens only the current earned range, not its prior span.
  return ctx.meta.endDate < ctx.today ? pctDelta(current, previous) : null;
}
function roomMeta(ctx: ReportContext, cur: RangeCore, prev: RangeCore, extra: string[] = []) {
  return withWarnings(ctx, ROOM_BASIS, INVENTORY_BASIS,
    "Net-zero room subtotals remain occupied room-nights with zero revenue. No separate complimentary/house-use classification is stored, so those stays cannot be separately excluded.",
    "Historical reports reflect current booking corrections and statuses; they are not immutable accounting-close snapshots.",
    ctx.meta.endDate >= ctx.today ? ["Room KPI comparisons require a completed date range. Choose an end date before today in the property's timezone."] : [],
    cur.warnings, prev.warnings, extra);
}
function buildSeries(cur: RangeCore, currency: string): OverviewSeriesPoint[] {
  const days = new Map<string, { minor: number[]; rooms: number }>();
  for (const fact of cur.facts) {
    const value = days.get(fact.date) ?? { minor: [], rooms: 0 };
    value.minor.push(fact.revenueMinor); value.rooms += fact.roomNights; days.set(fact.date, value);
  }
  return cur.capacity.map(day => {
    const fact = days.get(day.date);
    const revenue = fromMinor(sumMinor(fact?.minor ?? []), currency), roomNights = fact?.rooms ?? 0;
    return { date: day.date, label: format(parseISO(day.date), "MMM d"), revenue, roomNights,
      occupancy: occupancy(roomNights, day.capacity), adr: adr(revenue, roomNights), revpar: revpar(revenue, day.capacity) };
  });
}
function buildSources(cur: RangeCore, currency: string): SourceSlice[] {
  const stays = new Map(cur.stays.map(stay => [stay.id, stay]));
  const sources = new Map<string, { bookings: Set<string>; minor: number[]; nights: number }>();
  for (const fact of cur.facts) {
    const key = stays.get(fact.bookingId)?.source || "direct";
    const value = sources.get(key) ?? { bookings: new Set<string>(), minor: [], nights: 0 };
    value.bookings.add(fact.bookingId); value.minor.push(fact.revenueMinor); value.nights += fact.roomNights; sources.set(key, value);
  }
  const total = [...sources.values()].reduce((sum, value) => sum + value.bookings.size, 0);
  return [...sources].map(([source, value]) => ({ source, count: value.bookings.size, revenue: fromMinor(sumMinor(value.minor), currency),
    pct: total ? Math.round(value.bookings.size / total * 100) : 0, roomNights: value.nights }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
export async function getReportsOverview(startDate: string, endDate: string, expectedScope: ReportScope): Promise<OverviewData> {
  const ctx = await reportContext(startDate, endDate, expectedScope);
  const { cur, prev } = await comparison(ctx);
  return { currency: ctx.currency, revenue: cur.revenue, revpar: cur.revpar, adr: cur.adr, occupancy: cur.occupancy,
    roomNights: cur.roomNights, revpag: revpag(cur.revenue, cur.guests),
    deltas: { revenue: roomDelta(ctx, cur.revenue, prev.revenue), revpar: roomDelta(ctx, cur.revpar, prev.revpar), adr: roomDelta(ctx, cur.adr, prev.adr), occupancy: roomDelta(ctx, cur.occupancy, prev.occupancy), roomNights: roomDelta(ctx, cur.roomNights, prev.roomNights) },
    series: buildSeries(cur, ctx.currency), sources: buildSources(cur, ctx.currency), meta: roomMeta(ctx, cur, prev) };
}
export async function getRevenueReport(startDate: string, endDate: string, expectedScope: ReportScope): Promise<RevenueData> {
  const ctx = await reportContext(startDate, endDate, expectedScope);
  const [{ cur, prev }, outstanding] = await Promise.all([comparison(ctx), loadOutstanding(ctx)]);
  const granularity = differenceInCalendarDays(ctx.end, ctx.start) < 14 ? "day" : "week";
  const buckets = new Map<string, number[]>();
  for (const day of eachDayOfInterval({ start: ctx.start, end: ctx.end })) buckets.set(ymd(granularity === "day" ? day : startOfWeek(day, { weekStartsOn: 1 })), []);
  for (const fact of cur.facts) {
    const key = granularity === "day" ? fact.date : ymd(startOfWeek(parseISO(fact.date), { weekStartsOn: 1 }));
    buckets.get(key)!.push(fact.revenueMinor);
  }
  return { currency: ctx.currency, totalRevenue: cur.revenue, adr: cur.adr, revpar: cur.revpar, outstanding, granularity,
    deltas: { revenue: roomDelta(ctx, cur.revenue, prev.revenue), adr: roomDelta(ctx, cur.adr, prev.adr), revpar: roomDelta(ctx, cur.revpar, prev.revpar) },
    trend: [...buckets].map(([key, values]) => ({ key, label: format(parseISO(key), "MMM d"), revenue: fromMinor(sumMinor(values), ctx.currency) })),
    bySource: buildSources(cur, ctx.currency), meta: roomMeta(ctx, cur, prev, [BALANCE_BASIS]) };
}
function typeCapacity(days: CapacityDay[], type: string): number | null {
  return !days.length || days.some(day => day.byType == null) ? null : days.reduce((sum, day) => sum + (day.byType!.get(type) ?? 0), 0);
}
export async function getOccupancyReport(startDate: string, endDate: string, expectedScope: ReportScope): Promise<OccupancyData> {
  const ctx = await reportContext(startDate, endDate, expectedScope);
  const [{ cur, prev }, types, created] = await Promise.all([
    comparison(ctx),
    readAllPages("room types", (after, size) => {
      let q = ctx.supabase.from("room_types").select("id, name", { count: "exact" }).eq("hotel_id", ctx.hotelId).order("id").limit(size);
      if (after) q = q.gt("id", after);
      return q;
    }),
    ctx.supabase.from("bookings").select("id", { count: "exact", head: true }).eq("hotel_id", ctx.hotelId).gte("created_at", ctx.startISO).lt("created_at", ctx.endISO),
  ]);
  if (created.error || !Number.isSafeInteger(created.count)) reportReadError("new booking count", created.error);
  const names = new Map(types.map(t => [t.id, t.name]));
  const stays = new Map(cur.stays.map(s => [s.id, s]));
  const byType = new Map<string, number>();
  for (const fact of cur.facts) {
    const type = stays.get(fact.bookingId)?.room_type_id ?? "unknown";
    byType.set(type, (byType.get(type) ?? 0) + fact.roomNights);
  }
  const completed = cur.capacity.filter(day => day.date < ctx.today);
  const typeIds = new Set([...names.keys(), ...byType.keys(), ...completed.flatMap(day => [...(day.byType?.keys() ?? [])])]);
  const byRoomType = [...typeIds].map(id => {
    const booked = byType.get(id) ?? 0, capacity = id === "unknown" ? null : typeCapacity(completed, id);
    return { name: names.get(id) ?? "Unknown / retired room type", booked, capacity, occupancy: occupancy(booked, capacity) };
  }).sort((a, b) => b.booked - a.booked || a.name.localeCompare(b.name));
  const length = cur.stays.reduce((sum, stay) => sum + differenceInCalendarDays(parseISO(stay.check_out), parseISO(stay.check_in)), 0);
  return { currency: ctx.currency, occupancy: cur.occupancy, roomNights: cur.roomNights, availableRoomNights: cur.availableRoomNights,
    avgLengthOfStay: cur.stays.length ? Math.round(length / cur.stays.length * 10) / 10 : 0, newBookings: created.count!,
    deltas: { occupancy: roomDelta(ctx, cur.occupancy, prev.occupancy), roomNights: roomDelta(ctx, cur.roomNights, prev.roomNights) },
    daily: buildSeries(cur, ctx.currency).map(({ date, label, occupancy }) => ({ date, label, occupancy })), byRoomType,
    meta: roomMeta(ctx, cur, prev, ["New bookings counts all reservations created in the property's local date window, including subsequently cancelled bookings. Average stay length is the full booked span of participating stays, not just nights in this window."]) };
}
export async function getGuestsReport(startDate: string, endDate: string, expectedScope: ReportScope): Promise<GuestsData> {
  const ctx = await reportContext(startDate, endDate, expectedScope);
  const [payments, arrivals, outstanding] = await Promise.all([
    readAllPages("payments", (after, size) => {
      let q = ctx.supabase.from("payments").select("id, amount, method, currency", { count: "exact" }).eq("hotel_id", ctx.hotelId).eq("status", "success")
        .gte("paid_at", ctx.startISO).lt("paid_at", ctx.endISO).order("id").limit(size);
      if (after) q = q.gt("id", after);
      return q;
    }),
    readAllPages("guest arrivals", (after, size) => {
      let q = ctx.supabase.from("bookings").select("id, guest_id, check_in, check_out", { count: "exact" }).eq("hotel_id", ctx.hotelId).in("status", STAYED)
        .gte("check_in", startDate).lte("check_in", endDate).order("id").limit(size);
      if (after) q = q.gt("id", after);
      return q;
    }), loadOutstanding(ctx),
  ]);
  const guestIds = [...new Set(arrivals.map(b => b.guest_id).filter((id): id is string => id !== null))];
  const history: typeof arrivals = [];
  const guests: { id: string; nationality: string | null }[] = [];
  for (let offset = 0; offset < guestIds.length; offset += 100) {
    const ids = guestIds.slice(offset, offset + 100);
    const [past, profiles] = await Promise.all([
      readAllPages("guest stay history", (after, size) => {
        let q = ctx.supabase.from("bookings").select("id, guest_id, check_in, check_out", { count: "exact" }).eq("hotel_id", ctx.hotelId).in("status", STAYED)
          .in("guest_id", ids).lte("check_in", endDate).order("id").limit(size);
        if (after) q = q.gt("id", after);
        return q;
      }, 100_000 - history.length),
      readAllPages("guest profiles", (after, size) => {
        let q = ctx.supabase.from("guests").select("id, nationality", { count: "exact" }).eq("hotel_id", ctx.hotelId).in("id", ids).order("id").limit(size);
        if (after) q = q.gt("id", after);
        return q;
      }),
    ]);
    history.push(...past); guests.push(...profiles);
  }
  if (guests.length !== guestIds.length) reportReadError("complete guest profiles", null);
  const classification = classifyArrivingGuests(arrivals, history);
  const methodMap = new Map<string, { count: number; minor: number[] }>();
  for (const payment of payments) {
    assertCurrency(payment.currency, ctx.currency);
    const key = payment.method || "other", value = methodMap.get(key) ?? { count: 0, minor: [] };
    value.count++; value.minor.push(moneyMinor(payment.amount, ctx.currency)); methodMap.set(key, value);
  }
  const byMethod = [...methodMap].map(([method, value]) => ({ method, count: value.count, amount: fromMinor(sumMinor(value.minor), ctx.currency) }))
    .sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));
  const originMap = new Map<string, number>();
  for (const guest of guests) { const name = guest.nationality?.trim(); if (name) originMap.set(name, (originMap.get(name) ?? 0) + 1); }
  return { currency: ctx.currency, totalCollected: fromMinor(sumMinor([...methodMap.values()].flatMap(v => v.minor)), ctx.currency), outstanding,
    ...classification, totalGuests: guestIds.length, byMethod,
    origins: [...originMap].map(([nationality, count]) => ({ nationality, count })).sort((a, b) => b.count - a.count || a.nationality.localeCompare(b.nationality)),
    meta: withWarnings(ctx, BALANCE_BASIS,
      "Collections are successful cash receipts by paid_at in the hotel's local date window, including tax and deposits; they are not room revenue or net-of-refund cash flow.",
      "Guests are unique identified checked-in/checked-out arrivals in the period. New/repeat is determined at each guest's first arrival in the window: repeat requires an earlier qualifying stay completed by that arrival. Concurrent/multi-room stays count once; later returns do not rewrite earlier periods.",
      "Guest classification uses recorded arrival/departure dates and current stay statuses, not lifetime counters. Nationality uses the current guest profile; anonymous/deleted guest links are excluded.") };
}
