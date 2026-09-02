import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { DateSearchBar } from "../_components/date-search-bar";
import { RoomCard } from "../_components/room-card";
import {
  resolvePublicRoomPrices,
  getDefaultBookingDates,
} from "@/lib/pricing/resolve-public-price";
import {
  fetchStayRestrictions,
  type RoomTypeStayRestrictions,
} from "@/lib/bookings/stay-restrictions";
import { captureError, captureSupabaseError } from "@/lib/observability/sentry";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    check_in?: string;
    check_out?: string;
    adults?: string;
    children?: string;
    rooms?: string;
  }>;
};

type RoomTypeRow = {
  id: string;
  name: string;
  short_description: string | null;
  base_price: number;
  images: unknown;
  amenities: unknown;
};

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso;
  }
}

function RoomGrid({
  rooms,
  slug,
  hotelCurrency,
  priceMap,
  availMap,
  restrictionMap,
  checkIn,
  checkOut,
  datesSelected,
  adults,
  childGuests,
  roomsParam,
}: {
  rooms: RoomTypeRow[];
  slug: string;
  hotelCurrency: string;
  priceMap: Map<string, { displayPrice: number }>;
  availMap: Map<string, number>;
  restrictionMap: Map<string, RoomTypeStayRestrictions>;
  checkIn?: string;
  checkOut?: string;
  datesSelected: boolean;
  adults?: string;
  childGuests?: string;
  roomsParam?: string;
}) {
  return (
    <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((rt) => {
        const resolved = priceMap.get(rt.id);
        return (
          <RoomCard
            key={rt.id}
            slug={slug}
            id={rt.id}
            name={rt.name}
            shortDescription={rt.short_description}
            basePrice={resolved?.displayPrice ?? rt.base_price}
            currency={hotelCurrency}
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
            checkIn={checkIn}
            checkOut={checkOut}
            availableCount={datesSelected ? (availMap.get(rt.id) ?? 0) : null}
            restrictionReason={
              datesSelected ? (restrictionMap.get(rt.id)?.reason ?? null) : null
            }
            datesSelected={datesSelected}
            adults={adults}
            childGuests={childGuests}
            rooms={roomsParam}
          />
        );
      })}
    </div>
  );
}

