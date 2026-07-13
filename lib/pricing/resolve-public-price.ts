/**
 * lib/pricing/resolve-public-price.ts
 *
 * Public pricing resolver — shared by public booking routes AND admin booking
 * sheet (via the authenticated wrapper in app/actions/pricing.ts).
 *
 * Override priority (highest → lowest):
 *   1. daily_rate_overrides   — exact date match
 *   2. seasonal_rate_overrides — date range, weekend_price if applicable
 *   3. room_types.base_price / weekend_price — hotel default
 *
 * Uses supabaseAdmin so unauthenticated public pages can resolve prices
 * without a Clerk/Supabase session.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Internal helpers ─────────────────────────────────────────────

function isWeekendNight(dateStr: string): boolean {
  // Fri (5) and Sat (6) in UTC — consistent across time zones
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return dow === 5 || dow === 6;
}

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

/**
 * Resolve override-aware prices for one or more room types across a stay.
 *
 * Safe for unauthenticated callers — uses supabaseAdmin, no session required.
 * Also used by the authenticated staff server action (getResolvedRatesForBooking).
 */
export async function resolvePublicRoomPrices(
  hotelId: string,
  roomTypeIds: string[],
  checkIn: string,
  checkOut: string
): Promise<ResolvedRoomPrice[]> {
  if (!roomTypeIds.length) return [];

  const nightDates = buildNightDates(checkIn, checkOut);
  if (!nightDates.length) return [];

  // All three queries in parallel
  const [roomTypesRes, seasonsRes, dailyRes] = await Promise.all([
    supabaseAdmin
      .from("room_types")
      .select("id, base_price, weekend_price")
      .eq("hotel_id", hotelId)
      .in("id", roomTypeIds),

    supabaseAdmin
      .from("seasonal_rates")
      .select(
        `id, name, start_date, end_date,
         overrides:seasonal_rate_overrides (
           room_type_id, base_price, weekend_price
         )`
      )
      .eq("hotel_id", hotelId)
      // Seasons that overlap the requested range
      .lte("start_date", checkOut)
      .gte("end_date", checkIn),

    supabaseAdmin
      .from("daily_rate_overrides")
      .select("room_type_id, date, price")
      .eq("hotel_id", hotelId)
      .in("room_type_id", roomTypeIds)
      .gte("date", checkIn)
      .lt("date", checkOut), // check-out night is not a stay night
  ]);

  const roomTypes = roomTypesRes.data ?? [];
  const seasons = seasonsRes.data ?? [];
  const dailyOverrides = dailyRes.data ?? [];

  return roomTypeIds.map((rtId) => {
    const rt = roomTypes.find((r) => r.id === rtId);

    const resolvedNights: ResolvedNight[] = nightDates.map((date) => {
      const weekend = isWeekendNight(date);

      // Priority 1 — daily override
      const daily = dailyOverrides.find(
        (d) => d.room_type_id === rtId && d.date === date
      );
      if (daily) {
        return { date, price: Number(daily.price), source: "daily" as const };
      }

      // Priority 2 — seasonal override
      const season = seasons.find(
        (s) => s.start_date <= date && s.end_date >= date
      );
      const seasonOverride = season?.overrides?.find(
        (o: { room_type_id: string }) => o.room_type_id === rtId
      );
      if (season && seasonOverride) {
        const price = weekend
          ? (Number(seasonOverride.weekend_price) || Number(seasonOverride.base_price))
          : Number(seasonOverride.base_price);
        return {
          date,
          price,
          source: "seasonal" as const,
          seasonName: season.name,
        };
      }

      // Priority 3 — base / weekend price
      const price = rt
        ? weekend
          ? Number(rt.weekend_price ?? rt.base_price)
          : Number(rt.base_price)
        : 0;
      return { date, price, source: "base" as const };
    });

    const subtotal = resolvedNights.reduce((sum, n) => sum + n.price, 0);
    const nightCount = resolvedNights.length || 1;
    const avgNightlyRate = Math.round((subtotal / nightCount) * 100) / 100;

    // First-night rate is the industry-standard display price
    const displayPrice = resolvedNights[0]?.price ?? Number(rt?.base_price ?? 0);
    const basePrice = Number(rt?.base_price ?? 0);
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
  checkOut: string
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
    checkOut
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
