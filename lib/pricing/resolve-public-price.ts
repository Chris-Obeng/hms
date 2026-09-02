/**
 * lib/pricing/resolve-public-price.ts
 *
 * Public pricing resolver — shared by public booking routes AND admin booking
 * sheet (via the authenticated wrapper in app/actions/pricing.ts).
 *
 * The precedence rules no longer live here. `public.resolve_nightly_rates()`
 * owns them (supabase/migrations/20260831030000_resolve_nightly_rates.sql):
 *
 *   1. daily_rate_overrides    — (rate_plan_id, date, occupancy)
 *   2. seasonal_rate_overrides — highest-priority season covering the night;
 *                               weekend_price_minor on Fri/Sat when set
 *   3. room_types.base_price_minor / weekend_price_minor — hotel default
 *
 * A winning season with no override row for the room type falls through to the
 * room's own price, not to the next season down — see the migration comment.
 *
 * This module is the TypeScript face of that function: it shapes rows into the
 * ResolvedRoomPrice contract the booking funnel and the staff sheet already
 * consume. One resolver in SQL is what lets booking creation, the night audit
 * and later channel-manager pushes quote the same number the guest was shown.
 *
 * Uses supabaseAdmin so unauthenticated public pages can resolve prices
 * without a Clerk/Supabase session.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fromMinor } from "@/lib/money";
import { fetchNightlyRates } from "@/lib/pricing/nightly-rates";

// ── Internal helpers ─────────────────────────────────────────────

/** YYYY-MM-DD strings for each night of a stay: check_in … check_out - 1 */
function buildNightDates(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const cur = new Date(checkIn + "T12:00:00Z");
  const end = new Date(checkOut + "T12:00:00Z");
  while (cur < end) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Default date window used when the guest has not yet selected dates.
 * Resolving against tonight/tomorrow ensures override prices (seasonal / daily)
 * are visible on room cards as soon as a guest lands on the page — matching
 * the behaviour of Booking.com, Hotels.com and other OTAs.
 */
export function getDefaultBookingDates(): { checkIn: string; checkOut: string } {
  const now = new Date();
  const checkIn = now.toISOString().split("T")[0];
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const checkOut = tomorrow.toISOString().split("T")[0];
  return { checkIn, checkOut };
}

export interface ResolvedNight {
  date: string;
  price: number;
  source: "daily" | "seasonal" | "base";
  seasonName?: string;
}

export interface ResolvedRoomPrice {
  roomTypeId: string;
  /**
   * Check-in night rate — the industry-standard display price.
   * Booking.com / Hotels.com show the first night's price, not the
   * cheapest night. We follow the same convention.
   */
  displayPrice: number;
  /** True when displayPrice differs from the room's raw base_price. */
  hasOverride: boolean;
  /** Sum of all nightly rates across the stay. */
  subtotal: number;
  /** Average nightly rate (subtotal / number of nights). */
  avgNightlyRate: number;
  nights: ResolvedNight[];
}

/** Which rate plan and occupancy to price. Both default in SQL. */
export interface RateSelector {
  /**
   * Plan to price. Falls back to each room type's default plan when omitted or
   * when the plan belongs to a different room type.
   */
  ratePlanId?: string | null;
  /** Occupancy tier of the override rows to use. 0 means "any occupancy". */
  occupancy?: number;
}

/**
 * Resolve override-aware prices for one or more room types across a stay.
 *
 * Safe for unauthenticated callers — uses supabaseAdmin, no session required.
 * Also used by the authenticated staff server action (getResolvedRatesForBooking).
 *
 * Rows come back one per (room type, night); a room type with no row — because
 * it belongs to another hotel, or does not exist — resolves to zero, which is
 * what the previous in-process implementation did too.
 */
export async function resolvePublicRoomPrices(
  hotelId: string,
  roomTypeIds: string[],
  checkIn: string,
  checkOut: string,
  selector: RateSelector = {}
): Promise<ResolvedRoomPrice[]> {
  if (!roomTypeIds.length) return [];

  const nightDates = buildNightDates(checkIn, checkOut);
  if (!nightDates.length) return [];

  // The resolver owns every price. room_types is read only for base_price, which
  // is what hasOverride compares against — a night priced at the room's own rate
  // is not an override even when it came back tagged 'base'.
  const [rows, roomTypesRes] = await Promise.all([
    fetchNightlyRates({
      p_hotel_id: hotelId,
      p_room_type_ids: roomTypeIds,
      p_from: checkIn,
      p_to: checkOut,
      p_rate_plan_id: selector.ratePlanId ?? null,
      p_occupancy: selector.occupancy ?? 0,
    }),
    supabaseAdmin
      .from("room_types")
      .select("id, base_price")
      .eq("hotel_id", hotelId)
      .in("id", roomTypeIds),
  ]);

  if (roomTypesRes.error) {
    throw new Error(`room_types lookup failed: ${roomTypesRes.error.message}`);
  }

  const basePriceById = new Map(
    (roomTypesRes.data ?? []).map((r) => [r.id, Number(r.base_price)])
  );

  const nightsByRoomType = new Map<string, ResolvedNight[]>();
  const minorByRoomType = new Map<string, { total: number; currency: string }>();

  for (const row of rows) {
    const minor = Number(row.rate_minor);
    const night: ResolvedNight = {
      date: row.stay_date,
      price: fromMinor(minor, row.currency),
      source: row.source,
      ...(row.season_name ? { seasonName: row.season_name } : {}),
    };

    const nights = nightsByRoomType.get(row.room_type_id);
    if (nights) nights.push(night);
    else nightsByRoomType.set(row.room_type_id, [night]);

    const acc = minorByRoomType.get(row.room_type_id);
    if (acc) acc.total += minor;
    else minorByRoomType.set(row.room_type_id, { total: minor, currency: row.currency });
  }

  return roomTypeIds.map((rtId) => {
    // Sum in minor units so a long stay cannot drift by a fraction of a pesewa.
    const acc = minorByRoomType.get(rtId);
    const resolvedNights =
      nightsByRoomType.get(rtId) ??
      nightDates.map((date) => ({ date, price: 0, source: "base" as const }));

    const subtotal = acc ? fromMinor(acc.total, acc.currency) : 0;
    const nightCount = resolvedNights.length || 1;
    const avgNightlyRate = Math.round((subtotal / nightCount) * 100) / 100;

    const basePrice = basePriceById.get(rtId) ?? 0;
    // First-night rate is the industry-standard display price
    const displayPrice = resolvedNights[0]?.price ?? basePrice;
    const hasOverride = displayPrice !== basePrice;

    return { roomTypeId: rtId, displayPrice, hasOverride, subtotal, avgNightlyRate, nights: resolvedNights };
  });
}

/**
 * Resolve pricing for a single room type over a stay.
 * Returns the nightly breakdown plus totals ready to pass to the bookings table.
 */
export async function resolvePublicNightlyTotal(
  hotelId: string,
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
  selector: RateSelector = {}
): Promise<{
  subtotal: number;
  avgNightlyRate: number;
  displayPrice: number;
  hasOverride: boolean;
  nights: ResolvedNight[];
}> {
  const [result] = await resolvePublicRoomPrices(
    hotelId,
    [roomTypeId],
    checkIn,
    checkOut,
    selector
  );
  if (!result) {
    return { subtotal: 0, avgNightlyRate: 0, displayPrice: 0, hasOverride: false, nights: [] };
  }
  return {
    subtotal: result.subtotal,
    avgNightlyRate: result.avgNightlyRate,
    displayPrice: result.displayPrice,
    hasOverride: result.hasOverride,
    nights: result.nights,
  };
}
