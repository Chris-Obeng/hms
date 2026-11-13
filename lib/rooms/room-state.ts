/**
 * A room's state on the Rooms board, worked out from data instead of a
 * hand-set status:
 *
 * - inactive: the room is switched off (`rooms.is_active = false`).
 * - occupied: a guest is checked in to it.
 * - blocked: an availability block covers today.
 * - out_of_service / maintenance: legacy `rooms.status` values. Nothing in the
 *   app sets them any more, but booking SQL still treats them as unsellable, so
 *   the board keeps showing them.
 * - available: none of the above.
 *
 * An in-house guest outranks a block so the front desk never loses sight of
 * who is in a room.
 */
export type RoomState =
  | "inactive"
  | "occupied"
  | "blocked"
  | "out_of_service"
  | "maintenance"
  | "available";

export interface RoomStateInput {
  status: string | null;
  isActive: boolean | null;
  stay: unknown | null;
  block: unknown | null;
}

export function roomState(room: RoomStateInput): RoomState {
  if (room.isActive === false) return "inactive";
  if (room.stay) return "occupied";
  if (room.block) return "blocked";
  if (room.status === "out_of_service") return "out_of_service";
  if (room.status === "maintenance") return "maintenance";
  return "available";
}

export function countAvailableRooms(rooms: RoomStateInput[]): number {
  return rooms.filter((room) => roomState(room) === "available").length;
}
