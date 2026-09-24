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
import { toRestrictionFlags } from "@/lib/pricing/restriction-markers";
import type { RateRestrictionRow, RestrictionFlags } from "@/lib/pricing/restriction-markers";

// The pure half — types, `toRestrictionFlags`, `restrictionMarkers` — lives in
// `lib/pricing/restriction-markers.ts`, which has no Supabase import and is
// safe for client components. Re-exported here so server callers keep one
// import site.
export {
  restrictionMarkers,
  toRestrictionFlags,
} from "@/lib/pricing/restriction-markers";
export type {
  RateRestrictionRow,
  RestrictionFlags,
  RestrictionMarker,
} from "@/lib/pricing/restriction-markers";

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
