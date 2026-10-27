/** `status` is nullable on legacy rows; such a row belongs to no bucket. */
export interface ArrivalRow { id: string; status: string | null; check_in: string }
export interface StayMix { stayed: number; inHouse: number; arriving: number; cancelled: number; noShow: number }

/**
 * One bucket per booking whose check-in falls in the window.
 *
 * `stayedIds` is the set of bookings a room was actually occupied for, so a
 * booking that has since been cancelled is not counted as a stay. `arriving`
 * is the bookings still expected: nothing for them has started yet. A booking
 * that already checked in is in house. `stayed` counts the whole set, not just
 * the window's arrivals — a stay that began earlier and is still here counts.
 */
export function classifyArrivals(arrivalRows: ArrivalRow[], stayedIds: Iterable<string>): StayMix {
  const occupied = new Set(stayedIds);
  return {
    stayed: occupied.size,
    inHouse: arrivalRows.filter((row) => row.status === "checked_in").length,
    arriving: arrivalRows.filter((row) => row.status === "confirmed" && !occupied.has(row.id)).length,
    cancelled: arrivalRows.filter((row) => row.status === "cancelled").length,
    noShow: arrivalRows.filter((row) => row.status === "no_show").length,
  };
}
