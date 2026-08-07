"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { writeAuditLog } from "@/lib/audit";
import { requireMinRole, toActionError } from "@/lib/auth";

// ── Schemas ──────────────────────────────────────────────────────

const NewBookingSchema = z.object({
  // Guest
  guestId: z.string().uuid().optional(),
  guestName: z.string().min(1, "Guest name is required").max(200),
  guestEmail: z.string().email().optional().or(z.literal("")),
  guestPhone: z.string().max(30).optional().or(z.literal("")),
  nationality: z.string().max(80).optional().or(z.literal("")),

  // Booking
  roomTypeId: z.string().uuid("Room type is required"),
  roomId: z.string().uuid().optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-in date"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-out date"),
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
  // Pricing is always recomputed server-side from overrides + hotel tax settings.
  // These fields are accepted for backwards compatibility but are ignored.
  roomRate: z.coerce.number().min(0).optional(),
  subtotal: z.coerce.number().min(0).optional(),
  taxAmount: z.coerce.number().min(0).optional(),
  totalAmount: z.coerce.number().min(0).optional(),
  estimatedArrival: z.string().optional().or(z.literal("")),
  specialRequests: z.string().max(1000).optional().or(z.literal("")),
  source: z.enum(["direct", "manual", "phone", "walk_in"]),
  paymentPreference: z.enum(["pay_now", "pay_at_checkin"]),
  internalNotes: z.string().max(2000).optional().or(z.literal("")),
});

export type NewBookingInput = z.infer<typeof NewBookingSchema>;

// ── Allowed status transitions ────────────────────────────────────
// Maps current status → allowed next statuses per role level.
// front_desk: can check in, check out (normal workflow)
// manager+:   can also cancel and confirm
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:      ["confirmed", "cancelled"],
  confirmed:    ["checked_in", "cancelled"],
  checked_in:   ["checked_out"],
  checked_out:  [], // terminal — no transitions
  // Manager-approved reinstatement. Reinstated booking returns to confirmed,
  // preserving audit trail through booking status history.
  cancelled:    ["confirmed"],
  no_show:      [], // terminal
};

// Statuses that require manager or above
const MANAGER_ONLY_STATUSES = new Set(["cancelled", "confirmed", "no_show"]);

// ── Create Booking ───────────────────────────────────────────────

