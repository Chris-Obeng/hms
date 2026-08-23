import { CalendarDate } from "@internationalized/date";

/** Convert a JS Date to an @internationalized/date CalendarDate (local timezone, no time component). */
export function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Convert an @internationalized/date CalendarDate back to a JS Date at local midnight. */
export function fromCalendarDate(value: CalendarDate): Date {
  return new Date(value.year, value.month - 1, value.day);
}
