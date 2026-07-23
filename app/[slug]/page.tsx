import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Clock, Phone } from "lucide-react";
import { DateSearchBar } from "./_components/date-search-bar";
import { RoomCard } from "./_components/room-card";
import { BookingSiteHeader } from "./_components/booking-site-header";
import {
  resolvePublicRoomPrices,
  getDefaultBookingDates,
} from "@/lib/pricing/resolve-public-price";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export default async function HotelLandingPage({ params }: Props) {
  const { slug } = await params;
  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select(
      "id,name,currency,description,address,city,phone,email,cover_image_url,logo_url,check_in_time,check_out_time,cancellation_policy"
    )
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
    .order("name", { ascending: true })
    .limit(6);

  const { checkIn: defaultCheckIn, checkOut: defaultCheckOut } =
    getDefaultBookingDates();
  const ids = (roomTypes ?? []).map((rt) => rt.id);
  const resolvedPrices = ids.length
    ? await resolvePublicRoomPrices(
        hotel.id,
        ids,
        defaultCheckIn,
        defaultCheckOut
      )
    : [];
  const priceMap = new Map(resolvedPrices.map((p) => [p.roomTypeId, p]));

  const location = [hotel.city, hotel.address].filter(Boolean);
  const locationLabel = hotel.city || hotel.address;
  const hasHours = !!(hotel.check_in_time || hotel.check_out_time);

  return (
    <div className="min-h-[100dvh]">
      <a href="#rooms" className="booking-skip-link">
        Skip to rooms
      </a>

      <BookingSiteHeader
        slug={slug}
        hotelName={hotel.name}
        logoUrl={hotel.logo_url}
        phone={hotel.phone}
        variant="hero"
      />

      {/* Hero */}
      <section className="relative min-h-[100svh] sm:min-h-[100dvh] max-h-[920px] flex flex-col items-center justify-center pt-[calc(3.25rem+env(safe-area-inset-top))] sm:pt-[calc(3.5rem+env(safe-area-inset-top))] pb-10 sm:pb-16">
        {hotel.cover_image_url ? (
          <Image
            src={hotel.cover_image_url}
            alt=""
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-stone-700 via-stone-800 to-stone-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/75" />

        <div className="relative z-10 text-center px-4 sm:px-5 w-full max-w-3xl">
          <p className="booking-heading-italic text-white/75 text-base sm:text-lg md:text-xl mb-1.5 sm:mb-2 pb-0.5">
            Welcome to
          </p>
          <h1 className="booking-heading text-white text-[2.5rem] leading-[1.05] sm:text-5xl md:text-6xl lg:text-7xl mb-3 text-balance px-1">
            {hotel.name}
          </h1>
          {locationLabel && (
            <p className="inline-flex items-center justify-center gap-1.5 text-white/70 text-sm mb-6 sm:mb-8 tracking-wide max-w-full px-2">
              <MapPin className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
              <span className="truncate">{locationLabel}</span>
            </p>
          )}
          {!locationLabel && <div className="mb-6 sm:mb-8" />}
          <Suspense
            fallback={
              <div className="h-[160px] sm:h-[68px] max-w-4xl mx-auto rounded-2xl bg-white/90 animate-pulse" />
            }
          >
            <DateSearchBar slug={slug} />
          </Suspense>
        </div>
      </section>

      {/* Stay facts strip */}
      {(hasHours || hotel.phone) && (
        <div className="border-b border-[var(--bk-line)] bg-[var(--bk-surface)]">
          <div className="max-w-6xl mx-auto booking-safe-x py-3 sm:py-3.5 flex flex-wrap items-center justify-center gap-x-6 sm:gap-x-8 gap-y-2 text-sm text-[var(--bk-ink-soft)]">
            {hotel.check_in_time && (
              <span className="inline-flex items-center gap-2">
                <Clock className="size-3.5 text-[var(--bk-muted)]" strokeWidth={1.75} />
                Check-in from {hotel.check_in_time}
              </span>
            )}
            {hotel.check_out_time && (
              <span className="inline-flex items-center gap-2">
                <Clock className="size-3.5 text-[var(--bk-muted)]" strokeWidth={1.75} />
                Check-out by {hotel.check_out_time}
              </span>
            )}
            {hotel.phone && (
              <a
                href={`tel:${hotel.phone}`}
                className="inline-flex items-center gap-2 hover:text-[var(--bk-ink)] transition-colors"
              >
                <Phone className="size-3.5 text-[var(--bk-muted)]" strokeWidth={1.75} />
                {hotel.phone}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Rooms */}
      <section
        id="rooms"
        className="max-w-6xl mx-auto booking-safe-x py-12 sm:py-16 md:py-20 scroll-mt-4"
      >
        <div className="flex items-end justify-between gap-4 mb-7 sm:mb-10">
          <div className="min-w-0">
            <h2 className="booking-heading text-2xl sm:text-3xl md:text-4xl text-[var(--bk-ink)]">
              Our rooms
            </h2>
            <p className="text-[var(--bk-muted)] mt-1.5 text-sm">
              Book direct for the best available rate
            </p>
          </div>
          <Link
            href={`/${slug}/rooms`}
            className="text-sm font-medium text-[var(--bk-muted)] hover:text-[var(--bk-ink)] underline underline-offset-4 decoration-[var(--bk-line-strong)] transition-colors hidden sm:block shrink-0"
          >
            View all
          </Link>
        </div>

        {!roomTypes?.length ? (
          <div className="booking-surface-soft py-16 text-center">
            <p className="text-[var(--bk-muted)] text-sm">
              Rooms will appear here once published.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(roomTypes ?? []).map((rt) => {
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
                  datesSelected={false}
                />
              );
            })}
          </div>
        )}

        {roomTypes && roomTypes.length > 0 && (
          <div className="mt-8 sm:hidden text-center">
            <Link
              href={`/${slug}/rooms`}
              className="text-sm font-medium text-[var(--bk-muted)] hover:text-[var(--bk-ink)] underline underline-offset-4"
            >
              View all rooms
            </Link>
          </div>
        )}
      </section>

      {/* About */}
      {hotel.description && (
        <section className="border-t border-[var(--bk-line)] bg-[var(--bk-surface-soft)]">
          <div className="max-w-2xl mx-auto booking-safe-x py-12 sm:py-14 md:py-16">
            <h2 className="booking-heading text-2xl sm:text-3xl text-[var(--bk-ink)] mb-4">
              About {hotel.name}
            </h2>
            <p className="text-[var(--bk-ink-soft)] leading-relaxed whitespace-pre-wrap max-w-[65ch]">
              {hotel.description}
            </p>
            {hotel.cancellation_policy && (
              <div className="mt-8 pt-6 border-t border-[var(--bk-line)]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--bk-muted)] mb-2">
                  Cancellation
                </p>
                <p className="text-sm text-[var(--bk-ink-soft)] leading-relaxed max-w-[65ch]">
                  {hotel.cancellation_policy}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-[var(--bk-line)] bg-[var(--bk-ink)] text-white/55 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-6xl mx-auto booking-safe-x py-10 flex flex-col sm:flex-row gap-8 justify-between text-sm">
          <div className="space-y-1.5">
            <p className="booking-heading text-lg text-white">{hotel.name}</p>
            {location.length > 0 && (
              <p>
                {hotel.address}
                {hotel.address && hotel.city ? ", " : ""}
                {hotel.city}
              </p>
            )}
            {hotel.phone && (
              <a
                href={`tel:${hotel.phone}`}
                className="block hover:text-white/80 transition-colors"
              >
                {hotel.phone}
              </a>
            )}
            {hotel.email && (
              <a
                href={`mailto:${hotel.email}`}
                className="block hover:text-white/80 transition-colors"
              >
                {hotel.email}
              </a>
            )}
          </div>
          <div className="space-y-1.5 sm:text-right">
            {hotel.check_in_time && <p>Check-in from {hotel.check_in_time}</p>}
            {hotel.check_out_time && <p>Check-out by {hotel.check_out_time}</p>}
            <Link
              href={`/${slug}/book`}
              className="inline-block mt-2 text-white font-medium hover:underline underline-offset-4"
            >
              Book your stay
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
