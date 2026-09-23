import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack";
import { z } from "zod";
import {
  abortUnpaidBooking,
  createBookingAtomic,
  type BookingRejection,
} from "@/lib/bookings/create-booking-atomic";
import { rateLimit } from "@/lib/rate-limit";
import {
  captureError,
  captureIssue,
  captureSupabaseError,
  flushSentry,
  type BookingFunnelStep,
  type SupabaseErrorLike,
} from "@/lib/observability/sentry";
import {
  guestStayRestrictionMessage,
  parseStayRestrictions,
} from "@/lib/bookings/stay-restrictions";
import { guestEmail, hotelSlugParam, isoDateParam } from "@/lib/validation/params";

const Schema = z.object({
  room_type_id: z.string().uuid(),
  check_in: isoDateParam,
  check_out: isoDateParam,
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
  rooms_count: z.coerce.number().int().min(1).max(10).default(1),
  guest_name: z.string().min(1).max(120),
  guest_email: guestEmail,
  guest_phone: z.string().min(7).max(20),
  nationality: z.string().max(80).optional(),
  payment_preference: z.enum(["pay_now", "pay_at_checkin"]),
  special_requests: z.string().max(500).optional(),
  estimated_arrival: z.string().max(50).optional(),
});

/** What the reporter needs to describe a stay that could not be written. */
type RejectionContext = {
  hotelId: string;
  slug: string;
  step: BookingFunnelStep;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  roomsCount: number;
};

/**
 * Turns a `create_booking_atomic` rejection into the response the guest sees.
 *
 * Classification is by machine code, never by message text, so the SQL stays
 * free to reword its own sentences. The function's messages are written for
 * staff and never reach a guest — this endpoint is unauthenticated.
 *
 * Guest-visible 4xx outcomes are the endpoint working and are not reported. Two
 * cases mean RoomLine is broken and are: `unpriced_stay`, where the hotel has
 * published dates it has no price for and so loses every booking in that range
 * behind a plausible "unavailable"; and anything unclassified — a missing grant,
 * a stale migration, a bug.
 */
function rejectionResponse(
  rejection: BookingRejection,
  ctx: RejectionContext
): NextResponse {
  const report = () => {
    // The default fingerprint is ["supabase", operation, sqlstate], which files
    // every P0001 — a full hotel, an unpriced night, a bad time string — under
    // one issue. Fingerprint on the machine code instead.
    captureSupabaseError(
      {
        message: rejection.message,
        code: rejection.sqlstate,
        details: rejection.code,
        hint: rejection.hint,
      } satisfies SupabaseErrorLike,
      "rpc.create_booking_atomic",
      {
        scope: "booking-funnel",
        step: ctx.step,
        level: "error",
        hotelId: ctx.hotelId,
        tags: { "hotel.slug": ctx.slug, "booking.rejection": rejection.code },
        contexts: {
          booking: {
            room_type_id: ctx.roomTypeId,
            check_in: ctx.checkIn,
            check_out: ctx.checkOut,
            rooms_count: ctx.roomsCount,
          },
        },
        fingerprint: ["booking-funnel", "create-booking-atomic", rejection.code],
      }
    );
  };
  switch (rejection.code) {
    // Two guests raced for the last room and the database picked a winner. Not
    // reported — this is the constraint doing its job, and on a busy hotel it
    // would be constant noise.
    case "inventory_conflict":
      return NextResponse.json(
        { error: "No rooms available for these dates." },
        { status: 409 }
      );

    // HINT carries how many rooms are actually free for the range.
    case "no_availability": {
      const free = Number(rejection.hint ?? "");
      return NextResponse.json(
        {
          error:
            ctx.roomsCount > 1 && Number.isFinite(free)
              ? `Only ${free} room(s) left for these dates.`
              : "No rooms available for these dates.",
        },
        { status: 409 }
      );
    }

    // The rate plan is closed for this window, or the stay is too short or too
    // long for it. Not reported: the restriction is a decision the hotel made,
    // and refusing the stay is the guard working as intended. HINT carries the
    // violations in severity order, so the first one is the sentence to show.
    case "stay_restrictions":
      return NextResponse.json(
        { error: guestStayRestrictionMessage(parseStayRestrictions(rejection.hint)) },
        { status: 409 }
      );

    case "invalid_date_range":
      return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });

    case "room_type_not_found":
    case "room_not_bookable":
      return NextResponse.json({ error: "Room type not available." }, { status: 400 });

    case "room_conflict":
      return NextResponse.json(
        { error: "That room is already occupied for these dates." },
        { status: 409 }
      );

    case "hotel_not_found":
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    // Reachable: Zod accepts any 50-character string for the arrival time.
    case "invalid_estimated_arrival":
      return NextResponse.json(
        { error: "Estimated arrival is not a valid time — try 14:30." },
        { status: 400 }
      );

    // Reachable: Zod's min(1) accepts a name that is only whitespace.
    case "invalid_guest_name":
      return NextResponse.json({ error: "Please enter your name." }, { status: 400 });

    case "invalid_rooms_count":
      return NextResponse.json({ error: "That number of rooms cannot be booked." }, { status: 400 });

    // Unreachable through the schema above: the wrapper omitted a required key.
    case "invalid_payload":
      report();
      return NextResponse.json({ error: "Invalid booking details." }, { status: 400 });

    case "unpriced_stay":
      report();
      return NextResponse.json(
        { error: "No rooms available for these dates." },
        { status: 409 }
      );

    default:
      report();
      return NextResponse.json({ error: "Failed to create booking." }, { status: 500 });
  }
}

