/**
 * lib/bookings/expand-cart-lines.ts
 *
 * One booking row per physical room.
 *
 * A reservation line carrying `rooms_count: N` fans out into N lines of
 * `rooms_count: 1`, so every room owns its own lifecycle — check-in, check-out,
 * room assignment, folio line. That is the model the industry leaders use: in
 * Mews a reservation carries a single assigned space and its own state
 * (`Processed` = checked out), linked to siblings through a reservation group;
 * Cloudbeds exposes a per-room check-out (`postRoomCheckOut` /
 * `subReservationID`) and only flips the reservation to "Checked Out" once
 * every room has left.
 *
 * A single row holding N units can only be checked in or out as one block and
 * renders as one strip on the rack — the shape this module exists to prevent.
 */

/** Ceiling mirroring `create_booking_group_atomic`'s own line cap. */
export const RESERVATION_ROOM_CAP = 10;

export interface CartLineWithCount {
  rooms_count: number;
}

/** N lines of one room, one per physical unit. Input untouched. */
export function expandCartLines<T extends CartLineWithCount>(lines: readonly T[]): T[] {
  return lines.flatMap((line) =>
    Array.from({ length: Math.max(1, line.rooms_count) }, () => ({ ...line, rooms_count: 1 }))
  );
}

/**
 * Units a cart holds, before or after expansion. Named apart from the cart's own
 * `countCartRooms` (which counts `CartRoom[]` entries) so the two shapes cannot
 * be mixed up at a call site.
 */
export function countCartUnits(lines: readonly CartLineWithCount[]): number {
  return lines.reduce((sum, line) => sum + Math.max(1, line.rooms_count), 0);
}
