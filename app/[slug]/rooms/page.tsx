import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DateSearchBar } from "../_components/date-search-bar";
import { RoomCard } from "../_components/room-card";
import {
  resolvePublicRoomPrices,
  getDefaultBookingDates,
} from "@/lib/pricing/resolve-public-price";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ check_in?: string; check_out?: string }>;
};

export default async function RoomsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { check_in, check_out } = await searchParams;

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id,name,currency")
    .eq("slug", slug)
    .eq("status", "active")
    .single();
  if (!hotel) notFound();

  const { data: roomTypes } = await supabaseAdmin
    .from("room_types")
    .select("id,name,short_description,base_price,images,amenities,sort_order")
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const ids = (roomTypes ?? []).map((rt) => rt.id);

  // Determine the date window to price against:
  //   - User-selected dates (from URL) → exact prices for those nights
  //   - No dates → default tonight/tomorrow so overrides still show
  const datesSelected = !!(check_in && check_out);
  const { checkIn: defaultCheckIn, checkOut: defaultCheckOut } = getDefaultBookingDates();
  const pricingCheckIn = check_in ?? defaultCheckIn;
  const pricingCheckOut = check_out ?? defaultCheckOut;

  // Resolve prices and (when dates selected) availability in parallel
  const [resolvedPrices, availResults] = await Promise.all([
    ids.length
      ? resolvePublicRoomPrices(hotel.id, ids, pricingCheckIn, pricingCheckOut)
      : Promise.resolve([]),
    datesSelected && roomTypes
      ? Promise.all(
          roomTypes.map(async (rt) => {
            const { data } = await supabaseAdmin.rpc("room_type_available_count", {
              p_room_type_id: rt.id,
              p_check_in: check_in,
              p_check_out: check_out,
            });
            return { id: rt.id, count: data ?? 0 };
          })
        )
      : Promise.resolve([]),
  ]);

  const priceMap = new Map(resolvedPrices.map((p) => [p.roomTypeId, p]));
  const availMap = new Map(availResults.map((r) => [r.id, r.count]));

  const nights =
    check_in && check_out
      ? Math.ceil(
          (new Date(check_out).getTime() - new Date(check_in).getTime()) / 86400000
        )
      : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[#FAFAF8]/95 backdrop-blur border-b border-[#E7E5E4] px-5 md:px-10 py-3 flex items-center gap-4">
        <Link href={`/${slug}`} className="booking-heading text-lg text-[#1C1917] shrink-0">
          {hotel.name}
        </Link>
        <div className="flex-1 max-w-2xl">
          <DateSearchBar slug={slug} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 md:px-10 py-12">
        <h1 className="booking-heading text-4xl mb-2">
          {check_in && check_out ? (
            <>
              Rooms for{" "}
              <span className="booking-heading-italic text-[#78716C]">
                {check_in} to {check_out}
              </span>
            </>
          ) : (
            "All Rooms & Rates"
          )}
        </h1>
        {nights && (
          <p className="text-sm text-[#78716C] mb-8">
            {nights} night{nights !== 1 ? "s" : ""}
          </p>
        )}

        {!roomTypes?.length ? (
          <p className="text-center py-20 text-[#78716C]">No rooms available yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mt-8">
            {roomTypes.map((rt) => {
              const resolved = priceMap.get(rt.id);
              return (
                <RoomCard
                  key={rt.id}
                  slug={slug}
                  id={rt.id}
                  name={rt.name}
                  shortDescription={rt.short_description}
                  basePrice={resolved?.displayPrice ?? rt.base_price}
                  currency={hotel.currency ?? "GHS"}
                  images={
                    (Array.isArray(rt.images) ? rt.images : []) as {
                      url: string;
                      caption: string;
                    }[]
                  }
                  amenities={
                    (Array.isArray(rt.amenities) ? rt.amenities : []) as {
                      icon: string;
                      label: string;
                    }[]
                  }
                  checkIn={check_in}
                  checkOut={check_out}
                  availableCount={datesSelected ? (availMap.get(rt.id) ?? 0) : null}
                  datesSelected={datesSelected}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
