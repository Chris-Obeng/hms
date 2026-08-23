import type { CalendarBooking, CalendarRoom } from "../../actions";
import { rangeOverlaps } from "./timeline-geometry";

const EXCLUDED_STATUSES = new Set(["cancelled", "checked_out", "no_show"]);
const OUT_OF_SERVICE = new Set(["maintenance", "out_of_service"]);

export interface AutoAssignContext {
  rooms: CalendarRoom[];
  bookings: CalendarBooking[];
}

export interface RoomCandidate {
  room: CalendarRoom;
  /** Lower is better. Encodes housekeeping readiness + occupancy pressure. */
  score: number;
}

/**
 * Industry-standard auto room assignment (Opera/Cloudbeds style):
 *   1. Same room type as the booking.
 *   2. Room in service (never maintenance / out of service).
 *   3. No overlap with an active booking for the stay window (DB also enforces).
 *   4. Prefer vacant + available ("clean") rooms over rooms still occupied
 *      tonight — front desk should not promise a room that must be turned over.
 *   5. Deterministic tiebreak: floor, then room number (numeric aware).
 */
export function pickBestRoom(booking: CalendarBooking, context: AutoAssignContext): CalendarRoom | null {
  if (!booking.roomTypeId) return null;

  const activeByRoom = new Map<string, number>();
  for (const other of context.bookings) {
    if (other.id === booking.id || !other.roomId || EXCLUDED_STATUSES.has(other.status)) continue;
    activeByRoom.set(other.roomId, (activeByRoom.get(other.roomId) ?? 0) + 1);
  }

  const candidates: RoomCandidate[] = [];
  for (const room of context.rooms) {
    if (room.roomTypeId !== booking.roomTypeId) continue;
    if (OUT_OF_SERVICE.has(room.status)) continue;
    const hasOverlap = context.bookings.some(
      (other) =>
        other.id !== booking.id &&
        other.roomId === room.id &&
        !EXCLUDED_STATUSES.has(other.status) &&
        rangeOverlaps(booking.checkIn, booking.checkOut, other.checkIn, other.checkOut),
    );
    if (hasOverlap) continue;
    // available/clean = 0 points; occupied or any other status = 5
    const score = (room.status === "available" ? 0 : 5) + (activeByRoom.get(room.id) ?? 0);
    candidates.push({ room, score });
  }

  candidates.sort(
    (a, b) =>
      a.score - b.score ||
      (a.room.floor ?? "").localeCompare(b.room.floor ?? "", undefined, { numeric: true }) ||
      a.room.roomNumber.localeCompare(b.room.roomNumber, undefined, { numeric: true }),
  );

  return candidates[0]?.room ?? null;
}
