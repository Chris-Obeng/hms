/**
 * lib/pricing/restriction-markers.ts
 *
 * The pure half of rate-plan restriction rendering — no Supabase import, safe
 * for client components. `lib/pricing/rate-restrictions.ts` keeps the database
 * read (`fetchRestrictionFlags`) and re-exports everything here, so server
 * callers keep one import site while the browser bundle never touches the
 * service-role client.
 */

/** One `rate_restrictions` row, in the table's own column names. */
export type RateRestrictionRow = {
  rate_plan_id: string;
  date: string;
  min_stay: number | null;
  min_stay_arrival: number | null;
  min_stay_through: number | null;
  max_stay: number | null;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  stop_sell: boolean;
};

/** The same row in the shape the UI consumes. Present only when something is set. */
export type RestrictionFlags = {
  minStay: number | null;
  minStayArrival: number | null;
  minStayThrough: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
};

/**
 * `null` for a row that restricts nothing. Rows can end up empty — a manager
 * clearing the last control leaves one behind unless the caller deletes it — and
 * an empty row must not light up a calendar cell.
 *
 * `max_stay = 0` clears rather than forbids, which is Channex's reading of the
 * field and the one `stay_restriction_violations` implements, so a zero is
 * dropped here too instead of being shown as "maximum 0 nights".
 */
export function toRestrictionFlags(row: RateRestrictionRow): RestrictionFlags | null {
  const positive = (n: number | null) => (typeof n === "number" && n > 0 ? n : null);
  const flags: RestrictionFlags = {
    minStay: positive(row.min_stay),
    minStayArrival: positive(row.min_stay_arrival),
    minStayThrough: positive(row.min_stay_through),
    maxStay: positive(row.max_stay),
    closedToArrival: row.closed_to_arrival === true,
    closedToDeparture: row.closed_to_departure === true,
    stopSell: row.stop_sell === true,
  };
  const restricts =
    flags.minStay !== null ||
    flags.minStayArrival !== null ||
    flags.minStayThrough !== null ||
    flags.maxStay !== null ||
    flags.closedToArrival ||
    flags.closedToDeparture ||
    flags.stopSell;
  return restricts ? flags : null;
}

/** A restriction as a calendar cell shows it: a two-or-three character badge. */
export type RestrictionMarker = {
  /** Styling hook, also the React key. */
  code: "stop" | "cta" | "ctd" | "min" | "min-arrival" | "min-through" | "max";
  /** What fits in a grid cell. */
  label: string;
  /** The whole sentence, for the tooltip. */
  title: string;
};

/**
 * Every set control as a badge, in the severity order
 * `stay_restriction_violations` emits its codes — a stop sell first, because it
 * closes the date outright and makes the rest academic, then the closed days,
 * then the length-of-stay controls. Keeping one order across the SQL, the guest
 * copy and this grid means the first thing a person sees is the same fact
 * whichever surface they are looking at.
 */
export function restrictionMarkers(flags: RestrictionFlags): RestrictionMarker[] {
  const markers: RestrictionMarker[] = [];
  const nights = (n: number) => `${n} night${n === 1 ? "" : "s"}`;
  if (flags.stopSell)
    markers.push({ code: "stop", label: "Stop", title: "Stop sell — this date is closed" });
  if (flags.closedToArrival)
    markers.push({ code: "cta", label: "CTA", title: "Closed to arrival — no stay may start here" });
  if (flags.closedToDeparture)
    markers.push({
      code: "ctd",
      label: "CTD",
      title: "Closed to departure — no stay may end here",
    });
  if (flags.minStay !== null)
    markers.push({
      code: "min",
      label: `${flags.minStay}+`,
      title: `Minimum stay ${nights(flags.minStay)}`,
    });
  if (flags.minStayArrival !== null)
    markers.push({
      code: "min-arrival",
      label: `${flags.minStayArrival}+`,
      title: `Minimum stay ${nights(flags.minStayArrival)} for arrivals on this date`,
    });
  if (flags.minStayThrough !== null)
    markers.push({
      code: "min-through",
      label: `${flags.minStayThrough}+`,
      title: `Minimum stay ${nights(flags.minStayThrough)} for stays covering this date`,
    });
  if (flags.maxStay !== null)
    markers.push({
      code: "max",
      label: `≤${flags.maxStay}`,
      title: `Maximum stay ${nights(flags.maxStay)}`,
    });
  return markers;
}
