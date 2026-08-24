import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

export function addDaysSafe(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Parse + clamp a yyyy-MM-dd pair: swap if reversed, cap at today, span ≤ 366 days. */
export function resolveRange(startDate: string, endDate: string) {
  const today = new Date();
  let start = parseISO(startDate);
  let end = parseISO(endDate);
  if (!isValid(start)) start = parseISO(format(today, "yyyy-MM-dd"));
  if (!isValid(end)) end = start;
  // Date-only strings compare as local midnight
  const todayMid = parseISO(format(today, "yyyy-MM-dd"));
  if (start > end) [start, end] = [end, start];
  if (end > todayMid) end = todayMid;
  if (start > todayMid) start = todayMid;
  if (differenceInCalendarDays(end, start) > 365) {
    end = addDaysSafe(start, 365);
  }
  return { start, end };
}
