import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { captureSupabaseError, flushSentry } from "@/lib/observability/sentry";
import { bookingReferenceParam, hotelSlugParam } from "@/lib/validation/params";
import { GUEST_ACCESS_QUERY_PARAM, resolveGuestAccess } from "@/lib/bookings/guest-access";

/**
 * GET /api/booking/[slug]/calendar?reference=<booking reference>&t=<access token>
 *
 * Calendar (.ics) file for a guest's stay. Current-format references need the
 * guest access token (lib/bookings/guest-access.ts); legacy references without
 * one get the file without the guest's name.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const rl = await rateLimit(req, { name: "booking-ics", limit: 10, windowSeconds: 60 });
  if (!rl.ok) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const { slug } = await params;
  // Validate before the value reaches the ICS body and the Content-Disposition
  // header — unvalidated input there allows header/calendar content injection.
  // The parsed value is used from here on, so a missing param cannot reach the
  // query as `null`.
  const parsedReference = bookingReferenceParam.safeParse(
    req.nextUrl.searchParams.get("reference"),
  );

  if (!parsedReference.success) {
    return new NextResponse("Missing reference", { status: 400 });
  }

  const reference = parsedReference.data;

  // Resolve hotel — use separate eq() calls (never .or() with interpolated slug).
  if (!hotelSlugParam.safeParse(slug).success) {
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

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, group_id, reference, check_in, check_out, nights, guests(full_name), room_types(name)"
    )
    .eq("hotel_id", hotel.id)
    .eq("reference", reference)
    .single();

  if (!booking) {
    // PGRST116 is "no rows": a stale link or a mistyped reference, which the 404
    // already answers. Any other code means a guest holding a real booking cannot
    // add their stay to their calendar. The guest's name is deliberately not sent.
    if (bookingErr && bookingErr.code !== "PGRST116") {
      captureSupabaseError(bookingErr, "bookings.select.calendar", {
        scope: "booking-funnel",
        step: "confirm",
        level: "error",
        hotelId: hotel.id,
        reference,
        tags: { "hotel.slug": slug },
      });
      await flushSentry();
    }
    return new NextResponse("Booking not found", { status: 404 });
  }

  const access = resolveGuestAccess(
    hotel.id,
    booking,
    req.nextUrl.searchParams.get(GUEST_ACCESS_QUERY_PARAM)
  );
  // Same answer as an unknown reference, so a guess cannot learn that it hit.
  if (access === "denied") {
    return new NextResponse("Booking not found", { status: 404 });
  }

  const guestName =
    access === "full"
      ? ((booking.guests as { full_name?: string | null } | null)?.full_name ?? "Guest")
      : "Guest";
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
  const uid = `${reference}@RoomLineprp.com`;

  const location = [hotel.name, hotel.address, hotel.city]
    .filter(Boolean)
    .join(", ");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Oriel//EN",
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
