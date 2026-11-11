import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { businessToday } from "@/lib/business-date";
import { resolvePublicRoomPrices } from "@/lib/pricing/resolve-public-price";
import {
  fetchStayRestrictions,
  type RoomTypeStayRestrictions,
} from "@/lib/bookings/stay-restrictions";
import {
  captureError,
  captureSupabaseError,
} from "@/lib/observability/sentry";
import { validateStayRange } from "@/lib/validation/params";
import { getPublicHotel } from "./_lib/get-public-hotel";
import {
  BookingWizard,
  type ResolvedRoomQuote,
} from "./_components/booking-wizard";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    room_type_id?: SearchParamValue;
    check_in?: SearchParamValue;
    check_out?: SearchParamValue;
    adults?: SearchParamValue;
    children?: SearchParamValue;
    rooms?: SearchParamValue;
  }>;
};

function scalar(v: SearchParamValue): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  max: number
) {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.max(n, 0), max);
}

function addCalendarDay(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default async function HotelBookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const hotel = await getPublicHotel(slug);
  if (!hotel || hotel.status !== "active") notFound();

  const hotelToday = businessToday(hotel.timezone ?? "UTC");
  const hotelTomorrow = addCalendarDay(hotelToday, 1);

  const rawCheckIn = scalar(sp.check_in);
  const rawCheckOut = scalar(sp.check_out);
  const validParamRange =
    rawCheckIn !== undefined &&
    rawCheckOut !== undefined &&
    rawCheckIn >= hotelToday &&
    validateStayRange(rawCheckIn, rawCheckOut).ok;

  const effectiveCheckIn = validParamRange ? rawCheckIn : hotelToday;
  const effectiveCheckOut = validParamRange ? rawCheckOut : hotelTomorrow;

  const { data: roomTypes, error: roomTypesErr } = await supabaseAdmin
    .from("room_types")
    .select(
      "id,name,base_price,weekend_price,images,amenities,max_adults,max_children,short_description,description,bed_configuration,sort_order"
    )
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (roomTypesErr) {
    captureSupabaseError(roomTypesErr, "room_types.select.booking_page", {
      scope: "booking-funnel",
      step: "search",
      level: "error",
      hotelId: hotel.id,
      tags: { "hotel.slug": hotel.slug },
    });
  }

  const roomTypeIds = (roomTypes ?? []).map((rt) => rt.id);

  // Pre-resolve initial stay quotes in parallel during SSR so the guest meets
  // live rates, availability counts, and stay restrictions on first paint with
  // zero client-side waterfall. Falls back to null if pricing/count fails so
  // the client wizard retries cleanly via /api/booking/[slug]/availability.
  let initialResolvedPrices: Record<string, ResolvedRoomQuote> | null = {};
  if (roomTypeIds.length > 0) {
    try {
      const [availability, resolvedPrices, restrictions] = await Promise.all([
        supabaseAdmin.rpc("room_type_available_counts", {
          p_room_type_ids: roomTypeIds,
          p_from: effectiveCheckIn,
          p_to: effectiveCheckOut,
        }),
        resolvePublicRoomPrices(
          hotel.id,
          roomTypeIds,
          effectiveCheckIn,
          effectiveCheckOut
        ),
        fetchStayRestrictions(
          hotel.id,
          roomTypeIds,
          effectiveCheckIn,
          effectiveCheckOut
        ).catch((error: unknown) => {
          captureError(error, {
            scope: "booking-funnel",
            step: "search",
            level: "warning",
            hotelId: hotel.id,
            tags: {
              "hotel.slug": hotel.slug,
              read: "room_type_stay_restrictions",
            },
            contexts: {
              stay: { check_in: effectiveCheckIn, check_out: effectiveCheckOut },
            },
          });
          return new Map<string, RoomTypeStayRestrictions>();
        }),
      ]);

      if (availability.error) {
        captureSupabaseError(
          availability.error,
          "rpc.room_type_available_counts",
          {
            scope: "booking-funnel",
            step: "search",
            level: "error",
            hotelId: hotel.id,
            tags: { "hotel.slug": hotel.slug },
            contexts: {
              availability: {
                total_room_types: roomTypeIds.length,
                check_in: effectiveCheckIn,
                check_out: effectiveCheckOut,
              },
            },
          }
        );
        initialResolvedPrices = null;
      } else {
        const availMap = new Map(
          (availability.data ?? []).map((row) => [
            row.room_type_id,
            row.available,
          ])
        );
        const priceMap = new Map(
          resolvedPrices.map((p) => [p.roomTypeId, p])
        );
        const map: Record<string, ResolvedRoomQuote> = {};
        for (const rt of roomTypes ?? []) {
          const resolved = priceMap.get(rt.id);
          const restriction = restrictions.get(rt.id);
          map[rt.id] = {
            displayPrice: resolved?.displayPrice ?? rt.base_price,
            subtotal: resolved?.subtotal ?? null,
            nights:
              resolved?.nights?.map((n) => ({
                date: n.date,
                price: n.price,
              })) ?? [],
            availableCount: availMap.get(rt.id) ?? 0,
            restrictionReason: restriction?.reason ?? null,
          };
        }
        initialResolvedPrices = map;
      }
    } catch (error) {
      captureError(error, {
        scope: "booking-funnel",
        step: "search",
        level: "error",
        hotelId: hotel.id,
        tags: { "hotel.slug": hotel.slug },
      });
      initialResolvedPrices = null;
    }
  }

  const settings = (hotel.settings as Record<string, unknown>) ?? {};
  const paymentPolicy = (settings.payment_policy as string) ?? "choice";
  const hasPaystack = !!hotel.paystack_subaccount_code;
  const effectivePolicy = !hasPaystack ? "pay_later_only" : paymentPolicy;

  return (
    <BookingWizard
      slug={slug}
      hotel={{
        name: hotel.name,
        logoUrl: hotel.logo_url,
        city: hotel.city,
        address: hotel.address,
        phone: hotel.phone,
        currency: hotel.currency ?? "GHS",
        checkInTime: hotel.check_in_time,
        checkOutTime: hotel.check_out_time,
        cancellationPolicy: hotel.cancellation_policy,
        paymentPolicy: effectivePolicy,
        hasPaystack,
        taxEnabled: settings.tax_enabled === true,
        taxPercentage:
          typeof settings.tax_percentage === "number"
            ? (settings.tax_percentage as number)
            : 0,
      }}
      roomTypes={(roomTypes ?? []).map((rt) => ({
        id: rt.id,
        name: rt.name,
        basePrice: rt.base_price,
        weekendPrice: rt.weekend_price,
        shortDescription: rt.short_description,
        description: rt.description,
        bedConfiguration: rt.bed_configuration,
        maxAdults: rt.max_adults ?? 2,
        maxChildren: rt.max_children ?? 0,
        images: (Array.isArray(rt.images) ? rt.images : []) as {
          url: string;
          caption: string;
          order: number;
        }[],
        amenities: (Array.isArray(rt.amenities) ? rt.amenities : []) as {
          icon: string;
          label: string;
        }[],
      }))}
      minDate={hotelToday}
      initialRoomTypeId={scalar(sp.room_type_id) ?? null}
      initialCheckIn={effectiveCheckIn}
      initialCheckOut={effectiveCheckOut}
      initialResolvedPrices={initialResolvedPrices}
      initialAdults={Math.max(1, parsePositiveInt(scalar(sp.adults), 1, 10))}
      initialChildren={parsePositiveInt(scalar(sp.children), 0, 10)}
      initialRooms={Math.max(1, parsePositiveInt(scalar(sp.rooms), 1, 5))}
    />
  );
}
