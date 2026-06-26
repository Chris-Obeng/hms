import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = req.nextUrl;
  const checkIn = searchParams.get("check_in");
  const checkOut = searchParams.get("check_out");

  // Resolve hotel by slug or x-hotel-slug header
  const resolvedSlug = slug === "current" ? req.headers.get("x-hotel-slug") ?? slug : slug;

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency, check_in_time, check_out_time, cancellation_policy, settings")
    .or(`slug.eq.${resolvedSlug},custom_domain.eq.${resolvedSlug}`)
    .eq("status", "active")
    .single();

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

  // If no dates, return rooms with pricing only (no availability)
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
        amenities: rt.amenities ?? [],
        images: rt.images ?? [],
        available: null,
        availableCount: null,
      })),
    });
  }

  // Fetch availability for each room type using the DB function
  const availabilityResults = await Promise.all(
    roomTypes.map(async (rt) => {
      const { data } = await supabase.rpc("room_type_available_count", {
        p_room_type_id: rt.id,
        p_check_in: checkIn,
        p_check_out: checkOut,
      });
      return { id: rt.id, count: data ?? 0 };
    })
  );

  const availabilityMap = new Map(availabilityResults.map((r) => [r.id, r.count]));

  return NextResponse.json({
    hotel: buildHotelShape(hotel, settings),
    rooms: roomTypes.map((rt) => {
      const count = availabilityMap.get(rt.id) ?? 0;
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
        amenities: rt.amenities ?? [],
        images: rt.images ?? [],
        available: count > 0,
        availableCount: count,
      };
    }),
  });
}

function buildHotelShape(hotel: any, settings: Record<string, unknown>) {
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
