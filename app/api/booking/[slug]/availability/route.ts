import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";
import { resolvePublicRoomPrices } from "@/lib/pricing/resolve-public-price";
import { rateLimit } from "@/lib/rate-limit";
import { captureError, captureSupabaseError, flushSentry } from "@/lib/observability/sentry";
import {
  fetchStayRestrictions,
  type RoomTypeStayRestrictions,
} from "@/lib/bookings/stay-restrictions";
import { hotelSlugParam, isoDateParam, validateStayRange } from "@/lib/validation/params";

/**
 * GET /api/booking/[slug]/availability
 *
 * First step of the guest booking funnel: the room list and, once dates are
 * chosen, live availability and override-resolved prices.
 *
 * Observability: failures here are reported as step `search`. The count and the
 * price resolver degrade to "nothing available" rather than erroring, which looks
 * identical to a genuinely full hotel — so they are the two silent ways this
 * funnel loses guests. The restriction read degrades the other way, to "nothing
 * restricted", because `bookings_restrictions_guard` still refuses a closed stay
 * at the write and a blanked room list loses a guest who could have booked.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    return await handleAvailability(req, ctx);
  } finally {
    await flushSentry();
  }
}

async function handleAvailability(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Generous limit — legitimate guests poll this while picking dates.
  const rl = await rateLimit(req, { name: "availability", limit: 60, windowSeconds: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { slug } = await params;
  const { searchParams } = req.nextUrl;

  // Resolve hotel by slug or x-hotel-slug header.
  // Use separate eq() calls instead of .or() string interpolation — the .or()
  // pattern with template literals is vulnerable to PostgREST filter injection
  // (e.g. a slug like "foo,status.eq.suspended" would be parsed as two filters).
  const resolvedSlug = slug === "current" ? req.headers.get("x-hotel-slug") ?? slug : slug;

  // Hard-validate slug before any query, using the shared allowlist.
  if (!hotelSlugParam.safeParse(resolvedSlug).success) {
    return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
  }

  // Both dates are passed straight to `room_type_available_count`, so they are
  // validated rather than trusted. Absent means "no dates picked yet" and is
  // handled below; present-but-malformed is a bad request.
  const checkInParam = readDateParam(searchParams.get("check_in"));
  const checkOutParam = readDateParam(searchParams.get("check_out"));
  if (!checkInParam.ok || !checkOutParam.ok) {
    return NextResponse.json({ error: "Invalid check-in or check-out date" }, { status: 400 });
  }
  const checkIn = checkInParam.value;
  const checkOut = checkOutParam.value;

  // With both dates present, bound the span before it reaches the date-series
  // RPC: service_role has no statement_timeout, so an inverted or multi-century
  // range would otherwise pin a connection for the full scan (DoS). Absent dates
  // fall through to the "no dates yet" branch below.
  if (checkIn && checkOut) {
    const stay = validateStayRange(checkIn, checkOut);
    if (!stay.ok) {
      return NextResponse.json({ error: stay.reason }, { status: 400 });
    }
  }

  // Try slug first, then custom_domain — two clean parameterized queries.
  let hotelQuery = await supabase
    .from("hotels")
    .select("id, name, currency, check_in_time, check_out_time, cancellation_policy, settings")
    .eq("slug", resolvedSlug)
    .eq("status", "active")
    .maybeSingle();

  if (!hotelQuery.data) {
    hotelQuery = await supabase
      .from("hotels")
      .select("id, name, currency, check_in_time, check_out_time, cancellation_policy, settings")
      .eq("custom_domain", resolvedSlug)
      .eq("status", "active")
      .maybeSingle();
  }

  const hotel = hotelQuery.data;

  if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

  const settings = (hotel.settings as Record<string, unknown>) ?? {};

  // Fetch all active room types
  const { data: roomTypes, error: roomTypesErr } = await supabase
    .from("room_types")
    .select("id, name, slug, short_description, base_price, weekend_price, amenities, images, max_adults, max_children, bed_configuration, sort_order")
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (roomTypesErr) {
    // The empty-list response below is indistinguishable from a hotel that has
    // published no rooms, so the booking page goes blank with no error anywhere.
    captureSupabaseError(roomTypesErr, "room_types.select.availability", {
      scope: "booking-funnel",
      step: "search",
      level: "error",
      hotelId: hotel.id,
      tags: { "hotel.slug": resolvedSlug },
    });
  }

  if (!roomTypes?.length) {
    return NextResponse.json({
      hotel: buildHotelShape(hotel, settings),
      rooms: [],
    });
  }

  // If no dates, return rooms with base pricing only (no availability, no override lookup)
  if (!checkIn || !checkOut) {
    return NextResponse.json({
      hotel: buildHotelShape(hotel, settings),
      rooms: roomTypes.map((rt) => ({
        id: rt.id,
        name: rt.name,
        slug: rt.slug,
        shortDescription: rt.short_description,
        bedConfiguration: rt.bed_configuration,
        maxAdults: rt.max_adults,
        maxChildren: rt.max_children,
        basePrice: rt.base_price,
        weekendPrice: rt.weekend_price,
        // displayPrice = base price when no dates selected
        displayPrice: rt.base_price,
        subtotal: null,
        amenities: rt.amenities ?? [],
        images: rt.images ?? [],
        available: null,
        availableCount: null,
        // Restrictions are evaluated against a stay, so there is nothing to say
        // until the guest has picked one. Sent as nulls rather than omitted so
        // the response keeps one shape either way.
        sellable: null,
        restrictionReason: null,
      })),
    });
  }

  // Availability, prices and restrictions in parallel — three round trips for
  // the whole room list, whatever the hotel's size.
  const roomTypeIds = roomTypes.map((rt) => rt.id);
  const [availability, resolvedPrices, restrictions] = await Promise.all([
    // One round trip for every room type. The previous per-room-type fan-out
    // made the guest wait on N pooled connections and re-derived the same date
    // series N times; the RPC computes the whole set in a single query.
    supabase.rpc("room_type_available_counts", {
      p_room_type_ids: roomTypeIds,
      p_from: checkIn,
      p_to: checkOut,
    }),
    resolvePublicRoomPrices(hotel.id, roomTypeIds, checkIn, checkOut),
    // Advisory at this step: the write is guarded, so a failed read costs the
    // guest an explanation, not a wrong sale. Caught here rather than thrown so
    // one closed rate plan cannot take the whole room list down with it.
    fetchStayRestrictions(hotel.id, roomTypeIds, checkIn, checkOut).catch(
      (error: unknown) => {
        captureError(error, {
          scope: "booking-funnel",
          step: "search",
          level: "warning",
          hotelId: hotel.id,
          tags: { "hotel.slug": resolvedSlug, read: "room_type_stay_restrictions" },
          contexts: { stay: { check_in: checkIn, check_out: checkOut } },
        });
        return new Map<string, RoomTypeStayRestrictions>();
      }
    ),
  ]);

  // A failed count renders every room as sold out, so this is an error rather
  // than a warning. One call also means one event per request instead of one per
  // room type per poll, which is what used to threaten the Sentry quota.
  if (availability.error) {
    captureSupabaseError(availability.error, "rpc.room_type_available_counts", {
      scope: "booking-funnel",
      step: "search",
      level: "error",
      hotelId: hotel.id,
      tags: { "hotel.slug": resolvedSlug },
      contexts: {
        availability: {
          total_room_types: roomTypeIds.length,
          check_in: checkIn,
          check_out: checkOut,
        },
      },
    });
  }

  const availabilityMap = new Map(
    (availability.data ?? []).map((row) => [row.room_type_id, row.available])
  );
  const priceMap = new Map(resolvedPrices.map((p) => [p.roomTypeId, p]));

  return NextResponse.json({
    hotel: buildHotelShape(hotel, settings),
    rooms: roomTypes.map((rt) => {
      const count = availabilityMap.get(rt.id) ?? 0;
      const resolved = priceMap.get(rt.id);
      const restriction = restrictions.get(rt.id);
      return {
        id: rt.id,
        name: rt.name,
        slug: rt.slug,
        shortDescription: rt.short_description,
        bedConfiguration: rt.bed_configuration,
        maxAdults: rt.max_adults,
        maxChildren: rt.max_children,
        basePrice: rt.base_price,
        weekendPrice: rt.weekend_price,
        // Override-resolved prices for the selected dates
        displayPrice: resolved?.displayPrice ?? rt.base_price,
        subtotal: resolved?.subtotal ?? null,
        amenities: rt.amenities ?? [],
        images: rt.images ?? [],
        available: count > 0,
        availableCount: count,
        // Inventory and policy are two different answers, and the widget needs
        // both: a room type can have free rooms and still not be sellable for
        // this window, in which case the guest is told the minimum stay rather
        // than a flat "sold out" they cannot act on.
        sellable: restriction ? restriction.sellable : true,
        restrictionReason: restriction?.reason ?? null,
      };
    }),
  });
}

/**
 * Reads an optional `yyyy-MM-dd` query parameter. Distinguishes "not supplied"
 * (valid — the widget renders base prices) from "supplied but not a real date"
 * (rejected), which a bare `string | null` cannot express.
 */
function readDateParam(value: string | null): { ok: boolean; value: string | null } {
  if (value === null) return { ok: true, value: null };
  const parsed = isoDateParam.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, value: null };
}

interface HotelRow {
  id: string;
  name: string;
  currency: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  cancellation_policy: string | null;
  settings: unknown;
}

function buildHotelShape(hotel: HotelRow, settings: Record<string, unknown>) {
  return {
    id: hotel.id,
    name: hotel.name,
    currency: hotel.currency ?? "GHS",
    checkInTime: hotel.check_in_time,
    checkOutTime: hotel.check_out_time,
    cancellationPolicy: hotel.cancellation_policy,
    paymentPolicy: (settings.payment_policy as string) ?? "choice",
  };
}
