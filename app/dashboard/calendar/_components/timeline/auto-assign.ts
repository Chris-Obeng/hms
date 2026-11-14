import { differenceInCalendarDays, parseISO } from "date-fns";
import type { CalendarAvailabilityBlock, CalendarBooking, CalendarRoom } from "../../actions";
import { NON_BOOKABLE_ROOM_STATUSES, TERMINAL_BOOKING_STATUS_SET } from "../calendar-helpers";
import { rangeOverlaps } from "./timeline-geometry";

export interface AutoAssignContext {
  rooms: CalendarRoom[];
  bookings: CalendarBooking[];
  /** Availability blocks in the loaded window. A blocked room is never picked
   *  (the server rejects it too, so picking it would only produce an error). */
  blocks?: CalendarAvailabilityBlock[];
  /** Property business date (yyyy-MM-dd). Stays that start on or before it
   *  prefer a vacant, ready room. Without it every stay is treated that way. */
  today?: string;
}

/** Empty nights beyond this count as "no neighbour" on that side. */
const GAP_CAP = 30;

/** Numeric part of a room number, so "room 2" sorts before "room 10". */
function roomNumberValue(roomNumber: string): number {
  const digits = roomNumber.replace(/\D/g, "");
  return digits ? Number(digits) : Number.POSITIVE_INFINITY;
}

/**
 * Best free room for an unassigned booking: the same rule new reservations
 * get from `bookings_private.pick_best_room` on the server, so the tray's
 * assign button and automatic assignment agree.
 *
 *   1. Hard rules: same room type, in service, no availability block and no
 *      active stay overlapping the dates.
 *   2. For a stay starting today or earlier, a vacant ready room first, so the
 *      guest can go straight in.
 *   3. The tightest fit: fewest empty nights left between this stay and the
 *      room's neighbouring stays (each side capped at 30), so back-to-back
 *      stays come first and empty rooms stay free for long bookings.
 *   4. Room number in numeric order.
 *
 * Only the loaded window is known here; the server re-checks every move.
 */
export function pickBestRoom(booking: CalendarBooking, context: AutoAssignContext): CalendarRoom | null {
  if (!booking.roomTypeId) return null;

  const stays = context.bookings.filter(
    (other) => other.id !== booking.id && other.roomId && !TERMINAL_BOOKING_STATUS_SET.has(other.status),
  );
  const startsByToday = !context.today || booking.checkIn <= context.today;

  const candidates: Array<{ room: CalendarRoom; notReady: number; gap: number; number: number }> = [];
  for (const room of context.rooms) {
    if (room.roomTypeId !== booking.roomTypeId) continue;
    if (NON_BOOKABLE_ROOM_STATUSES.has(room.status)) continue;
    const roomStays = stays.filter((other) => other.roomId === room.id);
    if (roomStays.some((other) => rangeOverlaps(booking.checkIn, booking.checkOut, other.checkIn, other.checkOut))) {
      continue;
    }
    const isBlocked = (context.blocks ?? []).some(
      (block) =>
        block.roomId === room.id &&
        rangeOverlaps(booking.checkIn, booking.checkOut, block.startDate, block.endDate),
    );
    if (isBlocked) continue;

    let gapBefore = GAP_CAP;
    let gapAfter = GAP_CAP;
    for (const other of roomStays) {
      if (other.checkOut <= booking.checkIn) {
        gapBefore = Math.min(gapBefore, differenceInCalendarDays(parseISO(booking.checkIn), parseISO(other.checkOut)));
      } else if (other.checkIn >= booking.checkOut) {
        gapAfter = Math.min(gapAfter, differenceInCalendarDays(parseISO(other.checkIn), parseISO(booking.checkOut)));
      }
    }

    candidates.push({
      room,
      notReady: startsByToday && room.status !== "available" ? 1 : 0,
      gap: gapBefore + gapAfter,
      number: roomNumberValue(room.roomNumber),
    });
  }

  candidates.sort(
    (a, b) =>
      a.notReady - b.notReady ||
      a.gap - b.gap ||
      a.number - b.number ||
      a.room.roomNumber.localeCompare(b.room.roomNumber) ||
      a.room.id.localeCompare(b.room.id),
  );

  return candidates[0]?.room ?? null;
}
