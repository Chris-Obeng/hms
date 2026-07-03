import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { timingSafeEqual } from "crypto";
import type { Beds24BookingWebhookPayload } from "@/lib/beds24";

/**
 * POST /api/webhooks/beds24
 *
 * Receives inbound booking notifications from Beds24.
 * Beds24 sends the full booking object (same schema as GET /bookings).
 *
 * Setup: Settings → Properties → Access → Booking Webhook
 * Auth: HMAC-safe comparison of x-beds24-token header against BEDS24_WEBHOOK_SECRET env.
 *       Only one header is accepted — no fallback chain (fallbacks widen the attack surface).
 *
 * Docs: https://wiki.beds24.com/index.php/Category:API_V2 → Webhooks section
 */
export async function POST(req: NextRequest) {
  // ── 1. Validate secret token ─────────────────────────────────
  // Accept ONLY x-beds24-token. No fallback header chain — each additional
  // header accepted widens the attack surface for header-spoofing attempts.
  const receivedToken = req.headers.get("x-beds24-token");
  const expectedToken = process.env.BEDS24_WEBHOOK_SECRET;

  if (!expectedToken) {
    console.error("[beds24:webhook] BEDS24_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (!receivedToken) {
    console.warn("[beds24:webhook] Missing x-beds24-token header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // timingSafeEqual prevents timing-based token enumeration attacks
  const receivedBuf = Buffer.from(receivedToken);
  const expectedBuf = Buffer.from(expectedToken);

  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    console.warn("[beds24:webhook] Invalid x-beds24-token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Beds24BookingWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── 2. Extract key fields from Beds24 booking payload ────────
  const beds24PropertyId = String(payload.propId ?? "");
  const beds24RoomId = payload.roomId != null ? String(payload.roomId) : null;
  const beds24BookingId = String(payload.id ?? "");
  const bookingStatus = payload.status ?? 0; // 0=new/confirmed, -1=cancelled

  // Beds24 uses firstNight/lastNight — checkout is lastNight + 1 day
  const firstNight = payload.firstNight ?? "";
  const checkoutDate = payload.checkoutDate ?? (() => {
    if (!payload.lastNight) return "";
    const d = new Date(payload.lastNight);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  if (!beds24PropertyId || !firstNight || !checkoutDate) {
    return NextResponse.json({ error: "Missing required fields: propId, firstNight/lastNight" }, { status: 400 });
  }

  // ── 3. Resolve hotel by beds24_property_id ───────────────────
  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("id, name, currency, slug, settings")
    .eq("beds24_property_id", beds24PropertyId)
    .single();

  if (!hotel) {
    // Unknown property — return 200 so Beds24 doesn't keep retrying
    console.warn(`[beds24:webhook] Unknown property ID: ${beds24PropertyId}`);
    return NextResponse.json({ received: true });
  }

  // ── 4. Handle cancellations ──────────────────────────────────
  if (bookingStatus === -1) {
    if (beds24BookingId) {
      // Find and cancel the booking by internal_notes containing the Beds24 ID
      const { data: existingBooking } = await supabaseAdmin
        .from("bookings")
        .select("id, reference")
        .eq("hotel_id", hotel.id)
        .ilike("internal_notes", `%beds24:${beds24BookingId}%`)
        .maybeSingle();

      if (existingBooking) {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", existingBooking.id);

        await supabaseAdmin.from("notifications").insert({
          hotel_id: hotel.id,
          type: "booking_cancelled",
          title: "OTA Booking Cancelled",
          message: `Booking ${existingBooking.reference} from Booking.com has been cancelled.`,
          booking_id: existingBooking.id,
          is_read: false,
        });
      }

      await logSync(hotel.id, "inbound", "cancellation", beds24BookingId, existingBooking?.id ?? null, "success", payload as Record<string, unknown>);
    }
    return NextResponse.json({ received: true });
  }

  // ── 5. Idempotency — skip if already processed ───────────────
  const { data: existing } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("hotel_id", hotel.id)
    .ilike("internal_notes", `%beds24:${beds24BookingId}%`)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true });
  }

  // ── 6. Resolve room_type_id from beds24_room_id mapping ──────
  let roomTypeId: string | null = null;
  if (beds24RoomId) {
    const { data: mapping } = await supabaseAdmin
      .from("beds24_property_mappings")
      .select("room_type_id")
      .eq("hotel_id", hotel.id)
      .eq("beds24_room_id", beds24RoomId)
      .maybeSingle();
    roomTypeId = mapping?.room_type_id ?? null;
  }

  // ── 7. Conflict check ─────────────────────────────────────────
  // Check if any confirmed/checked_in booking overlaps these dates for this room type
  const conflictQuery = supabaseAdmin
    .from("bookings")
    .select("id, reference, check_in, check_out")
    .eq("hotel_id", hotel.id)
    .in("status", ["confirmed", "checked_in"])
    .lt("check_in", checkoutDate)
    .gt("check_out", firstNight);

  if (roomTypeId) {
    conflictQuery.eq("room_type_id", roomTypeId);
  }

  const { data: conflicts } = await conflictQuery.limit(1);

  if (conflicts && conflicts.length > 0) {
    const conflict = conflicts[0];
    const conflictMsg = `Conflicts with booking ${conflict.reference} (${conflict.check_in}→${conflict.check_out})`;

    await logSync(hotel.id, "inbound", "new_booking", beds24BookingId, null, "conflict", payload as Record<string, unknown>, conflictMsg);

    await supabaseAdmin.from("notifications").insert({
      hotel_id: hotel.id,
      type: "ota_conflict",
      title: "⚠️ OTA Booking Conflict",
      message: `Beds24 booking ${beds24BookingId} (${firstNight}→${checkoutDate}) conflicts with ${conflict.reference}. Manual resolution required.`,
      is_read: false,
    });

    // Notify via DB notification — super admin will see it in the dashboard
    // (phone not in staff_profiles schema — SMS skipped, notification is sufficient)
    console.error(`[beds24:webhook] OTA CONFLICT: hotel=${hotel.name}, beds24BookingId=${beds24BookingId}, conflict=${conflict.reference}`);

    return NextResponse.json({ received: true, conflict: true });
  }

  // ── 8. Find or create guest ───────────────────────────────────
  const guestFirstName = payload.guestFirstName ?? "";
  const guestLastName = payload.guestLastName ?? "";
  const guestName = [guestFirstName, guestLastName].filter(Boolean).join(" ") || "OTA Guest";
  const guestEmail = payload.guestEmail || null;
  const guestPhone = payload.guestPhone || null;

  let guestId: string | null = null;
  if (guestEmail) {
    const { data: existingGuest } = await supabaseAdmin
      .from("guests")
      .select("id")
      .eq("hotel_id", hotel.id)
      .eq("email", guestEmail)
      .maybeSingle();
    guestId = existingGuest?.id ?? null;
  }

  if (!guestId) {
    const { data: newGuest } = await supabaseAdmin
      .from("guests")
      .insert({ hotel_id: hotel.id, full_name: guestName, email: guestEmail, phone: guestPhone })
      .select("id")
      .single();
    guestId = newGuest?.id ?? null;
  }

  // ── 9. Calculate nights ───────────────────────────────────────
  const nights = Math.max(
    1,
    Math.ceil((new Date(checkoutDate).getTime() - new Date(firstNight).getTime()) / 86400000)
  );
  const totalAmount = Number(payload.price ?? 0);
  const roomRate = nights > 0 ? totalAmount / nights : 0;

  // ── 10. Generate booking reference ───────────────────────────
  const slugPrefix = (hotel.slug ?? "OT")
    .split("-")
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3) || "OT";

  const { data: refData } = await supabaseAdmin.rpc("generate_booking_reference", {
    p_hotel_id: hotel.id,
    p_prefix: slugPrefix,
  });
  const reference = typeof refData === "string"
    ? refData
    : `${slugPrefix}-${beds24BookingId}`;

  // ── 11. Insert booking ────────────────────────────────────────
  const { data: newBooking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .insert({
      hotel_id: hotel.id,
      reference,
      guest_id: guestId,
      room_type_id: roomTypeId,
      check_in: firstNight,
      check_out: checkoutDate,
      nights,
      adults: payload.numAdult ?? 1,
      children: payload.numChild ?? 0,
      room_rate: roomRate,
      subtotal: totalAmount,
      tax_amount: 0,
      total_amount: totalAmount,
      amount_paid: 0,
      currency: hotel.currency ?? "GHS",
      status: "confirmed",
      payment_status: "unpaid",
      payment_preference: "pay_at_checkin",
      source: "bookings_com",
      internal_notes: `beds24:${beds24BookingId}${payload.externalId ? ` | ota_ref:${payload.externalId}` : ""}`,
    })
    .select("id, reference")
    .single();

  if (bookingError || !newBooking) {
    await logSync(hotel.id, "inbound", "new_booking", beds24BookingId, null, "error", payload as Record<string, unknown>, bookingError?.message);
    console.error("[beds24:webhook] Failed to insert booking:", bookingError?.message);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }

  // ── 12. Notify hotel staff ────────────────────────────────────
  await supabaseAdmin.from("notifications").insert({
    hotel_id: hotel.id,
    type: "new_booking",
    title: "New Booking.com Booking",
    message: `${guestName} · ${firstNight} → ${checkoutDate} · via Booking.com`,
    booking_id: newBooking.id,
    is_read: false,
  });

  await logSync(hotel.id, "inbound", "new_booking", beds24BookingId, newBooking.id, "success", payload as Record<string, unknown>);

  return NextResponse.json({
    received: true,
    bookingId: newBooking.id,
    reference: newBooking.reference,
  });
}

// ── Helpers ───────────────────────────────────────────────────────

async function logSync(
  hotelId: string,
  direction: "inbound" | "outbound",
  eventType: string,
  beds24BookingId: string,
  bookingId: string | null,
  status: "success" | "conflict" | "error" | "ignored",
  payload: Record<string, unknown>,
  conflictDetails?: string
) {
  try {
    await supabaseAdmin.from("beds24_sync_log").insert({
      hotel_id: hotelId,
      direction,
      event_type: eventType,
      beds24_booking_id: beds24BookingId || null,
      booking_id: bookingId,
      payload: payload as import("@/types/database.types").Json,
      status,
      conflict_details: conflictDetails ?? null,
    });
  } catch (err) {
    console.error("[beds24:logSync] Failed:", err);
  }
}
