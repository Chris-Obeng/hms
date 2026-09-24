/**
 * lib/pricing/rate-restrictions.ts
 *
 * The per-date half of rate-plan restrictions.
 *
 * `lib/bookings/stay-restrictions.ts` answers a question about one stay — may
 * this window be sold? — and returns a verdict written for a guest. A calendar
 * asks the opposite question: for each date in a window, what is set? A stay
 * verdict cannot answer that. A three-night minimum only surfaces once a stay is
 * short enough to break it, while staff need to see the minimum on the days it
 * applies whether anyone is breaking it or not.
 *
 * So this module reads the rows themselves, and stays sparse on purpose: a date
 * with no row, or a row whose every control has been cleared, carries no flags.
 * The grid then marks only the dates where a restriction actually exists, and the
 * payload grows with the restrictions a hotel has set rather than with the size
 * of its calendar.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

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
      label: `\u2264${flags.maxStay}`,
      title: `Maximum stay ${nights(flags.maxStay)}`,
    });
  return markers;
}

/**
 * The slice of the PostgREST builder this one read uses. `rate_restrictions`
 * ships in migration 20260902130000, which the remote project has not been given
 * yet, so `types/database.types.ts` does not know the table and the typed client
 * rejects it by name — the same gap the documented `rpc` casts in
 * `lib/pricing/nightly-rates.ts` and `lib/bookings/create-booking-atomic.ts`
 * cover. Delete this type and call `supabaseAdmin.from("rate_restrictions")`
 * directly once db:types has been regenerated from a migrated project.
 */
type RestrictionFilter = PromiseLike<{
  data: RateRestrictionRow[] | null;
  error: { message: string } | null;
}> & {
  eq(column: string, value: string): RestrictionFilter;
  in(column: string, values: readonly string[]): RestrictionFilter;
  gte(column: string, value: string): RestrictionFilter;
  lte(column: string, value: string): RestrictionFilter;
};

const RESTRICTION_COLUMNS =
  "rate_plan_id, date, min_stay, min_stay_arrival, min_stay_through, max_stay, closed_to_arrival, closed_to_departure, stop_sell";

/**
 * Every restriction set on these rate plans between `from` and `to` inclusive, as
 * a map keyed `${ratePlanId}_${date}`. Dates that restrict nothing are absent
 * rather than mapped to a null, so a caller reads `map.has(key)` or takes the
 * value and stops.
 *
 * One round trip for the whole grid. The read is a range scan over
 * `rate_restrictions_plan_date_key`, so its cost follows the restrictions in the
 * window and not the room-type count — the reason the availability matrix can ask
 * for forty room types across sixty days without forty queries.
 *
 * Scoped by `hotel_id` as well as by plan, even though the plan ids already came
 * from one hotel's room types: the extra predicate is what makes a mistake
 * upstream a wrong-hotel empty result rather than a cross-tenant read, and it is
 * the column `idx_rate_restrictions_hotel_date` is built on.
 */
export async function fetchRestrictionFlags(
  hotelId: string,
  ratePlanIds: readonly string[],
  from: string,
  to: string
): Promise<Map<string, RestrictionFlags>> {
  const flags = new Map<string, RestrictionFlags>();
  const planIds = [...new Set(ratePlanIds)];
  if (!planIds.length) return flags;

  // Bound explicitly: `supabaseAdmin.from` uses `this.rest` internally, so a
  // detached reference crashes with `undefined.rest` at call time.
  const table = supabaseAdmin.from.bind(supabaseAdmin) as unknown as (
    relation: "rate_restrictions"
  ) => { select: (columns: string) => RestrictionFilter };

  const { data, error } = await table("rate_restrictions")
    .select(RESTRICTION_COLUMNS)
    .eq("hotel_id", hotelId)
    .in("rate_plan_id", planIds)
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const resolved = toRestrictionFlags(row);
    if (resolved) flags.set(`${row.rate_plan_id}_${row.date}`, resolved);
  }
  return flags;
}