export type CreateBookingResult =
  | { success: true; bookingId: string; reference: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createBooking(
  formData: NewBookingInput
): Promise<CreateBookingResult> {
  try {
    // front_desk and above can create bookings
    const ctx = await requireMinRole("front_desk", "create bookings");
    const supabase = await createClient();

    const parsed = NewBookingSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        fieldErrors[path] ??= [];
        fieldErrors[path].push(issue.message);
      }
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const data = parsed.data;
    const hotelId = ctx.hotelId;

    // Verify room type belongs to this hotel
    const { data: roomType } = await supabase
      .from("room_types")
      .select("id, name, base_price")
      .eq("id", data.roomTypeId)
      .eq("hotel_id", hotelId)
      .single();

    if (!roomType) return { success: false, error: "Room type not found" };

    // Validate dates
    const checkIn = new Date(data.checkIn);
    const checkOut = new Date(data.checkOut);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return { success: false, error: "Invalid dates" };
    }
    if (checkOut <= checkIn) {
      return { success: false, error: "Check-out must be after check-in" };
    }

    // Find or create guest
    let guestId = data.guestId;

    if (!guestId) {
      if (data.guestEmail) {
        const { data: g } = await supabase
          .from("guests")
          .select("id")
          .eq("hotel_id", hotelId)
          .eq("email", data.guestEmail)
          .maybeSingle();
        if (g) guestId = g.id;
      }

      if (!guestId && data.guestPhone) {
        const { data: g } = await supabase
          .from("guests")
          .select("id")
          .eq("hotel_id", hotelId)
          .eq("phone", data.guestPhone)
          .maybeSingle();
        if (g) guestId = g.id;
      }

      if (!guestId) {
        const { data: newGuest, error: guestError } = await supabase
          .from("guests")
          .insert({
            hotel_id: hotelId,
            full_name: data.guestName,
            email: data.guestEmail || null,
            phone: data.guestPhone || null,
            nationality: data.nationality || null,
          })
          .select("id")
          .single();

        if (guestError || !newGuest) {
          return { success: false, error: "Failed to create guest" };
        }
        guestId = newGuest.id;
      } else if (data.nationality) {
        await supabase
          .from("guests")
          .update({ nationality: data.nationality })
          .eq("id", guestId)
          .eq("hotel_id", hotelId);
      }
    }

    // ── Server-side pricing recomputation ─────────────────────────────
    // NEVER trust client-sent roomRate/subtotal/totalAmount.
    // Always recompute from override tables + hotel tax settings.
    const checkInStr = format(checkIn, "yyyy-MM-dd");
    const checkOutStr = format(checkOut, "yyyy-MM-dd");

    const { resolvePublicNightlyTotal } = await import("@/lib/pricing/resolve-public-price");
    const resolved = await resolvePublicNightlyTotal(
      hotelId,
      data.roomTypeId,
      checkInStr,
      checkOutStr
    );

    const taxEnabled = ctx.hotel.settings.tax_enabled === true;
    const taxPercentage =
      taxEnabled && typeof ctx.hotel.settings.tax_percentage === "number"
        ? ctx.hotel.settings.tax_percentage
        : 0;
    const computedSubtotal = resolved.subtotal;
    const computedTaxAmount =
      taxPercentage > 0
        ? Math.round(computedSubtotal * (taxPercentage / 100) * 100) / 100
        : 0;
    const computedTotal = Math.round((computedSubtotal + computedTaxAmount) * 100) / 100;
    // Average nightly rate stored as room_rate (used for reporting, not pricing)
    const computedRoomRate = resolved.avgNightlyRate;

    // Room assignment availability check
    if (data.roomId) {
      const { data: room } = await supabase
        .from("rooms")
        .select("id, room_type_id, status")
        .eq("id", data.roomId)
        .eq("hotel_id", hotelId)
        .single();

      if (!room) return { success: false, error: "Room not found" };
      if (room.status === "maintenance" || room.status === "out_of_service") {
        return { success: false, error: `Room is ${room.status.replace("_", " ")}` };
      }
      if (room.room_type_id !== data.roomTypeId) {
        return { success: false, error: "Room type mismatch" };
      }

      const { data: conflicts } = await supabase
        .from("bookings")
        .select("id, reference, guests(full_name), check_in, check_out")
        .eq("hotel_id", hotelId)
        .eq("room_id", data.roomId)
        .in("status", ["pending", "confirmed", "checked_in"])
        .lt("check_in", checkOutStr)
        .gt("check_out", checkInStr)
        .limit(1);

      if (conflicts && conflicts.length > 0) {
        const conflict = conflicts[0];
        const guestInfo = conflict.guests as { full_name?: string | null } | null;
        return {
          success: false,
          error: `Room already booked by ${guestInfo?.full_name ?? conflict.reference} (${conflict.check_in} → ${conflict.check_out})`,
        };
      }
    }

    // Generate reference atomically (race-safe DB counter)
    const slugPrefix = ctx.hotel.name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 3) || "BK";

    const { data: refData, error: refErr } = await supabase.rpc(
      "generate_booking_reference" as never,
      { p_hotel_id: hotelId, p_prefix: slugPrefix } as never
    );

    if (refErr || !refData) {
      return { success: false, error: "Failed to generate booking reference" };
    }

    const reference = String(refData);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        hotel_id: hotelId,
        reference,
        guest_id: guestId,
        room_type_id: data.roomTypeId,
        room_id: data.roomId ?? null,
        check_in: checkInStr,
        check_out: checkOutStr,
        adults: data.adults,
        children: data.children,
        room_rate: computedRoomRate,
        subtotal: computedSubtotal,
        tax_amount: computedTaxAmount,
        total_amount: computedTotal,
        estimated_arrival: data.estimatedArrival || null,
        special_requests: data.specialRequests || null,
        source: data.source,
        payment_preference: data.paymentPreference,
        status: data.paymentPreference === "pay_now" ? "pending" : "confirmed",
        payment_status: "unpaid",
        internal_notes: data.internalNotes || null,
      })
      .select("id, reference")
      .single();

    if (bookingError || !booking) {
      return {
        success: false,
        error: `Failed to create booking: ${bookingError?.message ?? "Unknown error"}`,
      };
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "booking.created",
      entityType: "booking",
      entityId: booking.id,
      afterState: {
        reference: booking.reference,
        source: data.source,
        payment_preference: data.paymentPreference,
        check_in: data.checkIn,
        check_out: data.checkOut,
      },
    });

    return { success: true, bookingId: booking.id, reference: booking.reference };
  } catch (err) {
    return toActionError(err);
  }
}

