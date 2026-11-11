/** Calendar-only report date helpers, shared by the BI page and the date-range control. */
const DAY_MS = 86_400_000;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Calendar-only arithmetic avoids browser/server timezone and DST shifts. */
export function shiftReportDate(value: string, days: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function validateReportRange(range: { startDate: string; endDate: string }, today: string): string | null {
  if (!validDate(range.startDate) || !validDate(range.endDate)) return "Enter a valid start and end date.";
  if (range.startDate > range.endDate) return "End date must be on or after start date.";
  if (range.endDate > today) return "End date cannot be after the current property date.";
  const days = (Date.parse(range.endDate) - Date.parse(range.startDate)) / DAY_MS + 1;
  if (days > 366) return "Choose a date range of 366 days or fewer.";
  return null;
}

/** A short, calm period label: "Sep 23 – Oct 22, 2026" within one year. */
export function reportPeriodLabel(range: { startDate: string; endDate: string }): string {
  const sameYear = range.startDate.slice(0, 4) === range.endDate.slice(0, 4);
  const start = formatDatePart(range.startDate, sameYear ? "short" : "full");
  const end = formatDatePart(range.endDate, "full");
  return `${start} – ${end}`;
}
function formatDatePart(value: string, style: "short" | "full"): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en",
    style === "short"
      ? { month: "short", day: "numeric", timeZone: "UTC" }
      : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
