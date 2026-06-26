import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RoomCard } from "../_components/room-card";
import { DateSearchBar } from "../_components/date-search-bar";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ check_in?: string; check_out?: string }>;

export default async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const { check_in, check_out } = await searchParams;
  const h = await headers();
  const slug = h.get("x-hotel-slug") ?? "";

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, slug, currency")
    .or(`slug.eq.${slug},custom_domain.eq.${slug}`)
    .eq("status", "active")
    .single();

  if (!hotel) notFound();

  const { data: roomTypes } = await supabaseAdmin
    .from("room_types")
    .select("id, name, slug, short_description, base_price, weekend_price, images, amenities, bed_configuration, max_adults, max_children, sort_order")
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  // Availability counts when dates provided
  let availMap = new Map<string, number>();
  if (check_in && check_out && roomTypes) {
    const results = await Promise.all(
      roomTypes.map(async (rt) => {
        const { data } = await supabaseAdmin.rpc("room_type_available_count", {
          p_room_type_id: rt.id,
          p_check_in: check_in,
          p_check_out: check_out,
        });
        return { id: rt.id, count: data ?? 0 };
      })
    );
    availMap = new Map(results.map((r) => [r.id, r.count]));
  }

  const nights = check_in && check_out
    ? Math.ceil((new Date(check_out).getTime() - new Date(check_in).getTime()) / 86400000)
    : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[#FAFAF8]/95 backdrop-blur border-b border-[#E7E5E4] px-5 md:px-10 py-3 flex items-center gap-4">
        <Link href="/" className="booking-heading text-lg text-[#1C1917] shrink-0">{hotel.name}</Link>
        <div className="flex-1 max-w-2xl">
          <DateSearchBar slug={slug} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 md:px-10 py-12">
        <div className="mb-8">
          <h1 className="booking-heading text-4xl">
            {check_in && check_out
              ? <>Rooms for <span className="booking-heading-italic text-[#78716C]">{check_in} — {check_out}</span></>
              : "All Rooms & Rates"
            }
          </h1>
          {nights && <p className="text-sm text-[#78716C] mt-1">{nights} night{nights !== 1 ? "s" : ""}</p>}
        </div>

        {!roomTypes?.length ? (
          <div className="text-center py-20 text-[#78716C]">
            <p className="text-lg">No rooms available yet.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roomTypes.map((rt) => {
              const count = availMap.size > 0 ? (availMap.get(rt.id) ?? 0) : null;
              const imgs = (Array.isArray(rt.images) ? rt.images : []) as { url: string; caption: string }[];
              const amenities = (Array.isArray(rt.amenities) ? rt.amenities : []) as { icon: string; label: string }[];
              return (
                <RoomCard
                  key={rt.id}
                  id={rt.id}
                  name={rt.name}
                  shortDescription={rt.short_description}
                  basePrice={rt.base_price}
                  currency={hotel.currency ?? "GHS"}
                  images={imgs}
                  amenities={amenities}
                  checkIn={check_in}
                  checkOut={check_out}
                  availableCount={count}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