export default async function RoomsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { check_in, check_out, adults, children, rooms } = await searchParams;

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id,name,currency")
    .eq("slug", slug)
    .eq("status", "active")
    .single();
  if (!hotel) notFound();

  const { data: roomTypes } = await supabaseAdmin
    .from("room_types")
    .select(
      "id,name,short_description,base_price,images,amenities,sort_order"
    )
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const ids = (roomTypes ?? []).map((rt) => rt.id);

  const datesSelected = !!(check_in && check_out && check_out > check_in);
  const { checkIn: defaultCheckIn, checkOut: defaultCheckOut } =
    getDefaultBookingDates();
  const pricingCheckIn = check_in ?? defaultCheckIn;
  const pricingCheckOut = check_out ?? defaultCheckOut;

  const [resolvedPrices, availResult, restrictionMap] = await Promise.all([
    ids.length
      ? resolvePublicRoomPrices(
          hotel.id,
          ids,
          pricingCheckIn,
          pricingCheckOut
        )
      : Promise.resolve([]),
    datesSelected && ids.length
      ? // One RPC for the whole page instead of one per room type.
        supabaseAdmin.rpc("room_type_available_counts", {
          p_room_type_ids: ids,
          p_from: check_in!,
          p_to: check_out!,
        })
      : Promise.resolve({ data: [], error: null }),
    // Free rooms do not make a stay sellable: the rate plan may be closed to
    // arrival on the date, or want more nights than the guest asked for. Caught
    // rather than thrown because the booking write is guarded either way, so a
    // failed read costs the guest an explanation here, not a wrong sale.
    datesSelected && ids.length
      ? fetchStayRestrictions(hotel.id, ids, check_in!, check_out!).catch(
          (error: unknown) => {
            captureError(error, {
              scope: "booking-funnel",
              step: "search",
              level: "warning",
              hotelId: hotel.id,
              tags: { "hotel.slug": slug, read: "room_type_stay_restrictions" },
              contexts: {
                stay: { check_in: check_in ?? null, check_out: check_out ?? null },
              },
            });
            return new Map<string, RoomTypeStayRestrictions>();
          }
        )
      : Promise.resolve(new Map<string, RoomTypeStayRestrictions>()),
  ]);

  // Silence here would render every room as sold out, which looks like a fully
  // booked hotel rather than a broken query. Report it and let the page degrade.
  if (availResult.error) {
    captureSupabaseError(availResult.error, "rpc.room_type_available_counts", {
      scope: "booking-funnel",
      step: "search",
      level: "error",
      hotelId: hotel.id,
      tags: { "hotel.slug": slug },
      contexts: {
        availability: {
          total_room_types: ids.length,
          check_in: check_in ?? null,
          check_out: check_out ?? null,
        },
      },
    });
  }

  const priceMap = new Map(resolvedPrices.map((p) => [p.roomTypeId, p]));
  const availMap = new Map(
    (availResult.data ?? []).map((row) => [row.room_type_id, row.available])
  );

  const nights =
    datesSelected
      ? Math.ceil(
          (new Date(check_out!).getTime() - new Date(check_in!).getTime()) /
            86400000
        )
      : null;

  // Bookable means both halves: rooms free, and the rate plan willing to sell
  // this window. Everything else drops into the section below the fold, which
  // says why per card rather than lumping a minimum stay in with sold out.
  const bookable = (id: string) =>
    (availMap.get(id) ?? 0) > 0 && (restrictionMap.get(id)?.sellable ?? true);

  const availableRooms =
    datesSelected && roomTypes
      ? roomTypes.filter((rt) => bookable(rt.id))
      : (roomTypes ?? []);

  const unavailableRooms =
    datesSelected && roomTypes ? roomTypes.filter((rt) => !bookable(rt.id)) : [];

  const partyBits: string[] = [];
  if (adults) {
    const a = Number.parseInt(adults, 10);
    if (a > 0) partyBits.push(`${a} adult${a !== 1 ? "s" : ""}`);
  }
  if (children) {
    const c = Number.parseInt(children, 10);
    if (c > 0) partyBits.push(`${c} child${c !== 1 ? "ren" : ""}`);
  }
  if (rooms) {
    const r = Number.parseInt(rooms, 10);
    if (r > 1) partyBits.push(`${r} rooms`);
  }

  const currency = hotel.currency ?? "GHS";

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#rooms-main" className="booking-skip-link">
        Skip to rooms
      </a>

      <header className="booking-header sticky top-0 z-40 booking-safe-x py-1.5 sm:py-2 flex flex-col min-[640px]:flex-row min-[640px]:items-center gap-1.5 sm:gap-2.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <Link
          href={`/${slug}`}
          className="booking-heading text-sm sm:text-base text-[var(--bk-ink)] shrink-0 hover:opacity-80 transition-opacity truncate max-w-full sm:max-w-[12rem] md:max-w-none"
        >
          {hotel.name}
        </Link>
        <div className="flex-1 max-w-2xl w-full min-w-0">
          <Suspense
            fallback={
              <div className="h-10 sm:h-11 rounded-xl bg-[var(--bk-surface-soft)] border border-[var(--bk-line)] animate-pulse" />
            }
          >
            <DateSearchBar slug={slug} variant="compact" />
          </Suspense>
        </div>
      </header>

      <main
        id="rooms-main"
        className="flex-1 max-w-6xl w-full mx-auto booking-safe-x py-5 sm:py-8 md:py-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 sm:mb-8">
          <h1 className="booking-heading text-xl sm:text-3xl md:text-4xl text-[var(--bk-ink)] text-balance">
            {datesSelected ? (
              <>
                Rooms for{" "}
                <span className="booking-heading-italic text-[var(--bk-muted)]">
                  {fmtDate(check_in!)} – {fmtDate(check_out!)}
                </span>
              </>
            ) : (
              "All rooms & rates"
            )}
          </h1>
          <p className="text-sm text-[var(--bk-muted)] mt-1.5 leading-relaxed">
            {nights != null && nights > 0
              ? [
                  `${nights} night${nights !== 1 ? "s" : ""}`,
                  `${availableRooms.length} room type${
                    availableRooms.length !== 1 ? "s" : ""
                  } available`,
                  ...partyBits,
                ].join(" · ")
              : "Select dates to see live availability and exact rates"}
          </p>
        </div>

        {!roomTypes?.length ? (
          <div className="booking-surface-soft py-20 text-center">
            <p className="text-[var(--bk-muted)] text-sm">
              No rooms available yet.
            </p>
            <Link
              href={`/${slug}`}
              className="inline-block mt-4 text-sm font-medium text-[var(--bk-ink)] underline underline-offset-4"
            >
              Back to hotel
            </Link>
          </div>
        ) : datesSelected && availableRooms.length === 0 ? (
          <div className="booking-surface-soft py-16 px-6 text-center max-w-md mx-auto">
            <p className="booking-heading text-2xl text-[var(--bk-ink)] mb-2">
              No rooms for these dates
            </p>
            <p className="text-sm text-[var(--bk-muted)] mb-6">
              Try different dates or contact the hotel for availability.
            </p>
            <Link
              href={`/${slug}/rooms`}
              className="inline-flex h-10 px-5 items-center rounded-xl bg-[var(--bk-ink)] text-[var(--bk-on-ink)] text-sm font-semibold hover:bg-[var(--bk-ink-hover)] transition-colors active:scale-[0.98]"
            >
              Clear dates
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            <RoomGrid
              rooms={datesSelected ? availableRooms : roomTypes}
              slug={slug}
              hotelCurrency={currency}
              priceMap={priceMap}
              availMap={availMap}
              restrictionMap={restrictionMap}
              checkIn={check_in}
              checkOut={check_out}
              datesSelected={datesSelected}
              adults={adults}
              childGuests={children}
              roomsParam={rooms}
            />

            {datesSelected && unavailableRooms.length > 0 && (
              <section aria-labelledby="sold-out-heading">
                <div className="flex items-center gap-3 mb-5">
                  <h2
                    id="sold-out-heading"
                    className="text-sm font-semibold text-[var(--bk-muted)]"
                  >
                    Unavailable for these dates
                  </h2>
                  <div className="flex-1 h-px bg-[var(--bk-line)]" />
                </div>
                <RoomGrid
                  rooms={unavailableRooms}
                  slug={slug}
                  hotelCurrency={currency}
                  priceMap={priceMap}
                  availMap={availMap}
                  restrictionMap={restrictionMap}
                  checkIn={check_in}
                  checkOut={check_out}
                  datesSelected={datesSelected}
                  adults={adults}
                  childGuests={children}
                  roomsParam={rooms}
                />
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
