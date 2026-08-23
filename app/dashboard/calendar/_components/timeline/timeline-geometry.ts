import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export const DAY_WIDTH = 92;
export const ROW_HEIGHT = 52;
export const GROUP_HEIGHT = 34;
export const ROOM_COLUMN_WIDTH = 220;
export const HEADER_HEIGHT = 62;

export interface BarGeometry {
  left: number;
  width: number;
  column: number;
  nights: number;
}

/** Clip a bar geometry to the visible date range. Returns visible=false for bars entirely outside the range. */
export function clampBarGeometry(
  geometry: BarGeometry,
  days: number,
): BarGeometry & { visible: boolean } {
  const rangeRight = days * DAY_WIDTH;
  if (geometry.left >= rangeRight || geometry.left + geometry.width <= 0) {
    return { ...geometry, visible: false };
  }
  const left = Math.max(0, geometry.left);
  const right = Math.min(rangeRight, geometry.left + geometry.width);
  return { ...geometry, left, width: right - left, visible: true };
}

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

export interface TimelineCell {
  roomIndex: number;
  column: number;
}

/** Map a point (relative to the grid origin) to a timeline cell. Returns null when outside the grid. */
export function pointToCell(
  offsetX: number,
  offsetY: number,
  days: number,
  rowCount: number,
): TimelineCell | null {
  if (offsetX < 0 || offsetY < 0 || rowCount === 0 || days === 0) return null;
  const column = Math.floor(offsetX / DAY_WIDTH);
  const roomIndex = Math.floor(offsetY / ROW_HEIGHT);
  if (column >= days || roomIndex >= rowCount) return null;
  return { roomIndex, column };
}

export function rangeOverlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}
