import type { CalendarAvailabilityBlock, CalendarBooking, CalendarRoom } from "../../actions";
import { isManualLikeSource } from "../calendar-helpers";
import { rangeOverlaps } from "./timeline-geometry";

export function findTimelineConflicts(bookings: CalendarBooking[]) {
  const result = new Set<string>();
  const byRoom = new Map<string, CalendarBooking[]>();
  for (const booking of bookings) {
    if (!booking.roomId || ["cancelled", "checked_out", "no_show"].includes(booking.status)) continue;
    const list = byRoom.get(booking.roomId) ?? [];
    list.push(booking); byRoom.set(booking.roomId, list);
  }
  for (const list of byRoom.values()) {
    list.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].checkIn < list[i].checkOut; j++) {
      if (rangeOverlaps(list[i].checkIn, list[i].checkOut, list[j].checkIn, list[j].checkOut)) { result.add(list[i].id); result.add(list[j].id); }
    }
  }
  return result;
}

export function validateTimelineDrop(input: { booking: CalendarBooking; room: CalendarRoom; checkIn: string; checkOut: string; bookings: CalendarBooking[]; blocks: CalendarAvailabilityBlock[]; today?: string; allowRoomTypeChange?: boolean }) {
  const { booking, room, checkIn, checkOut, bookings, blocks, today, allowRoomTypeChange } = input;
  if (["cancelled", "checked_out", "no_show"].includes(booking.status)) return `Cannot move ${booking.status.replaceAll("_", " ")} booking`;
  if (checkOut <= checkIn) return "Check-out must be after check-in";
  if (["maintenance", "out_of_service"].includes(room.status)) return `Room is ${room.status.replaceAll("_", " ")}`;
  // Must mirror the live-preview rule in evaluateTarget — the drop path is
  // authoritative, so a rule enforced only in the preview would be cosmetic.
  if (today && checkIn < today && !isManualLikeSource(booking.source) && booking.status !== "checked_in") return "Cannot schedule in the past";
  if (!allowRoomTypeChange && booking.roomTypeId && room.roomTypeId !== booking.roomTypeId) return "Room type mismatch";
  if (bookings.some((other) => other.id !== booking.id && other.roomId === room.id && !["cancelled", "checked_out", "no_show"].includes(other.status) && rangeOverlaps(checkIn, checkOut, other.checkIn, other.checkOut))) return "Room already has overlapping booking";
  if (blocks.some((block) => block.roomId === room.id && rangeOverlaps(checkIn, checkOut, block.startDate, block.endDate))) return "Room blocked for selected dates";
  return null;
}
