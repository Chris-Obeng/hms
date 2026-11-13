import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

/** Narrowest day column. The timeline widens columns to fill the viewport
 *  (see TimelineCalendar), so this is a floor, not a fixed width. */
export const DAY_WIDTH = 92;
export const ROW_HEIGHT = 52;
export const GROUP_HEIGHT = 34;
export const ROOM_COLUMN_WIDTH = 220;
export const HEADER_HEIGHT = 62;

/** Inset between a bar and its day-column edges, so adjacent stays read as two bars. */
const BAR_INSET = 3;

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
  dayWidth: number = DAY_WIDTH,
): BarGeometry & { visible: boolean } {
  const rangeRight = days * dayWidth;
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

export function bookingGeometry(
  checkIn: string,
  checkOut: string,
  startDate: string,
  dayWidth: number = DAY_WIDTH,
) {
  const column = dateToColumn(checkIn, startDate);
  const nights = Math.max(1, differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)));
  return {
    left: column * dayWidth + BAR_INSET,
    width: nights * dayWidth - BAR_INSET * 2,
    column,
    nights,
  };
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
  dayWidth: number = DAY_WIDTH,
): TimelineCell | null {
  if (offsetX < 0 || offsetY < 0 || rowCount === 0 || days === 0) return null;
  const column = Math.floor(offsetX / dayWidth);
  const roomIndex = Math.floor(offsetY / ROW_HEIGHT);
  if (column >= days || roomIndex >= rowCount) return null;
  return { roomIndex, column };
}

/** Width of each day column: fill the space beside the room gutter, never
 *  narrower than DAY_WIDTH (the minimum that fits a guest name and a marker). */
export function fitDayWidth(viewportWidth: number, roomColumnWidth: number, days: number): number {
  if (!Number.isFinite(viewportWidth) || days <= 0) return DAY_WIDTH;
  return Math.max(DAY_WIDTH, Math.floor((viewportWidth - roomColumnWidth) / days));
}

export function rangeOverlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}
