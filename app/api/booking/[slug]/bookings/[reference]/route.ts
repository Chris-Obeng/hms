import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { captureSupabaseError, flushSentry } from "@/lib/observability/sentry";
import { bookingReferenceParam, hotelSlugParam } from "@/lib/validation/params";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; reference: string }> }
) {
  // Guest PII lookup gated only by booking reference — throttle enumeration.
  const rl = await rateLimit(req, { name: "booking-lookup", limit: 20, windowSeconds: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { slug, reference } = await params;

  // Validate inputs before any DB query
  if (!hotelSlugParam.safeParse(slug).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!bookingReferenceParam.safeParse(reference).success) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Resolve hotel — separate eq() calls, never .or() with interpolated slug.
  let hotelQuery = await supabaseAdmin
    .from("hotels")
    .select("id, name, address, phone, check_in_time, check_out_time")
    .eq("slug", slug)
    .maybeSingle();

  if (!hotelQuery.data) {
    hotelQuery = await supabaseAdmin
      .from("hotels")
      .select("id, name, address, phone, check_in_time, check_out_time")
      .eq("custom_domain", slug)
      .maybeSingle();
  }

  const hotel = hotelQuery.data;
  if (!hotel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, status, payment_status, check_in, check_out, nights, total_amount, currency, guests(full_name, email, phone), room_types(name)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .single();

  if (!booking) {
    // PGRST116 is "no rows": either a typo or reference enumeration, both of which
    // the 404 handles and neither of which is worth an event. Any other code means
    // a guest with a valid reference is being told their booking does not exist.
    if (bookingErr && bookingErr.code !== "PGRST116") {
      captureSupabaseError(bookingErr, "bookings.select.guest_lookup", {
        scope: "booking-funnel",
        step: "confirm",
        level: "error",
        hotelId: hotel.id,
        reference,
        tags: { "hotel.slug": slug },
      });
      await flushSentry();
    }
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Type-narrow the nested relations returned by Supabase
  const guest = booking.guests as { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  const roomType = booking.room_types as { name?: string | null } | null;

  return NextResponse.json({
    booking: {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      paymentStatus: booking.payment_status,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      nights: booking.nights,
      totalAmount: booking.total_amount,
      currency: booking.currency,
      guestName: guest?.full_name ?? null,
      guestEmail: guest?.email ?? null,
      roomType: roomType?.name ?? null,
    },
    hotel: {
      name: hotel.name,
      address: hotel.address,
      phone: hotel.phone,
      checkInTime: hotel.check_in_time,
      checkOutTime: hotel.check_out_time,
    },
  });
}