/**
 * POST /api/booking/[slug]/bookings
 *
 * Guest-facing booking creation.
 *
 * The reservation itself is written by `create_booking_atomic` — one transaction
 * that resolves the guest, prices the stay, passes the inventory gate and writes
 * `bookings` and `booking_nights` together. This route owns only what must stay
 * outside a transaction: the hotel lookup, the payment-policy gates, the Paystack
 * network call and the guest-facing copy for each rejection.
 *
 * Payment-policy semantics:
 * - pay_at_checkin → booking is created `confirmed`; staff are notified and a
 *   confirmation email is sent immediately.
 * - pay_now        → booking is created as a PAYMENT HOLD (`pending` + unpaid).
 *   The hotel dashboard intentionally does not treat it as a booking until the
 *   Paystack webhook/verify records the payment (recordOnlinePayment), which
 *   then confirms it, notifies staff, emails the guest — or expires it after
 *   30 minutes via expire_stale_payment_holds() if the guest abandons checkout.
 *
 * Observability:
 * - Every failure is tagged with the funnel step it broke on (`hold`, `confirm`,
 *   `payment_init`), so a Sentry search answers "where do guests fall out of
 *   checkout" without reading logs.
 * - Guest identity is never sent. The request body carries a name, email and
 *   phone number; only the hotel id, booking id and reference travel.
 * - Guest-visible 4xx rejections (bad input, policy, no availability) are not
 *   captured — they are the endpoint working. Only failures RoomLine caused are.
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

    if (!hotelSlugParam.safeParse(slug).success) {
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

    const { data: roomType, error: roomTypeErr } = await supabaseAdmin
      .from("room_types")
      .select("id, name, base_price, weekend_price")
      .eq("id", data.room_type_id)
      .eq("hotel_id", hotel.id)
      .eq("is_active", true)
      .single();
    if (!roomType) {
      // PGRST116 is "no rows" — an inactive or foreign room type, which the 400
      // below reports correctly. Any other code means the lookup itself broke and
      // the guest is being turned away for the wrong reason.
      if (roomTypeErr && roomTypeErr.code !== "PGRST116") {
        captureSupabaseError(roomTypeErr, "room_types.select", {
          scope: "booking-funnel",
          step: "hold",
          hotelId: hotel.id,
          tags: { "hotel.slug": slug },
        });
      }
      return NextResponse.json({ error: "Room type not available." }, { status: 400 });
    }

    // pay_now bookings start life as an unpaid payment hold — NOT a booking on
    // the hotel's books. recordOnlinePayment flips them to confirmed + notifies
    // staff once Paystack captures the money; pg_cron expires abandoned holds.
    const status = data.payment_preference === "pay_now" ? "pending" : "confirmed";
    const funnelStep: BookingFunnelStep =
      data.payment_preference === "pay_now" ? "hold" : "confirm";

    // One transaction resolves the guest, generates the reference, prices every
    // night and passes the inventory gate, then writes `bookings` and
    // `booking_nights` together. The quote the guest is charged and the rates
    // stored against the stay are the same numbers by construction, and a
    // rejection leaves no orphan guest and no half-built reservation behind.
    const created = await createBookingAtomic({
      hotel_id: hotel.id,
      room_type_id: data.room_type_id,
      check_in: data.check_in,
      check_out: data.check_out,
      adults: data.adults,
      children: data.children,
      rooms_count: data.rooms_count,
      status,
      payment_status: "unpaid",
      payment_preference: data.payment_preference,
      source: "direct",
      guest_name: data.guest_name,
      guest_email: data.guest_email,
      guest_phone: data.guest_phone,
      nationality: data.nationality ?? null,
      special_requests: data.special_requests ?? null,
      estimated_arrival: data.estimated_arrival ?? null,
    });

    if (!created.ok) {
      return rejectionResponse(created.rejection, {
        hotelId: hotel.id,
        slug,
        step: funnelStep,
        roomTypeId: data.room_type_id,
        checkIn: data.check_in,
        checkOut: data.check_out,
        roomsCount: data.rooms_count,
      });
    }

    // Room assignment stays with staff: a public booking holds inventory of the
    // room type, not a numbered room.
    const booking = created.booking;

    if (data.payment_preference === "pay_at_checkin") {
      // Confirmed reservation — notify staff and email the guest right away.
      const { notifyStaffNewBooking } = await import("@/lib/bookings/confirm-online-payment");
      await notifyStaffNewBooking(hotel.id, booking.booking_id);

      const { sendBookingConfirmation } = await import(
        "@/lib/notifications/send-booking-confirmation"
      );
      const result = await sendBookingConfirmation({
        hotelId: hotel.id,
        bookingId: booking.booking_id,
        config: {
          hotelName: hotel.name,
          currency: booking.currency,
        },
        booking: {
          guestName: data.guest_name,
          guestEmail: data.guest_email,
          reference: booking.reference,
          roomName: roomType.name,
          checkIn: data.check_in,
          checkOut: data.check_out,
          nights: booking.night_count,
          totalAmount: booking.total_amount,
          checkInTime: hotel.check_in_time ?? null,
          checkOutTime: hotel.check_out_time ?? null,
          hotelPhone: hotel.phone ?? null,
          hotelAddress: hotel.address ?? null,
        },
      });

      if (!result.success) {
        console.error("[booking/create] Notification send failed", {
          bookingId: booking.booking_id,
          channel: result.channel,
          error: result.error,
        });
        // The booking is confirmed and the guest is shown a success page, but the
        // only proof they hold is an email that never arrived.
        captureIssue("Booking confirmation send failed", {
          scope: "notifications",
          step: "confirm",
          level: "error",
          hotelId: hotel.id,
          bookingId: booking.booking_id,
          reference: booking.reference,
          tags: {
            "hotel.slug": slug,
            "notification.channel": result.channel,
          },
          contexts: { notification: { error: result.error ?? null } },
          fingerprint: ["notifications", "booking-confirmation-failed"],
        });
      }

      return NextResponse.json({
        bookingId: booking.booking_id,
        reference: booking.reference,
        roomsCount: data.rooms_count,
      });
    }

    // ── pay_now: hand off to Paystack ────────────────────────────
    // Derive the callback from the request URL, never from the client-supplied
    // Origin header — Paystack would otherwise redirect guests to any host.
    const callbackUrl = `${req.nextUrl.origin}/${slug}/book/confirmation?bref=${booking.reference}`;
    const payRef = `${booking.reference}-${Date.now()}`;

    try {
      // Durable payment intent BEFORE the reference reaches Paystack: the
      // settlement RPC rejects any reference without a matching attempt, so a
      // guest who pays ahead of this row would be charged and then refused.
      // On failure the catch below aborts the hold; nothing was handed off.
      const { error: attemptErr } = await supabaseAdmin
        .from("payment_attempts")
        .insert({
          hotel_id: hotel.id,
          booking_id: booking.booking_id,
          paystack_reference: payRef,
          amount_minor: booking.total_minor,
          currency: booking.currency,
          expected_subaccount_code: hotel.paystack_subaccount_code!,
          metadata: {
            booking_id: booking.booking_id,
            hotel_id: hotel.id,
            booking_reference: booking.reference,
          },
          status: "initialized",
          initialized_at: new Date().toISOString(),
        });

      if (attemptErr) {
        throw new Error(`payment_attempts insert failed: ${attemptErr.message}`);
      }

      const txn = await initializeTransaction({
        email: data.guest_email,
        // Minor units for the booking's own currency, taken from the row the
        // transaction wrote, so the charge cannot round away from the total the
        // guest agreed to.
        amount: booking.total_minor,
        currency: booking.currency,
        reference: payRef,
        callback_url: callbackUrl,
        subaccount: hotel.paystack_subaccount_code!,
        metadata: { booking_id: booking.booking_id, hotel_id: hotel.id, booking_reference: booking.reference },
      });

      // Remember every reference handed to Paystack so the reconciliation sweep
      // can verify a payment even if the guest never returns and the webhook is
      // delayed past hold expiry.
      const { error: refsErr } = await supabaseAdmin
        .from("bookings")
        .update({ initiated_payment_refs: [payRef] })
        .eq("id", booking.booking_id);

      if (refsErr) {
        // The guest is being sent to Paystack with a reference RoomLine has not
        // stored. If the webhook is lost too, the sweep has nothing to verify and
        // a paid booking expires as an abandoned hold.
        captureSupabaseError(refsErr, "bookings.update.initiated_payment_refs", {
          scope: "booking-funnel",
          step: "payment_init",
          level: "error",
          hotelId: hotel.id,
          bookingId: booking.booking_id,
          reference: payRef,
          tags: { "hotel.slug": slug },
        });
      }

      return NextResponse.json({
        bookingId: booking.booking_id,
        reference: booking.reference,
        roomsCount: data.rooms_count,
        paymentRequired: true,
        authorizationUrl: txn.authorization_url,
        paymentReference: payRef,
      });
    } catch (paystackErr) {
      // Payment init failed — remove the hold and everything created with it.
      // The abort also drops the nights and, if this booking was the only reason
      // the guest row existed, the guest; a bare delete left both behind.
      const rollback = await abortUnpaidBooking(booking.booking_id, "paystack_init_failed");

      console.error("[booking/create] Paystack init failed", paystackErr);

      // lib/paystack.ts already reports the HTTP or network failure itself; this
      // records the booking-side consequence — a guest who reached checkout and
      // could not pay.
      captureError(paystackErr, {
        scope: "booking-funnel",
        step: "payment_init",
        level: "error",
        hotelId: hotel.id,
        bookingId: booking.booking_id,
        reference: payRef,
        tags: {
          "hotel.slug": slug,
          "payment.currency": booking.currency,
          "booking.rolled_back": rollback.ok,
        },
        contexts: { payment: { amount: booking.total_amount, rooms_count: data.rooms_count } },
      });

      if (!rollback.ok) {
        // The hold survived a failed payment init, so the room stays blocked for
        // 30 minutes until expire_stale_payment_holds() clears it — and the
        // dashboard shows a booking the guest was told had failed.
        captureSupabaseError(
          {
            message: rollback.rejection.message,
            code: rollback.rejection.sqlstate,
            details: rollback.rejection.code,
            hint: rollback.rejection.hint,
          } satisfies SupabaseErrorLike,
          "rpc.abort_unpaid_booking",
          {
            scope: "booking-funnel",
            step: "payment_init",
            level: "fatal",
            hotelId: hotel.id,
            bookingId: booking.booking_id,
            reference: booking.reference,
            tags: { "hotel.slug": slug, "booking.rejection": rollback.rejection.code },
            fingerprint: ["booking-funnel", "abort-unpaid-booking", rollback.rejection.code],
          }
        );
      }

      // Parse Paystack error for user-friendly message
      const errMsg = paystackErr instanceof Error ? paystackErr.message : String(paystackErr);
      if (errMsg.includes("unsupported_currency") || errMsg.includes("Currency not supported")) {
        return NextResponse.json({ 
          error: `Online payment unavailable: This hotel's payment processor doesn't support ${booking.currency} currency. Please contact the hotel directly.` 
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        error: "Payment initialization failed. Please try again or contact the hotel directly." 
      }, { status: 500 });
    }
  } catch (err) {
    console.error("[booking/create]", err);
    // Anything unhandled here means the guest saw a generic failure on a hotel's
    // own booking page. No slug tag is safe to assume — params may be what threw.
    captureError(err, {
      scope: "booking-funnel",
      step: "hold",
      level: "error",
      fingerprint: ["booking-funnel", "create-unhandled"],
    });
    return NextResponse.json({ error: "Unexpected error. Please try again." }, { status: 500 });
  } finally {
    // Guest-facing checkout on a serverless isolate: flush before the response
    // resolves or the event is lost.
    await flushSentry();
  }
}

