import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { businessToday } from "@/lib/business-date";

export function addDaysSafe(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Reject invalid input rather than silently changing the dates on a report. */
export function resolveRange(startDate: string, endDate: string, timeZone = "UTC", now = new Date()) {
  const start = parseReportDate(startDate);
  const end = parseReportDate(endDate);
  if (start > end) throw new Error("Report start date must be on or before the end date.");
  if (differenceInCalendarDays(end, start) > 365) throw new Error("Reports support at most 366 days.");
  // Validate here: businessToday intentionally falls back to UTC elsewhere in the app.
  new Intl.DateTimeFormat("en", { timeZone }).format(now);
  if (endDate > businessToday(timeZone, now)) throw new Error("Report dates cannot be after the hotel's current date.");
  return { start, end };
}

export function parseReportDate(value: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Report dates must use YYYY-MM-DD.");
  const date = parseISO(value);
  if (!isValid(date) || format(date, "yyyy-MM-dd") !== value) throw new Error("Report date is not a valid calendar date.");
  return date;
}
