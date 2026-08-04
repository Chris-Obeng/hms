import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export const DAY_WIDTH = 92;
export const ROW_HEIGHT = 52;
export const GROUP_HEIGHT = 34;
export const ROOM_COLUMN_WIDTH = 220;

export function dateToColumn(date: string, startDate: string): number {
  return differenceInCalendarDays(parseISO(date), parseISO(startDate));
}

export function columnToDate(column: number, startDate: string): string {
  return format(addDays(parseISO(startDate), column), "yyyy-MM-dd");
}

export function bookingGeometry(checkIn: string, checkOut: string, startDate: string) {
  const column = dateToColumn(checkIn, startDate);
  const nights = Math.max(1, differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)));
  return { left: column * DAY_WIDTH + 3, width: nights * DAY_WIDTH - 6, column, nights };
}

export function rangeOverlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}
