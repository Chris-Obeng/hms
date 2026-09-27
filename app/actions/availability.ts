"use server";

import { requireMinRole, toActionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolvePublicRoomPrices } from "@/lib/pricing/resolve-public-price";
import { validateStayRange } from "@/lib/validation/params";
import {
  fetchStayRestrictions,
  type RoomTypeStayRestrictions,
} from "@/lib/bookings/stay-restrictions";
import { captureError } from "@/lib/observability/sentry";

/** One room type over the chosen stay, as the availability step renders it. */
export interface StaffAvailabilityRoom {
  roomTypeId: string;
  name: string;
  shortDescription: string | null;
  /** Free rooms of this type across the stay. 0 = sold out. */
  availableCount: number;
  available: boolean;
  /** First-night rate (override-resolved) — the headline price. */
  displayPrice: number;
  /** Sum of nightly rates across the stay. */
  subtotal: number;
  /** subtotal / nights. */
  avgNightly: number;
  /** False when a rate-plan restriction blocks this stay window. */
  sellable: boolean;
  restrictionReason: string | null;
  maxAdults: number;
  maxChildren: number;
}

export interface StaffAvailabilityResult {
  currency: string;
  nights: number;
  rooms: StaffAvailabilityRoom[];
}

export type StaffAvailabilityResponse =
  | { success: true; data: StaffAvailabilityResult }
  | { success: false; error: string };

/**
 * Staff-scoped availability for the new-reservation wizard. Mirrors the public
 * funnel (app/api/booking/[slug]/availability), but resolves the hotel from the
 * auth context instead of a slug, so a desk sees only its own inventory.
 *
 * The span is validated before the date-series RPC: the resolver runs on the
 * service role, which has no statement_timeout, so an inverted or huge range
 * would otherwise pin a connection.
 */
export async function getStaffAvailability(
  checkIn: string,
  checkOut: string
): Promise<StaffAvailabilityResponse> {
  try {
    const ctx = await requireMinRole("front_desk", "view availability");
    const hotelId = ctx.hotelId;
    const currency = ctx.hotel.currency ?? "GHS";

    const stay = validateStayRange(checkIn, checkOut);
    if (!stay.ok) return { success: false, error: stay.reason };

    const nights = Math.round(
      (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000
    );

    const supabase = await createClient();

    const { data: roomTypes, error: rtErr } = await supabase
      .from("room_types")
      .select("id, name, short_description, base_price, max_adults, max_children, sort_order")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (rtErr) return { success: false, error: rtErr.message };
    if (!roomTypes?.length) {
      return { success: true, data: { currency, nights, rooms: [] } };
    }

    const roomTypeIds = roomTypes.map((rt) => rt.id);

    // Counts, prices and restrictions in parallel — three round trips whatever
    // the hotel's size. Restrictions degrade to "nothing restricted" on failure:
    // the write is still guarded, so a failed read costs an explanation, not a
    // wrong sale, and one closed plan cannot blank the whole list.
    const [availability, resolvedPrices, restrictions] = await Promise.all([
      supabase.rpc("room_type_available_counts", {
        p_room_type_ids: roomTypeIds,
        p_from: checkIn,
        p_to: checkOut,
      }),
      resolvePublicRoomPrices(hotelId, roomTypeIds, checkIn, checkOut),
      fetchStayRestrictions(hotelId, roomTypeIds, checkIn, checkOut).catch(
        (error: unknown) => {
          captureError(error, {
            scope: "server-action",
            level: "warning",
            hotelId,
            role: ctx.role,
            tags: { action: "getStaffAvailability", read: "room_type_stay_restrictions" },
          });
          return new Map<string, RoomTypeStayRestrictions>();
        }
      ),
    ]);

    if (availability.error) {
      return { success: false, error: availability.error.message };
    }

    const availabilityMap = new Map(
      (availability.data ?? []).map((row) => [row.room_type_id, row.available])
    );
    const priceMap = new Map(resolvedPrices.map((p) => [p.roomTypeId, p]));

    const rooms: StaffAvailabilityRoom[] = roomTypes.map((rt) => {
      const count = availabilityMap.get(rt.id) ?? 0;
      const resolved = priceMap.get(rt.id);
      const restriction = restrictions.get(rt.id);
      const base = Number(rt.base_price) || 0;
      return {
        roomTypeId: rt.id,
        name: rt.name,
        shortDescription: rt.short_description ?? null,
        availableCount: count,
        available: count > 0,
        displayPrice: resolved?.displayPrice ?? base,
        subtotal: resolved?.subtotal ?? base * nights,
        avgNightly: resolved?.avgNightlyRate ?? base,
        sellable: restriction ? restriction.sellable : true,
        restrictionReason: restriction?.reason ?? null,
        maxAdults: rt.max_adults ?? 2,
        maxChildren: rt.max_children ?? 0,
      };
    });

    return { success: true, data: { currency, nights, rooms } };
  } catch (err) {
    return toActionError(err, { action: "availability.getStaffAvailability" });
  }
}
