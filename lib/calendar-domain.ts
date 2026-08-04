import { addDays, format, parseISO } from "date-fns";

export type DateRange = { startDate: string; endDate: string };

/** UI selects inclusive blocked days; DB stores half-open [start, end). */
export function toStoredBlockRange(startDate: string, inclusiveEndDate: string): DateRange {
  if (inclusiveEndDate < startDate) throw new Error("End date must be on or after start date");
  return {
    startDate,
    endDate: format(addDays(parseISO(inclusiveEndDate), 1), "yyyy-MM-dd"),
  };
}

export function includesDate(range: DateRange, date: string): boolean {
  return range.startDate <= date && date < range.endDate;
}

export type RoomStay = {
  id: string;
  roomId: string | null;
  checkIn: string;
  checkOut: string;
};

export type BookingStay = RoomStay & {
  status: string | null;
};

export function staysOnDate(stay: RoomStay, date: string): boolean {
  return stay.checkIn <= date && date < stay.checkOut;
}

export function isStayoverOnDate(stay: RoomStay, date: string): boolean {
  return stay.checkIn < date && date < stay.checkOut;
}

export function isInHouseOnDate(booking: BookingStay, date: string): boolean {
  return booking.status === "checked_in" && booking.checkIn <= date && date <= booking.checkOut;
}

export function isCheckedInStayoverOnDate(booking: BookingStay, date: string): boolean {
  return booking.status === "checked_in" && isStayoverOnDate(booking, date);
}

export function findOverlappingBookingIds(stays: RoomStay[]): Set<string> {
  const conflicts = new Set<string>();
  const byRoom = new Map<string, RoomStay[]>();
  for (const stay of stays) {
    if (!stay.roomId) continue;
    const room = byRoom.get(stay.roomId) ?? [];
    room.push(stay);
    byRoom.set(stay.roomId, room);
  }
  for (const roomStays of byRoom.values()) {
    roomStays.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    for (let i = 0; i < roomStays.length; i += 1) {
      for (let j = i + 1; j < roomStays.length; j += 1) {
        if (roomStays[j].checkIn >= roomStays[i].checkOut) break;
        if (roomStays[i].checkIn < roomStays[j].checkOut) {
          conflicts.add(roomStays[i].id);
          conflicts.add(roomStays[j].id);
        }
      }
    }
  }
  return conflicts;
}
