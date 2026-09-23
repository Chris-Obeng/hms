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
 * Returns the business date of an instant for a timezone as "YYYY-MM-DD".
 * Falls back to UTC when the timezone identifier is invalid.
 */
export function businessDate(timeZone: string, at: Date): string {
  try {
    return ymdFromParts(getYmdFormatter(timeZone), at);
  } catch {
    return ymdFromParts(getYmdFormatter("UTC"), at);
  }
}

/**
 * Returns the current business date for a timezone as "YYYY-MM-DD".
 * Falls back to UTC when the timezone identifier is invalid.
 */
export function businessToday(timeZone: string, now: Date = new Date()): string {
  return businessDate(timeZone, now);
}

const ymdHmsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getYmdHmsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = ymdHmsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    ymdHmsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function zonedIsoFromParts(formatter: Intl.DateTimeFormat, at: Date): string {
  const parts = new Map(formatter.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}Z`;
}

function addCalendarDaysUtc(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** UTC instant of local midnight for `dateStr` in `timeZone`. */
function zonedMidnightUtc(dateStr: string, timeZone: string): Date {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = getYmdHmsFormatter(timeZone);
    formatter.format(new Date()); // throws RangeError on an invalid identifier
  } catch {
    formatter = getYmdHmsFormatter("UTC");
  }
  // Start from the target wall midnight read as UTC, then shift by the
  // wall-clock error measured at the guess. Each iteration is anchored to the
  // target midnight (not to the guess) so the true instant is a fixed point;
  // the loop converges in ≤2 passes because a zone's offset changes at most
  // once across a single day.
  const targetMs = Date.parse(`${dateStr}T00:00:00Z`);
  let guessMs = targetMs;
  for (let i = 0; i < 3; i += 1) {
    const wallMs = Date.parse(zonedIsoFromParts(formatter, new Date(guessMs)));
    const nextMs = guessMs - (wallMs - targetMs);
    if (nextMs === guessMs) break;
    guessMs = nextMs;
  }
  return new Date(guessMs);
}

/**
 * UTC bounds of one business day ("YYYY-MM-DD") in the property timezone, as
 * a half-open interval [startISO, endISO). Query with `.gte(start).lt(end)`.
 * Falls back to UTC when the timezone identifier is invalid.
 */
export function businessDayBounds(
  dateStr: string,
  timeZone: string,
): { startISO: string; endISO: string } {
  return {
    startISO: zonedMidnightUtc(dateStr, timeZone).toISOString(),
    endISO: zonedMidnightUtc(addCalendarDaysUtc(dateStr, 1), timeZone).toISOString(),
  };
}
