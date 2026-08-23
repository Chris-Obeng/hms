// Property business-date helpers.
//
// A hotel's operational day ("today", arrival dates, availability) is defined
// by the property's timezone — never by the server's clock or a staff member's
// device clock. This mirrors how established PMS platforms (Opera, Mews,
// Cloudbeds) resolve the business date.
//
// Do NOT use `new Date().toISOString().split("T")[0]` for business dates: it
// silently shifts the day for any property west/east of UTC (e.g. Nairobi is
// UTC+3, Lagos UTC+1). Use businessToday(hotel.timezone) instead.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getYmdFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function ymdFromParts(formatter: Intl.DateTimeFormat, now: Date): string {
  const parts = new Map(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

/**
 * Returns the current business date for a timezone as "YYYY-MM-DD".
 * Falls back to UTC when the timezone identifier is invalid.
 */
export function businessToday(timeZone: string, now: Date = new Date()): string {
  try {
    return ymdFromParts(getYmdFormatter(timeZone), now);
  } catch {
    return ymdFromParts(getYmdFormatter("UTC"), now);
  }
}