// ── Update Booking Status ────────────────────────────────────────────

export async function updateBookingStatus(
  bookingId: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Cancellation and manual confirmation require manager+
    // Check-in and check-out are front_desk operations
    const minRole = MANAGER_ONLY_STATUSES.has(status) ? "manager" : "front_desk";
    const ctx = await requireMinRole(minRole as "manager" | "front_desk", `set booking status to '${status}'`);

    // Validate status is a known value
    const validStatuses = ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"];
    if (!validStatuses.includes(status)) {
      return { success: false, error: "Invalid status" };
    }

    const supabase = await createClient();

    // Fetch booking before update — needed for transition validation, audit, notifications
    const { data: before } = await supabase
      .from("bookings")
      .select(
        "id, reference, status, check_in, check_out, nights, total_amount, room_types(name), guests(full_name, email, phone)"
      )
      .eq("id", bookingId)
      .eq("hotel_id", ctx.hotelId)
      .single();

    if (!before) return { success: false, error: "Booking not found" };

    // Enforce state machine — prevent illegal transitions
    const allowed = ALLOWED_TRANSITIONS[before.status ?? ""] ?? [];
    if (!allowed.includes(status)) {
      return {
        success: false,
        error: `Cannot transition booking from '${before.status}' to '${status}'`,
      };
    }

    const { error } = await supabase
      .from("bookings")
      .update({
        status,
        ...(status === "checked_in" ? { check_in_at: new Date().toISOString() } : {}),
        ...(status === "checked_out" ? { check_out_at: new Date().toISOString() } : {}),
        ...(status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
      })
      .eq("id", bookingId)
      .eq("hotel_id", ctx.hotelId);

    if (error) return { success: false, error: error.message };

    await writeAuditLog(supabase, {
      hotelId: ctx.hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action:
        status === "cancelled"
          ? "booking.cancelled"
          : status === "checked_in"
          ? "booking.checked_in"
          : status === "checked_out"
          ? "booking.checked_out"
          : "booking.status_changed",
      entityType: "booking",
      entityId: bookingId,
      beforeState: { status: before.status },
      afterState: { status, reference: before.reference },
    });

    // Fire-and-forget notifications — don't block the status update response
    if (status === "cancelled") {
      const guest = before.guests as {
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;

      import("@/lib/notifications/send-booking-confirmation")
        .then(({ sendBookingCancellation }) =>
          sendBookingCancellation({
            hotelId: ctx.hotelId,
            bookingId,
            config: {
              hotelName: ctx.hotel.name,
              currency: ctx.hotel.currency,
            },
            booking: {
              guestName: guest?.full_name ?? "Guest",
              guestEmail: guest?.email,
              reference: before.reference,
              roomName: (before.room_types as { name?: string } | null)?.name ?? "Room",
              checkIn: before.check_in,
              hotelPhone: ctx.hotel.phone,
            },
          })
        )
        .then((result) => {
          if (!result.success) {
            console.error("[updateBookingStatus] Cancellation notification failed", {
              bookingId,
              channel: result.channel,
              error: result.error,
            });
          }
        })
        .catch((e: unknown) =>
          console.error("[updateBookingStatus:cancel-notify]", e)
        );
    }

    if (status === "confirmed" && before.status === "pending") {
      const guest = before.guests as {
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;

      import("@/lib/notifications/send-booking-confirmation")
        .then(({ sendBookingConfirmation }) =>
          sendBookingConfirmation({
            hotelId: ctx.hotelId,
            bookingId,
            config: {
              hotelName: ctx.hotel.name,
              currency: ctx.hotel.currency,
            },
            booking: {
              guestName: guest?.full_name ?? "Guest",
              guestEmail: guest?.email,
              reference: before.reference,
              roomName: (before.room_types as { name?: string } | null)?.name ?? "Room",
              checkIn: before.check_in,
              checkOut: before.check_out ?? "",
              nights: before.nights ?? 1,
              totalAmount: Number(before.total_amount ?? 0),
              hotelPhone: ctx.hotel.phone,
              hotelAddress: ctx.hotel.address,
            },
          })
        )
        .then((result) => {
          if (!result.success) {
            console.error("[updateBookingStatus] Confirmation notification failed", {
              bookingId,
              channel: result.channel,
              error: result.error,
            });
          }
        })
        .catch((e: unknown) =>
          console.error("[updateBookingStatus:confirm-notify]", e)
        );
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}
