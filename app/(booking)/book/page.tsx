import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { BookingWizard } from "./_booking-wizard";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  room_type_id?: string;
  check_in?: string;
  check_out?: string;
}>;

export default async function BookPage({ searchParams }: { searchParams: SearchParams }) {
  const { room_type_id, check_in, check_out } = await searchParams;
  const h = await headers();
  const slug = h.get("x-hotel-slug") ?? "";

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, slug, currency, check_in_time, check_out_time, cancellation_policy, settings, paystack_subaccount_code")
    .or(`slug.eq.${slug},custom_domain.eq.${slug}`)
    .eq("status", "active")
    .single();
  if (!hotel) notFound();

  const { data: roomTypes } = await supabaseAdmin
    .from("room_types")
    .select("id, name, base_price, weekend_price, images, amenities, max_adults, max_children, short_description, bed_configuration, sort_order")
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const settings = (hotel.settings as Record<string, unknown>) ?? {};
  const paymentPolicy = (settings.payment_policy as string) ?? "choice";
  const hasPaystack = !!hotel.paystack_subaccount_code;

  // If pay_now_only but no paystack → treat as choice
  const effectivePolicy = (paymentPolicy === "pay_now_only" && !hasPaystack) ? "choice" : paymentPolicy;

  return (
    <BookingWizard
      slug={slug}
      hotel={{
        name: hotel.name,
        currency: hotel.currency ?? "GHS",
        checkInTime: hotel.check_in_time,
        checkOutTime: hotel.check_out_time,
        cancellationPolicy: hotel.cancellation_policy,
        paymentPolicy: effectivePolicy,
        hasPaystack,
      }}
      roomTypes={(roomTypes ?? []).map((rt) => ({
        id: rt.id,
        name: rt.name,
        basePrice: rt.base_price,
        weekendPrice: rt.weekend_price,
        shortDescription: rt.short_description,
        bedConfiguration: rt.bed_configuration,
        maxAdults: rt.max_adults ?? 2,
        maxChildren: rt.max_children ?? 0,
        images: (Array.isArray(rt.images) ? rt.images : []) as { url: string; caption: string; order: number }[],
        amenities: (Array.isArray(rt.amenities) ? rt.amenities : []) as { icon: string; label: string }[],
      }))}
      initialRoomTypeId={room_type_id ?? null}
      initialCheckIn={check_in ?? null}
      initialCheckOut={check_out ?? null}
    />
  );
}
