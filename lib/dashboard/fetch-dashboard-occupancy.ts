import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { businessToday } from "@/lib/business-date";
import { buildRoomsSoldMetric, unavailableRoomsSold } from "@/lib/metrics/dashboard-occupancy";

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
  // evidence. Do not even query them for an earlier business day.
  if (date < context.businessToday) return unavailableRoomsSold(context);
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
