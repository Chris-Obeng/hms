import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; reference: string }> }
) {
  const { slug, reference } = await params;

  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, address, phone, check_in_time, check_out_time")
    .or(`slug.eq.${slug},custom_domain.eq.${slug}`)
    .single();
  if (!hotel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id, reference, status, payment_status, check_in, check_out, nights, total_amount, currency, guests(full_name, email, phone), room_types(name)")
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .single();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

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
      guestName: (booking.guests as any)?.full_name ?? null,
      guestEmail: (booking.guests as any)?.email ?? null,
      roomType: (booking.room_types as any)?.name ?? null,
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
