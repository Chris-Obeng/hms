import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack";
import { z } from "zod";
import { resolvePublicNightlyTotal } from "@/lib/pricing/resolve-public-price";
import { rateLimit } from "@/lib/rate-limit";

const Schema = z.object({
  room_type_id: z.string().uuid(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
  rooms_count: z.coerce.number().int().min(1).max(10).default(1),
  guest_name: z.string().min(1).max(120),
  guest_email: z.string().email(),
  guest_phone: z.string().min(7).max(20),
  nationality: z.string().max(80).optional(),
  payment_preference: z.enum(["pay_now", "pay_at_checkin"]),
  special_requests: z.string().max(500).optional(),
  estimated_arrival: z.string().max(50).optional(),
});

/**
 * POST /api/booking/[slug]/bookings
 *
 * Guest-facing booking creation.
 *
 * Payment-policy semantics:
 * - pay_at_checkin → booking is created `confirmed`; staff are notified and a
 *   confirmation email is sent immediately.
 * - pay_now        → booking is created as a PAYMENT HOLD (`pending` + unpaid).
 *   The hotel dashboard intentionally does not treat it as a booking until the
 *   Paystack webhook/verify records the payment (recordOnlinePayment), which
 *   then confirms it, notifies staff, emails the guest — or expires it after
 *   30 minutes via expire_stale_payment_holds() if the guest abandons checkout.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Public, unauthenticated endpoint — throttle booking creation so scripted
    // abuse cannot flood inventory or exhaust downstream Paystack quota.
    const rl = await rateLimit(req, { name: "booking-create", limit: 5, windowSeconds: 10 * 60 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many booking attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const { slug } = await params;

    if (!/^[a-z0-9.-]+$/i.test(slug)) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    let hotelQuery = await supabaseAdmin
      .from("hotels")
      .select("id, clerk_org_id, name, currency, paystack_subaccount_code, settings, check_in_time, check_out_time, cancellation_policy, phone, address")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();

    if (!hotelQuery.data) {
      hotelQuery = await supabaseAdmin
        .from("hotels")
        .select("id, clerk_org_id, name, currency, paystack_subaccount_code, settings, check_in_time, check_out_time, cancellation_policy, phone, address")
        .eq("custom_domain", slug)
        .eq("status", "active")
        .maybeSingle();
    }

    const hotel = hotelQuery.data;
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

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

    if (data.check_out <= data.check_in) {
      return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });
    }

    const { data: roomType } = await supabaseAdmin
      .from("room_types")
      .select("id, name, base_price, weekend_price")
      .eq("id", data.room_type_id)
      .eq("hotel_id", hotel.id)
      .eq("is_active", true)
      .single();
    if (!roomType) return NextResponse.json({ error: "Room type not available." }, { status: 400 });

    // Availability gate — must cover the requested room quantity.
    const { data: availCount } = await supabaseAdmin.rpc("room_type_available_count", {
      p_room_type_id: data.room_type_id,
      p_check_in: data.check_in,
      p_check_out: data.check_out,
    });
    if (((availCount as number) ?? 0) < data.rooms_count) {
      return NextResponse.json(
        { error: data.rooms_count > 1 ? `Only ${availCount ?? 0} room(s) left for these dates.` : "No rooms available for these dates." },
        { status: 409 }
      );
    }

    const checkInDate = new Date(data.check_in);
    const checkOutDate = new Date(data.check_out);
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / 86400000
    );
    const { subtotal: unitSubtotal, avgNightlyRate: rate } = await resolvePublicNightlyTotal(
      hotel.id,
      data.room_type_id,
      data.check_in,
      data.check_out
    );

    // Totals scale with quantity; tax follows hotel settings exactly like the
    // dashboard booking flow.
    const subtotal = Math.round(unitSubtotal * data.rooms_count * 100) / 100;
    const settings = (hotel.settings as Record<string, unknown>) ?? {};
    const taxEnabled = settings.tax_enabled === true;
    const taxPercentage = typeof settings.tax_percentage === "number"
      ? (settings.tax_percentage as number)
      : 0;
    const taxAmount = taxEnabled ? Math.round(subtotal * (taxPercentage / 100) * 100) / 100 : 0;
    const total = subtotal + taxAmount;

    // Find or create guest with nationality support
    let guestId: string;
    const { data: existingGuest } = await supabaseAdmin
      .from("guests")
      .select("id")
      .eq("hotel_id", hotel.id)
      .eq("email", data.guest_email)
      .maybeSingle();

    if (existingGuest) {
      guestId = existingGuest.id;
      if (data.nationality) {
        await supabaseAdmin
          .from("guests")
          .update({ nationality: data.nationality })
          .eq("id", guestId);
      }
    } else {
      const { data: newGuest, error: guestErr } = await supabaseAdmin
        .from("guests")
        .insert({
          hotel_id: hotel.id,
          full_name: data.guest_name,
          email: data.guest_email,
          phone: data.guest_phone,
          nationality: data.nationality || null,
        })
        .select("id")
        .single();
      if (guestErr || !newGuest) {
        console.error("Guest error:", guestErr);
        return NextResponse.json({ error: "Failed to create guest record." }, { status: 500 });
      }
      guestId = newGuest.id;
    }

    const slugPrefix = slug
      .split("-")
      .map((word: string) => word[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 3) || "BK";

    const { data: refData, error: refErr } = await supabaseAdmin.rpc(
      "generate_booking_reference",
      { p_hotel_id: hotel.id, p_prefix: slugPrefix }
    );
    if (refErr || !refData) {
      console.error("Ref error:", refErr);
      return NextResponse.json({ error: "Failed to generate booking reference." }, { status: 500 });
    }
    const reference = typeof refData === "string" ? refData : `${slugPrefix}-${Date.now()}`;

    // pay_now bookings start life as an unpaid payment hold — NOT a booking on
    // the hotel's books. recordOnlinePayment flips them to confirmed + notifies
    // staff once Paystack captures the money; pg_cron expires abandoned holds.
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
        adults: data.adults,
        children: data.children,
        rooms_count: data.rooms_count,
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
      if ((bookingErr as { code?: string } | null)?.code === "23P01") {
        return NextResponse.json({ error: "No rooms available for these dates." }, { status: 409 });
      }
      console.error("Booking error:", bookingErr);
      return NextResponse.json({ error: "Failed to create booking." }, { status: 500 });
    }

    if (data.payment_preference === "pay_at_checkin") {
      // Confirmed reservation — notify staff and email the guest right away.
      const { notifyStaffNewBooking } = await import("@/lib/bookings/confirm-online-payment");
      await notifyStaffNewBooking(hotel.id, booking.id);

      const { sendBookingConfirmation } = await import(
        "@/lib/notifications/send-booking-confirmation"
      );
      const result = await sendBookingConfirmation({
        hotelId: hotel.id,
        bookingId: booking.id,
        config: {
          hotelName: hotel.name,
          currency: hotel.currency ?? "GHS",
        },
        booking: {
          guestName: data.guest_name,
          guestEmail: data.guest_email,
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
        console.error("[booking/create] Notification send failed", {
          bookingId: booking.id,
          channel: result.channel,
          error: result.error,
        });
      }

      return NextResponse.json({
        bookingId: booking.id,
        reference: booking.reference,
        roomsCount: data.rooms_count,
      });
    }

    // ── pay_now: hand off to Paystack ────────────────────────────
    // Derive the callback from the request URL, never from the client-supplied
    // Origin header — Paystack would otherwise redirect guests to any host.
    const callbackUrl = `${req.nextUrl.origin}/${slug}/book/confirmation?bref=${booking.reference}`;
    const payRef = `${booking.reference}-${Date.now()}`;

    const txn = await initializeTransaction({
      email: data.guest_email,
      amount: Math.round(total * 100),
      currency: hotel.currency ?? "GHS",
      reference: payRef,
      callback_url: callbackUrl,
      subaccount: hotel.paystack_subaccount_code!,
      metadata: { booking_id: booking.id, hotel_id: hotel.id, booking_reference: booking.reference },
    });

    // Remember every reference handed to Paystack so the reconciliation sweep
    // can verify a payment even if the guest never returns and the webhook is
    // delayed past hold expiry.
    await supabaseAdmin
      .from("bookings")
      .update({ initiated_payment_refs: [payRef] })
      .eq("id", booking.id);

    return NextResponse.json({
      bookingId: booking.id,
      reference: booking.reference,
      roomsCount: data.rooms_count,
      paymentRequired: true,
      authorizationUrl: txn.authorization_url,
      paymentReference: payRef,
    });
  } catch (err) {
    console.error("[booking/create]", err);
    return NextResponse.json({ error: "Unexpected error. Please try again." }, { status: 500 });
  }
}
