import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DateSearchBar } from "../_components/date-search-bar";
import { RoomCard } from "../_components/room-card";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ check_in?: string; check_out?: string }> };

export default async function RoomsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { check_in, check_out } = await searchParams;
  const { data: hotel } = await supabaseAdmin.from("hotels").select("id,name,currency").eq("slug", slug).eq("status", "active").single();
  if (!hotel) notFound();
  const { data: roomTypes } = await supabaseAdmin.from("room_types").select("id,name,short_description,base_price,images,amenities,sort_order").eq("hotel_id", hotel.id).eq("is_active", true).order("sort_order", { ascending: true }).order("name", { ascending: true });

  let availMap = new Map<string, number>();
  if (check_in && check_out && roomTypes) {
    const results = await Promise.all(roomTypes.map(async (rt) => { const { data } = await supabaseAdmin.rpc("room_type_available_count", { p_room_type_id: rt.id, p_check_in: check_in, p_check_out: check_out }); return { id: rt.id, count: data ?? 0 }; }));
    availMap = new Map(results.map(r => [r.id, r.count]));
  }
  const nights = check_in && check_out ? Math.ceil((new Date(check_out).getTime() - new Date(check_in).getTime()) / 86400000) : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[#FAFAF8]/95 backdrop-blur border-b border-[#E7E5E4] px-5 md:px-10 py-3 flex items-center gap-4">
        <Link href={`/${slug}`} className="booking-heading text-lg text-[#1C1917] shrink-0">{hotel.name}</Link>
        <div className="flex-1 max-w-2xl"><DateSearchBar slug={slug} /></div>
      </header>
      <main className="max-w-6xl mx-auto px-5 md:px-10 py-12">
        <h1 className="booking-heading text-4xl mb-2">{check_in && check_out ? <>Rooms for <span className="booking-heading-italic text-[#78716C]">{check_in} to {check_out}</span></> : "All Rooms & Rates"}</h1>
        {nights && <p className="text-sm text-[#78716C] mb-8">{nights} night{nights !== 1 ? "s" : ""}</p>}
        {!roomTypes?.length ? <p className="text-center py-20 text-[#78716C]">No rooms available yet.</p> : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mt-8">
            {roomTypes.map(rt => <RoomCard key={rt.id} slug={slug} id={rt.id} name={rt.name} shortDescription={rt.short_description} basePrice={rt.base_price} currency={hotel.currency ?? "GHS"} images={(Array.isArray(rt.images) ? rt.images : []) as { url: string; caption: string }[]} amenities={(Array.isArray(rt.amenities) ? rt.amenities : []) as { icon: string; label: string }[]} checkIn={check_in} checkOut={check_out} availableCount={availMap.size > 0 ? (availMap.get(rt.id) ?? 0) : null} />)}
          </div>
        )}
      </main>
    </div>
  );
}
