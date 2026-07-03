import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; reference: string }> }
) {
  const { slug, reference } = await params;

  // Validate inputs before any DB query
  if (!/^[a-z0-9.-]{1,253}$/i.test(slug)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!/^[A-Z0-9-]{3,30}$/.test(reference)) {
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

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, reference, status, payment_status, check_in, check_out, nights, total_amount, currency, guests(full_name, email, phone), room_types(name)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .single();

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

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
