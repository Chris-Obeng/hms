import type { CalendarAvailabilityBlock, CalendarBooking, CalendarRoom } from "../../actions";
import { NON_BOOKABLE_ROOM_STATUSES, TERMINAL_BOOKING_STATUS_SET } from "../calendar-helpers";
import { rangeOverlaps } from "./timeline-geometry";

export interface AutoAssignContext {
  rooms: CalendarRoom[];
  bookings: CalendarBooking[];
  /** Availability blocks in the loaded window. A blocked room is never picked
   *  (the server rejects it too, so picking it would only produce an error). */
  blocks?: CalendarAvailabilityBlock[];
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
 *   3. No overlap with an active booking or an availability block for the
 *      stay window (DB also enforces).
 *   4. Prefer vacant + available ("clean") rooms over rooms still occupied
 *      tonight — front desk should not promise a room that must be turned over.
 *   5. Deterministic tiebreak: floor, then room number (numeric aware).
 */
export function pickBestRoom(booking: CalendarBooking, context: AutoAssignContext): CalendarRoom | null {
  if (!booking.roomTypeId) return null;

  const activeByRoom = new Map<string, number>();
  for (const other of context.bookings) {
    if (other.id === booking.id || !other.roomId || TERMINAL_BOOKING_STATUS_SET.has(other.status)) continue;
    activeByRoom.set(other.roomId, (activeByRoom.get(other.roomId) ?? 0) + 1);
  }

  const candidates: RoomCandidate[] = [];
  for (const room of context.rooms) {
    if (room.roomTypeId !== booking.roomTypeId) continue;
    if (NON_BOOKABLE_ROOM_STATUSES.has(room.status)) continue;
    const hasOverlap = context.bookings.some(
      (other) =>
        other.id !== booking.id &&
        other.roomId === room.id &&
        !TERMINAL_BOOKING_STATUS_SET.has(other.status) &&
        rangeOverlaps(booking.checkIn, booking.checkOut, other.checkIn, other.checkOut),
    );
    if (hasOverlap) continue;
    const isBlocked = (context.blocks ?? []).some(
      (block) =>
        block.roomId === room.id &&
        rangeOverlaps(booking.checkIn, booking.checkOut, block.startDate, block.endDate),
    );
    if (isBlocked) continue;
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
