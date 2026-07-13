import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";
import { resolvePublicRoomPrices } from "@/lib/pricing/resolve-public-price";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = req.nextUrl;
  const checkIn = searchParams.get("check_in");
  const checkOut = searchParams.get("check_out");

  // Resolve hotel by slug or x-hotel-slug header.
  // Use separate eq() calls instead of .or() string interpolation — the .or()
  // pattern with template literals is vulnerable to PostgREST filter injection
  // (e.g. a slug like "foo,status.eq.suspended" would be parsed as two filters).
  const resolvedSlug = slug === "current" ? req.headers.get("x-hotel-slug") ?? slug : slug;

  // Hard-validate slug before any query — slugs are alphanumeric + hyphens + dots only.
  if (!/^[a-z0-9.-]{1,253}$/i.test(resolvedSlug)) {
    return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
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
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id, name, slug, short_description, base_price, weekend_price, amenities, images, max_adults, max_children, bed_configuration, sort_order")
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

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
      })),
    });
  }

  // Fetch availability + override-resolved prices in parallel
  const roomTypeIds = roomTypes.map((rt) => rt.id);
  const [availabilityResults, resolvedPrices] = await Promise.all([
    Promise.all(
      roomTypes.map(async (rt) => {
        const { data } = await supabase.rpc("room_type_available_count", {
          p_room_type_id: rt.id,
          p_check_in: checkIn,
          p_check_out: checkOut,
        });
        return { id: rt.id, count: data ?? 0 };
      })
    ),
    resolvePublicRoomPrices(hotel.id, roomTypeIds, checkIn, checkOut),
  ]);

  const availabilityMap = new Map(availabilityResults.map((r) => [r.id, r.count]));
  const priceMap = new Map(resolvedPrices.map((p) => [p.roomTypeId, p]));

  return NextResponse.json({
    hotel: buildHotelShape(hotel, settings),
    rooms: roomTypes.map((rt) => {
      const count = availabilityMap.get(rt.id) ?? 0;
      const resolved = priceMap.get(rt.id);
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
      };
    }),
  });
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
