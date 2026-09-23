import type { CalendarAvailabilityBlock, CalendarBooking, CalendarRoom } from "../../actions";
import { findOverlappingBookingIds } from "@/lib/calendar-domain";
import { isManualLikeSource, NON_BOOKABLE_ROOM_STATUSES, TERMINAL_BOOKING_STATUS_SET } from "../calendar-helpers";
import { rangeOverlaps } from "./timeline-geometry";

export function findTimelineConflicts(bookings: CalendarBooking[]) {
  // Delegates to the shared overlap detector so the two implementations cannot
  // drift; terminal-status filtering happens here since RoomStay has no status.
  return findOverlappingBookingIds(bookings.filter((b) => !TERMINAL_BOOKING_STATUS_SET.has(b.status)));
}

export function validateTimelineDrop(input: { booking: CalendarBooking; room: CalendarRoom; checkIn: string; checkOut: string; bookings: CalendarBooking[]; blocks: CalendarAvailabilityBlock[]; today?: string; allowRoomTypeChange?: boolean }) {
  const { booking, room, checkIn, checkOut, bookings, blocks, today, allowRoomTypeChange } = input;
  if (TERMINAL_BOOKING_STATUS_SET.has(booking.status)) return `Cannot move ${booking.status.replaceAll("_", " ")} booking`;
  if (checkOut <= checkIn) return "Check-out must be after check-in";
  if (NON_BOOKABLE_ROOM_STATUSES.has(room.status)) return `Room is ${room.status.replaceAll("_", " ")}`;
  // Must mirror the live-preview rule in evaluateTarget — the drop path is
  // authoritative, so a rule enforced only in the preview would be cosmetic.
  if (today && checkIn < today && !isManualLikeSource(booking.source) && booking.status !== "checked_in") return "Cannot schedule in the past";
  if (!allowRoomTypeChange && booking.roomTypeId && room.roomTypeId !== booking.roomTypeId) return "Room type mismatch";
  if (bookings.some((other) => other.id !== booking.id && other.roomId === room.id && !TERMINAL_BOOKING_STATUS_SET.has(other.status) && rangeOverlaps(checkIn, checkOut, other.checkIn, other.checkOut))) return "Room already has overlapping booking";
  if (blocks.some((block) => block.roomId === room.id && rangeOverlaps(checkIn, checkOut, block.startDate, block.endDate))) return "Room blocked for selected dates";
  return null;
}
