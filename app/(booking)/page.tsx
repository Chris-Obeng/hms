import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { DateSearchBar } from "./_components/date-search-bar";
import { RoomCard } from "./_components/room-card";

export const dynamic = "force-dynamic";

export default async function BookingHomePage() {
  const h = await headers();
  const slug = h.get("x-hotel-slug") ?? "";

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, currency, description, address, city, phone, email, cover_image_url, logo_url, check_in_time, check_out_time, cancellation_policy, settings")
    .or(`slug.eq.${slug},custom_domain.eq.${slug}`)
    .eq("status", "active")
    .single();

  if (!hotel) notFound();

  const { data: roomTypes } = await supabaseAdmin
    .from("room_types")
    .select("id, name, short_description, base_price, images, amenities, sort_order")
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(6);

  const firstImage = (_: any) => null; // unused — RoomCard now handles images array

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-5 md:px-10 h-14 bg-transparent backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center gap-2.5">
          {hotel.logo_url && (
            <Image src={hotel.logo_url} alt={hotel.name} width={32} height={32} className="rounded-md object-cover" />
          )}
          <span className="booking-heading text-[17px] text-white drop-shadow-sm">{hotel.name}</span>
        </div>
        <Link
          href="/book"
          className="h-8 px-4 rounded-full bg-white text-[#1C1917] text-sm font-medium hover:bg-white/90 transition-colors"
        >
          Book Now
        </Link>
      </header>

      {/* Hero */}
      <section className="relative h-[85vh] min-h-[520px] flex flex-col items-center justify-center">
        {hotel.cover_image_url ? (
          <Image
            src={hotel.cover_image_url}
            alt={hotel.name}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-stone-800 to-stone-950" />
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60" />

        <div className="relative z-10 text-center px-5 max-w-3xl">
          <p className="booking-heading-italic text-white/80 text-lg md:text-xl mb-3">Welcome to</p>
          <h1 className="booking-heading text-white text-5xl md:text-7xl mb-5">{hotel.name}</h1>
          {hotel.address && (
            <p className="text-white/70 text-sm mb-10">{hotel.city ?? hotel.address}</p>
          )}

          {/* Primary action — date search */}
          <DateSearchBar slug={slug} />
        </div>
      </section>

      {/* Rooms section */}
      <section className="max-w-6xl mx-auto px-5 md:px-10 py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="booking-heading text-4xl text-[#1C1917]">Our Rooms</h2>
            <p className="text-[#78716C] mt-1.5 text-sm">Book direct for the best available rate</p>
          </div>
          <Link href="/rooms" className="text-sm text-[#78716C] hover:text-[#1C1917] underline underline-offset-2 transition-colors hidden sm:block">
            View all rooms
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(roomTypes ?? []).map((rt) => {
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
              />
            );
          })}
        </div>
      </section>

      {/* About */}
      {hotel.description && (
        <section className="border-t border-[#E7E5E4] bg-[#F5F4F2]">
          <div className="max-w-3xl mx-auto px-5 md:px-10 py-16">
            <h2 className="booking-heading text-3xl mb-5">About {hotel.name}</h2>
            <p className="text-[#44403C] leading-relaxed whitespace-pre-wrap">{hotel.description}</p>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-[#E7E5E4] bg-[#1C1917] text-white/60">
        <div className="max-w-6xl mx-auto px-5 md:px-10 py-10 flex flex-col sm:flex-row gap-6 justify-between text-sm">
          <div className="space-y-1">
            <p className="text-white font-medium">{hotel.name}</p>
            {hotel.address && <p>{hotel.address}{hotel.city ? `, ${hotel.city}` : ""}</p>}
            {hotel.phone && <p>{hotel.phone}</p>}
            {hotel.email && <p>{hotel.email}</p>}
          </div>
          <div className="space-y-1">
            {hotel.check_in_time && <p>Check-in: {hotel.check_in_time}</p>}
            {hotel.check_out_time && <p>Check-out: {hotel.check_out_time}</p>}
            {hotel.cancellation_policy && (
              <p className="max-w-xs text-xs text-white/40 mt-2">{hotel.cancellation_policy}</p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
