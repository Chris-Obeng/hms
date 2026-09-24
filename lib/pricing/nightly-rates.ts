/**
 * lib/pricing/nightly-rates.ts
 *
 * The single call site for `public.resolve_nightly_rates()`
 * (supabase/migrations/20260831030000_resolve_nightly_rates.sql).
 *
 * Two very different screens need the same nightly rates: the guest booking
 * funnel, which quotes money, and the staff rate matrix, which shows where that
 * money came from. Both go through this function so a rate can never differ
 * between what staff see and what a guest is charged — and so the cast below,
 * which exists only until types are regenerated, lives in exactly one file.
 *
 * Service role is deliberate. The function is SECURITY DEFINER and takes the
 * hotel id as an argument, so it reads the same rows whichever client calls it;
 * callers are responsible for passing a hotel id the caller is entitled to
 * (requireAuth().hotelId for staff, the resolved public hotel for guests).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

/** One night, one room type, one rate plan. Money is in minor units. */
export interface NightlyRateRow {
  room_type_id: string;
  rate_plan_id: string | null;
  stay_date: string;
  occupancy: number;
  /** bigint — PostgREST may hand it back as a string. */
  rate_minor: number | string;
  currency: string;
  source: "daily" | "seasonal" | "base";
  /** Season that priced this night; null when it did not. */
  seasonal_rate_id: string | null;
  season_name: string | null;
  /** Friday/Saturday, decided by the database so no caller recomputes it. */
  is_weekend: boolean;
  /** Winning season for the night, set even when it did not price it. */
  active_seasonal_rate_id: string | null;
  active_season_name: string | null;
}

export interface ResolverArgs {
  p_hotel_id: string;
  p_room_type_ids: string[];
  /** First night, inclusive. */
  p_from: string;
  /** Check-out date, exclusive — the check-out night is not a stay night. */
  p_to: string;
  p_rate_plan_id: string | null;
  p_occupancy: number;
}

/**
 * `types/database.types.ts` is generated against the remote project, which has
 * not been migrated yet, so its Functions map does not know this function. The
 * cast is the whole cost of that gap: drop it and call
 * `supabaseAdmin.rpc("resolve_nightly_rates", args)` directly once db:types has
 * been regenerated from a project carrying migration 20260831030000.
 *
 * Errors are thrown rather than swallowed. Falling back to a zero or
 * un-overridden price quietly quotes the wrong money; failing loudly is the
 * only safe direction for a rate.
 */
export async function fetchNightlyRates(args: ResolverArgs): Promise<NightlyRateRow[]> {
  // Bound explicitly: `supabaseAdmin.rpc` uses `this.rest` internally, so a
  // detached reference crashes with `undefined.rest` at call time.
  const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
    fn: "resolve_nightly_rates",
    params: ResolverArgs
  ) => Promise<{
    data: NightlyRateRow[] | null;
    error: { message: string } | null;
  }>;

  const { data, error } = await rpc("resolve_nightly_rates", args);
  if (error) {
    throw new Error(`resolve_nightly_rates failed: ${error.message}`);
  }
  return data ?? [];
}

/**
 * The day after `date`, as YYYY-MM-DD. Callers that think in inclusive ranges
 * (a rate matrix showing every column through endDate) need this to build the
 * exclusive `p_to` the resolver expects. Noon UTC keeps the arithmetic clear of
 * daylight-saving edges.
 */
export function nextDay(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}
