import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const reference = req.nextUrl.searchParams.get("reference");

  if (!reference) {
    return new NextResponse("Missing reference", { status: 400 });
  }

  // Resolve hotel — use separate eq() calls (never .or() with interpolated slug).
  if (!/^[a-z0-9.-]{1,253}$/i.test(slug)) {
    return new NextResponse("Hotel not found", { status: 404 });
  }

  let hotelQuery = await supabaseAdmin
    .from("hotels")
    .select("id, name, address, city, phone, check_in_time, check_out_time")
    .eq("slug", slug)
    .maybeSingle();

  if (!hotelQuery.data) {
    hotelQuery = await supabaseAdmin
      .from("hotels")
      .select("id, name, address, city, phone, check_in_time, check_out_time")
      .eq("custom_domain", slug)
      .maybeSingle();
  }

  const hotel = hotelQuery.data;

  if (!hotel) return new NextResponse("Hotel not found", { status: 404 });

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "reference, check_in, check_out, nights, guests(full_name, email), room_types(name)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .single();

  if (!booking) return new NextResponse("Booking not found", { status: 404 });

  const guestName =
    (booking.guests as { full_name?: string | null } | null)?.full_name ?? "Guest";
  const roomName =
    (booking.room_types as { name?: string | null } | null)?.name ?? "Room";

  // Parse dates — check_in/check_out are yyyy-MM-dd
  const checkInDate = booking.check_in.replace(/-/g, "");
  const checkOutDate = booking.check_out.replace(/-/g, "");

  // Use hotel check-in/out times or default to 14:00 / 11:00
  const checkInTime = (hotel.check_in_time ?? "14:00").replace(":", "") + "00";
  const checkOutTime = (hotel.check_out_time ?? "11:00").replace(":", "") + "00";

  const dtStart = `${checkInDate}T${checkInTime}`;
  const dtEnd = `${checkOutDate}T${checkOutTime}`;
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");
  const uid = `${reference}@hotelosprp.com`;

  const location = [hotel.name, hotel.address, hotel.city]
    .filter(Boolean)
    .join(", ");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HotelOS Pro//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}Z`,
    // Use a fixed IANA zone (or a hotel.timezone column). Ghana is UTC+0.
    `DTSTART;TZID=Africa/Accra:${dtStart}`,
    `DTEND;TZID=Africa/Accra:${dtEnd}`,
    `SUMMARY:Stay at ${hotel.name} — ${roomName}`,
    `DESCRIPTION:Booking Reference: ${reference}\\nGuest: ${guestName}\\nRoom: ${roomName}\\nCheck-in: ${booking.check_in}\\nCheck-out: ${booking.check_out}`,
    `LOCATION:${location}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${reference}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
