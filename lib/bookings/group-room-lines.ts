/**
 * lib/bookings/group-room-lines.ts
 *
 * The room lines a grouped reservation shows to the guest: one entry per room,
 * each with its own occupancy.
 *
 * A multi-room reservation is one bookings row per room, sharing a group_id, so
 * the guest-facing summary must enumerate them. That is the shape the industry
 * leaders use: Mews' Booking Engine creates one reservation group whose
 * `Reservations[]` each carry their own AdultCount/ChildCount, and Cloudbeds
 * exposes each room as its own sub-reservation.
 */

import { occupancyText } from "@/lib/bookings/cart";

/** One room line as the guest email presents it. */
export interface RoomLine {
  /** Room type name ("Deluxe Room"). */
  name: string;
  /** Occupancy label ("2 adults, 1 child"). */
  occupancy: string;
}

/** Pure mapping from stored group rows to the email's room lines. */
export function formatRoomLines(
  rows: { adults: number | null; children: number | null; room_types: { name?: string | null } | null }[]
): RoomLine[] {
  return rows.map((row) => ({
    name: row.room_types?.name ?? "Room",
    occupancy: occupancyText(row.adults ?? 1, row.children ?? 0),
  }));
}

/**
 * The rooms of a grouped reservation, in booking order (anchor first), for the
 * guest's confirmation email. A multi-room reservation is one row per room, so
 * every room is named with its own occupancy — the shape OTA emails use, and
 * what Mews' booking engine returns as `Reservations[]` inside one group.
 */
export async function fetchGroupRoomLines(groupId: string): Promise<RoomLine[]> {
  // Imported lazily: the service-role client needs server env at module scope,
  // and the pure helpers above must stay importable from tests.
  const { supabaseAdmin } = await import("@/lib/supabase/admin");

  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id, adults, children, room_types(name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data) {
    console.error("[group-room-lines] rooms lookup failed", error?.message);
    return [];
  }

  return formatRoomLines(
    data as { adults: number | null; children: number | null; room_types: { name?: string | null } | null }[]
  );
}
