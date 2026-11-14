import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { businessDayBounds, businessToday } from "@/lib/business-date";
import {
  buildHistoricalRoomsSold,
  buildRoomsSoldMetric,
  unavailableRoomsSold,
  type OccupancyContext,
} from "@/lib/metrics/dashboard-occupancy";

/** PostgREST / Postgres codes for a table that does not exist (yet). */
const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

const PAGE_SIZE = 500;

/** Fail closed on truncated or changing reads rather than chart partial totals. */
async function readInventoryRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null;
  count: number | null;
  error: unknown;
}>): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  do {
    const page = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (page.error) throw page.error;
    if (!page.data || page.count === null || !Number.isSafeInteger(page.count) || page.count < 0) {
      throw new Error("Inventory response is incomplete. Refresh the dashboard.");
    }
    if (total !== null && total !== page.count) throw new Error("Inventory changed while loading. Refresh the dashboard.");
    total = page.count;
    rows.push(...page.data);
    if (rows.length > total || (page.data.length === 0 && rows.length < total)) {
      throw new Error("Inventory response is truncated. Refresh the dashboard.");
    }
  } while (rows.length < total);
  return rows;
}

export async function fetchDashboardOccupancy(
  supabase: SupabaseClient<Database>, hotelId: string, date: string, timeZone: string,
) {
  const now = new Date();
  const context = { date, businessToday: businessToday(timeZone, now), asOf: now.toISOString() };
  // Current room status and the forward availability RPC are not historical
  // evidence. An earlier business day reads recorded history instead.
  if (date < context.businessToday) {
    return fetchHistoricalOccupancy(supabase, hotelId, date, timeZone, context);
  }
  const [rooms, reservations, blocks] = await Promise.all([
    readInventoryRows((from, to) => supabase.from("rooms")
      .select("id, status, room_type_id", { count: "exact" })
      .eq("hotel_id", hotelId).eq("is_active", true).order("id").range(from, to)),
    readInventoryRows((from, to) => supabase.from("bookings")
      .select("id, room_id, room_type_id, rooms_count, status, payment_status, payment_preference, source, created_at", { count: "exact" })
      .eq("hotel_id", hotelId).in("status", ["pending", "confirmed", "checked_in"])
      .lte("check_in", date).gt("check_out", date).order("id").range(from, to)),
    readInventoryRows((from, to) => supabase.from("availability_blocks")
      .select("id, room_id", { count: "exact" }).eq("hotel_id", hotelId)
      .lte("start_date", date).gt("end_date", date).order("id").range(from, to)),
  ]);
  const roomTypeIds = [...new Set([
    ...rooms.map((room) => room.room_type_id),
    ...reservations.flatMap((booking) => booking.room_type_id ? [booking.room_type_id] : []),
  ])];
  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  // Use the existing authenticated batch RPC, not the service-role-only
  // primitive. Its values are reconciled per type so surplus in one type
  // cannot conceal overselling another.
  const availability = roomTypeIds.length ? await supabase.rpc("room_type_available_counts", {
    p_room_type_ids: roomTypeIds, p_from: date, p_to: nextDate.toISOString().slice(0, 10),
  }) : { data: [], error: null };
  if (availability.error) throw availability.error;
  if (!availability.data) throw new Error("Availability response is missing. Refresh the dashboard.");
  return buildRoomsSoldMetric({
    context, rooms, reservations, blockedRoomIds: blocks.map((block) => block.room_id), availability: availability.data,
  });
}

/**
 * A past night, from recorded history. The state is read at the end of that
 * business day (property-local midnight), the moment Night Audit closes it:
 * a room counts as out of service or blocked if it was at that instant.
 */
async function fetchHistoricalOccupancy(
  supabase: SupabaseClient<Database>,
  hotelId: string,
  date: string,
  timeZone: string,
  context: OccupancyContext,
) {
  const dayEnd = businessDayBounds(date, timeZone).endISO;
  // A period [valid_from, valid_to) covers the instant just before dayEnd.
  const coversDayEnd = `valid_to.is.null,valid_to.gte."${dayEnd}"`;
  try {
    const [inventory, outOfService, blocks, stays] = await Promise.all([
      supabase.from("reports_inventory_history")
        .select("effective_date, capacity_by_type, time_zone")
        .eq("hotel_id", hotelId).lte("effective_date", date)
        .order("effective_date", { ascending: false }).limit(1)
        .then((res) => {
          if (res.error) throw res.error;
          return res.data?.[0] ?? null;
        }),
      readInventoryRows((from, to) => supabase.from("room_status_history")
        .select("id, room_id", { count: "exact" })
        .eq("hotel_id", hotelId).in("status", ["maintenance", "out_of_service"])
        .lt("valid_from", dayEnd).or(coversDayEnd).order("id").range(from, to)),
      readInventoryRows((from, to) => supabase.from("availability_block_history")
        .select("id, room_id", { count: "exact" })
        .eq("hotel_id", hotelId).lte("start_date", date).gt("end_date", date)
        .lt("valid_from", dayEnd).or(coversDayEnd).order("id").range(from, to)),
      readInventoryRows((from, to) => supabase.from("bookings")
        .select("id, rooms_count, room_id, status, check_out_at", { count: "exact" })
        .eq("hotel_id", hotelId).in("status", ["checked_in", "checked_out"])
        .lte("check_in", date).gt("check_out", date).order("id").range(from, to)),
    ]);
    return buildHistoricalRoomsSold({
      context,
      timeZone,
      inventory,
      outOfServiceRoomIds: outOfService.map((row) => row.room_id),
      blockedRoomIds: blocks.map((row) => row.room_id),
      stays,
    });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    // Before the history migration is applied, say so instead of failing the page.
    if (code && MISSING_TABLE.has(code)) {
      return unavailableRoomsSold(context, "Occupancy history isn't set up for this property yet.");
    }
    throw error;
  }
}
