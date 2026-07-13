import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack";
import { z } from "zod";
import { resolvePublicNightlyTotal } from "@/lib/pricing/resolve-public-price";

const Schema = z.object({
  room_type_id: z.string().uuid(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
  guest_name: z.string().min(1).max(120),
  guest_email: z.string().email(),
  guest_phone: z.string().min(7).max(20),
  payment_preference: z.enum(["pay_now", "pay_at_checkin"]),
  special_requests: z.string().max(500).optional(),
  estimated_arrival: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Reject anything that isn't a safe slug/domain before querying
    if (!/^[a-z0-9.-]+$/i.test(slug)) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    // Resolve hotel — use separate eq() calls, never .or() with interpolated slug.
    // PostgREST .or("slug.eq.${slug},...") is vulnerable to filter injection:
    // a slug like "foo,status.eq.suspended" becomes two distinct filter clauses.
    let hotelQuery = await supabaseAdmin
      .from("hotels")
      .select("id, name, currency, paystack_subaccount_code, settings, check_in_time, check_out_time, cancellation_policy, phone, address, beds24_api_key, beds24_property_id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();

    if (!hotelQuery.data) {
      hotelQuery = await supabaseAdmin
        .from("hotels")
        .select("id, name, currency, paystack_subaccount_code, settings, check_in_time, check_out_time, cancellation_policy, phone, address, beds24_api_key, beds24_property_id")
        .eq("custom_domain", slug)
        .eq("status", "active")
        .maybeSingle();
    }

    const hotel = hotelQuery.data;
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    // Enforce payment policy
    const policy = ((hotel.settings as Record<string, unknown>)?.payment_policy as string) ?? "choice";
    if (policy === "pay_now_only" && data.payment_preference === "pay_at_checkin") {
      return NextResponse.json({ error: "This hotel requires payment to confirm your booking." }, { status: 400 });
    }
    if (policy === "pay_later_only" && data.payment_preference === "pay_now") {
      return NextResponse.json({ error: "This hotel collects payment at check-in." }, { status: 400 });
    }
    if (data.payment_preference === "pay_now" && !hotel.paystack_subaccount_code) {
      return NextResponse.json({ error: "Online payment is not available for this hotel." }, { status: 400 });
    }

    // Validate dates
    if (data.check_out <= data.check_in) {
      return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });
    }

    // Check room type exists and is active
    const { data: roomType } = await supabaseAdmin
      .from("room_types")
      .select("id, name, base_price, weekend_price")
      .eq("id", data.room_type_id)
      .eq("hotel_id", hotel.id)
      .eq("is_active", true)
      .single();
    if (!roomType) return NextResponse.json({ error: "Room type not available." }, { status: 400 });

    // Re-check availability (fast-path; DB exclusion constraint is the final guard)
    const { data: availCount } = await supabaseAdmin.rpc("room_type_available_count", {
      p_room_type_id: data.room_type_id,
      p_check_in: data.check_in,
      p_check_out: data.check_out,
    });
    if (((availCount as number) ?? 0) < 1) {
      return NextResponse.json({ error: "No rooms available for these dates." }, { status: 409 });
    }

    // Calculate pricing using override-aware resolver
    // (daily_rate_overrides > seasonal_rate_overrides > base/weekend price)
    const checkInDate = new Date(data.check_in);
    const checkOutDate = new Date(data.check_out);
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / 86400000
    );
    const { subtotal, avgNightlyRate: rate } = await resolvePublicNightlyTotal(
      hotel.id,
      data.room_type_id,
      data.check_in,
      data.check_out
    );
    const taxEnabled = (hotel.settings as Record<string, unknown>)?.tax_enabled === true;
    const taxPercentage = typeof (hotel.settings as Record<string, unknown>)?.tax_percentage === "number"
      ? ((hotel.settings as Record<string, unknown>).tax_percentage as number)
      : 0;
    const taxAmount = taxEnabled ? Math.round(subtotal * (taxPercentage / 100) * 100) / 100 : 0;
    const total = subtotal + taxAmount;

    // Find or create guest
    let guestId: string;
    const { data: existingGuest } = await supabaseAdmin
      .from("guests")
      .select("id")
      .eq("hotel_id", hotel.id)
      .eq("email", data.guest_email)
      .maybeSingle();

    if (existingGuest) {
      guestId = existingGuest.id;
    } else {
      const { data: newGuest, error: guestErr } = await supabaseAdmin
        .from("guests")
        .insert({ hotel_id: hotel.id, full_name: data.guest_name, email: data.guest_email, phone: data.guest_phone })
        .select("id")
        .single();
      if (guestErr || !newGuest) {
        console.error("Guest error:", guestErr);
        return NextResponse.json({ error: "Failed to create guest record." }, { status: 500 });
      }
      guestId = newGuest.id;
    }

    // Derive a 2-3 char uppercase prefix from the hotel slug.
    // 'golden-palm' → 'GP', 'sunrise-hotel' → 'SH', 'accra-grand-hotel' → 'AGH' (capped at 3)
    const slugPrefix = slug
      .split("-")
      .map((word: string) => word[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 3) || "BK";

    // Generate booking reference atomically (race-safe DB counter)
    const { data: refData, error: refErr } = await supabaseAdmin.rpc(
      "generate_booking_reference",
      { p_hotel_id: hotel.id, p_prefix: slugPrefix }
    );
    if (refErr || !refData) {
      console.error("Ref error:", refErr);
      return NextResponse.json({ error: "Failed to generate booking reference." }, { status: 500 });
    }
    const reference = typeof refData === "string" ? refData : `${slugPrefix}-${Date.now()}`;

    // For pay_now: booking starts as pending until payment confirmed
    const status = data.payment_preference === "pay_now" ? "pending" : "confirmed";
    const paymentStatus = "unpaid";

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        hotel_id: hotel.id,
        reference,
        guest_id: guestId,
        room_type_id: data.room_type_id,
        check_in: data.check_in,
        check_out: data.check_out,
        // `nights` is GENERATED ALWAYS AS (check_out - check_in) STORED — never insert explicitly
        adults: data.adults,
        children: data.children,
        room_rate: rate,
        subtotal,
        tax_amount: taxAmount,
        total_amount: total,
        amount_paid: 0,
        currency: hotel.currency ?? "GHS",
        status,
        payment_status: paymentStatus,
        payment_preference: data.payment_preference,
        source: "direct",
        special_requests: data.special_requests || null,
        estimated_arrival: data.estimated_arrival || null,
      })
      .select("id, reference")
      .single();

    if (bookingErr || !booking) {
      // Postgres exclusion-constraint violation (23P01) means a concurrent booking
      // grabbed the last room between our availability check and this insert.
      if ((bookingErr as { code?: string } | null)?.code === "23P01") {
        return NextResponse.json({ error: "No rooms available for these dates." }, { status: 409 });
      }
      console.error("Booking error:", bookingErr);
      return NextResponse.json({ error: "Failed to create booking." }, { status: 500 });
    }

    // Insert admin notification
    await supabaseAdmin.from("notifications").insert({
      hotel_id: hotel.id,
      type: "new_booking",
      title: "New Booking",
      message: `${data.guest_name} · ${roomType.name} · ${data.check_in} → ${data.check_out}`,
      booking_id: booking.id,
      is_read: false,
    });

    // Beds24 outbound availability push (Growth/Pro plans with Beds24 configured)
    if (hotel.beds24_api_key && hotel.beds24_property_id) {
      const { pushAvailability, bookingToAvailabilityRange } = await import("@/lib/beds24");
      // Find Beds24 room mapping for this room type
      const { data: mapping } = await supabaseAdmin
        .from("beds24_property_mappings")
        .select("beds24_room_id")
        .eq("hotel_id", hotel.id)
        .eq("room_type_id", data.room_type_id)
        .maybeSingle();

      if (mapping?.beds24_room_id) {
        const { from, to } = bookingToAvailabilityRange(data.check_in, data.check_out);
        await pushAvailability(
          { token: hotel.beds24_api_key },
          [{ roomId: mapping.beds24_room_id, from, to, availability: 0 }]
        ).catch((e: unknown) => console.error("[beds24:outbound]", e));
      }
    }

    // Pay Later: done — send booking confirmation (channel routed: GH SMS or Resend email)
    if (data.payment_preference === "pay_at_checkin") {
      const { sendBookingConfirmation } = await import(
        "@/lib/notifications/send-booking-confirmation"
      );
      const hotelSettings = (hotel.settings as Record<string, unknown>) ?? {};
      const result = await sendBookingConfirmation({
        hotelId: hotel.id,
        bookingId: booking.id,
        config: {
          hotelName: hotel.name,
          currency: hotel.currency ?? "GHS",
          notificationsEnabled: hotelSettings.sms_notifications_enabled !== false,
        },
        booking: {
          guestName: data.guest_name,
          guestEmail: data.guest_email,
          guestPhone: data.guest_phone,
          reference: booking.reference,
          roomName: roomType.name,
          checkIn: data.check_in,
          checkOut: data.check_out,
          nights,
          totalAmount: total,
          checkInTime: hotel.check_in_time ?? null,
          checkOutTime: hotel.check_out_time ?? null,
          hotelPhone: hotel.phone ?? null,
          hotelAddress: hotel.address ?? null,
        },
      });

      if (!result.success) {
        // Log failure but do not block the booking response — the booking
        // itself succeeded. The notification_logs table records the failure.
        console.error("[booking/create] Notification send failed", {
          bookingId: booking.id,
          channel: result.channel,
          error: result.error,
        });
      }

      return NextResponse.json({ bookingId: booking.id, reference: booking.reference });
    }

    // Pay Now: initialize Paystack transaction
    const origin = req.headers.get("origin") ?? req.nextUrl.origin;
    // Use 'bref' (booking reference) — NOT 'reference', because Paystack appends
    // its own '?reference=<payRef>&trxref=<payRef>' to the callback URL.
    // Two 'reference' params would make Next.js give searchParams.reference an
    // array, breaking the DB lookup on the confirmation page.
    const callbackUrl = `${origin}/${slug}/book/confirmation?bref=${booking.reference}`;
    const payRef = `${booking.reference}-${Date.now()}`;

    const txn = await initializeTransaction({
      email: data.guest_email,
      amount: Math.round(total * 100), // pesewas
      currency: hotel.currency ?? "GHS",
      reference: payRef,
      callback_url: callbackUrl,
      subaccount: hotel.paystack_subaccount_code!,
      metadata: { booking_id: booking.id, hotel_id: hotel.id, booking_reference: booking.reference },
    });

    return NextResponse.json({
      bookingId: booking.id,
      reference: booking.reference,
      paymentRequired: true,
      authorizationUrl: txn.authorization_url,
      paymentReference: payRef,
    });
  } catch (err) {
    console.error("[booking/create]", err);
    return NextResponse.json({ error: "Unexpected error. Please try again." }, { status: 500 });
  }
}
