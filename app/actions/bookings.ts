"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createBookingAtomic, type BookingRejection } from "@/lib/bookings/create-booking-atomic";
import { writeAuditLog } from "@/lib/audit";
import { canPerformAction, requireMinRole, toActionError } from "@/lib/auth";
import {
  fetchStayRestrictions,
  staffStayRestrictionMessage,
  type RoomTypeStayRestrictions,
} from "@/lib/bookings/stay-restrictions";
import { captureError } from "@/lib/observability/sentry";
import { kickDeliveryWorker } from "@/lib/notifications/kick-delivery";
import { canTransitionBooking } from "@/lib/booking-status";

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
  // A manager who has read the restriction and still wants the stay sets this.
  // Absent or false, a restricted stay is refused with the reason.
  overrideRestrictions: z.coerce.boolean().optional(),
});

export type NewBookingInput = z.infer<typeof NewBookingSchema>;

// ── Statuses that require manager or above ────────────────────────
// Industry-standard PMS matrix: front desk owns the full reservation
// lifecycle (confirm, check-in/out, cancel, no-show). Manager+ gates apply
// to pricing, room/rate configuration and payment edits — enforced in their
// respective actions, not here.

// ── Create Booking ───────────────────────────────────────────────

export type CreateBookingResult =
  | { success: true; bookingId: string; reference: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Staff-facing copy for a `create_booking_atomic` rejection.
 *
 * The function's own messages are written for staff but name raw UUIDs, which is
 * useless at the front desk, so each machine code gets a curated sentence.
 * Classification is by code, never by message text, so the SQL stays free to
 * reword itself. `unknown` falls through to the raw message: if a grant or a
 * migration is missing, an operator who can read the real error is better served
 * than one who gets a shrug.
 */
function rejectionMessage(
  rejection: BookingRejection,
  stay: { checkIn: string; checkOut: string }
): string {
  switch (rejection.code) {
    // Either the count came up short before the write, or the inventory guard
    // (23P01) caught two desks racing for the last room of the type.
    case "no_availability":
    case "inventory_conflict":
      return "Not enough rooms of that type are available for those dates. Refresh availability and try again.";

    // HINT names the occupying guest, so the desk still sees who has the room.
    case "room_conflict":
      return `Room already booked by ${rejection.hint ?? "another guest"} (${stay.checkIn} → ${stay.checkOut})`;

    case "room_not_bookable":
      return "That room cannot be booked — check that it is not under maintenance and belongs to the selected room type.";

    case "room_type_not_found":
      return "Room type not found";

    // No active plan on the type means there is nothing to price the stay on.
    case "rate_plan_not_found":
      return "That room type has no active rate plan — create one, then try again.";

    case "guest_not_found":
      return "That guest does not belong to this hotel";

    // The desk gets the real reason: part of the stay has no published rate.
    // Hidden behind "unavailable" this silently loses every booking in the range.
    case "unpriced_stay":
      console.error("[createBooking] stay has no published rate", rejection.message);
      return "No rate is published for part of those dates. Set a rate for the stay, then try again.";

    case "invalid_date_range":
      return "Check-out must be after check-in";

    case "invalid_guest_name":
      return "Guest name is required";

    case "invalid_estimated_arrival":
      return "Estimated arrival is not a valid time — try 14:30";

    case "invalid_rooms_count":
      return "That number of rooms cannot be booked";

    case "hotel_not_found":
      return "Hotel not found";

    // Defensive. The guard is armed only for a direct stay with no created_by,
    // and every staff write carries one, so the pre-check below is what a desk
    // actually hits. This case exists so a future unattributed insert path
    // reports the reason instead of the raw SQL sentence.
    case "stay_restrictions":
      return `This stay breaks the rate plan's restrictions (${rejection.hint ?? "no detail"}).`;

    default:
      console.error("[createBooking] create_booking_atomic rejected", {
        code: rejection.code,
        sqlstate: rejection.sqlstate,
        message: rejection.message,
      });
      return `Failed to create booking: ${rejection.message}`;
  }
}

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

    // Validate dates
    const checkIn = new Date(data.checkIn);
    const checkOut = new Date(data.checkOut);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return { success: false, error: "Invalid dates" };
    }
    if (checkOut <= checkIn) {
      return { success: false, error: "Check-out must be after check-in" };
    }

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
    }

    // Occupancy ceiling. The client gates this in availability-step, but the action
    // is the real trust boundary (create_booking_atomic runs as service_role), so the
    // room type's max capacity is re-checked here. Defaults mirror getStaffAvailability
    // (2 adults / 0 children) so the server never rejects a stay the client allowed.
    // Capacity is a hard limit, not a policy — no manager override.
    const { data: capacity } = await supabase
      .from("room_types")
      .select("max_adults, max_children")
      .eq("id", data.roomTypeId)
      .eq("hotel_id", hotelId)
      .single();

    if (!capacity) return { success: false, error: "Room type not found" };
    const maxAdults = capacity.max_adults ?? 2;
    const maxChildren = capacity.max_children ?? 0;
    if (data.adults > maxAdults || data.children > maxChildren) {
      const cap =
        maxChildren > 0
          ? `${maxAdults} adult${maxAdults === 1 ? "" : "s"} and ${maxChildren} child${maxChildren === 1 ? "" : "ren"}`
          : `${maxAdults} guest${maxAdults === 1 ? "" : "s"}`;
      return { success: false, error: `That room type holds up to ${cap}.` };
    }

    // Rate plan restrictions. The database guard is armed only for an
    // unattributed direct stay — the public widget — because a desk has to be
    // able to sell a closed date with a guest standing in front of it. That makes
    // this the gate for staff, and it is deliberately a soft one: the reason is
    // named, and a manager can go through it with an audit row behind them.
    let restricted: RoomTypeStayRestrictions | undefined;
    try {
      restricted = (
        await fetchStayRestrictions(hotelId, [data.roomTypeId], data.checkIn, data.checkOut)
      ).get(data.roomTypeId);
    } catch (error) {
      // A failed restriction read must not stop the desk from taking a booking.
      // Reported and then ignored: the stay is still written, and the only cost
      // is that a closed date goes unflagged on this one attempt.
      captureError(error, {
        scope: "server-action",
        hotelId,
        role: ctx.role,
        level: "warning",
        tags: { action: "createBooking", read: "room_type_stay_restrictions" },
      });
    }

    const violated = restricted && !restricted.sellable ? restricted : null;
    if (violated) {
      const reason = staffStayRestrictionMessage(violated.restrictions);
      if (!data.overrideRestrictions) {
        return {
          success: false,
          error: `Rate plan restrictions block this stay: ${reason}. A manager can override this.`,
        };
      }
      if (!canPerformAction(ctx.role, "manager")) {
        return {
          success: false,
          error: `Rate plan restrictions block this stay: ${reason}. Only a manager or above can override it.`,
        };
      }
    }

    // One transaction resolves the guest, generates the reference, prices every
    // night, picks a free room and passes the inventory gate, then writes
    // `bookings` and `booking_nights` together. The rates stored against the stay
    // are the numbers the stay was priced at by construction, and a rejection
    // leaves no orphan guest and no half-built reservation behind.
    //
    // The function runs on the service-role client, so RLS is not a second gate
    // on this write. `hotelId` comes from `requireMinRole` and never from the
    // submitted form, and `create_booking_atomic` independently re-checks that
    // the room type, the room and any supplied guest all belong to that hotel —
    // strictly more tenancy checking than the RLS-scoped insert it replaces.
    const created = await createBookingAtomic({
      hotel_id: hotelId,
      room_type_id: data.roomTypeId,
      check_in: data.checkIn,
      check_out: data.checkOut,
      adults: data.adults,
      children: data.children,
      status: data.paymentPreference === "pay_now" ? "pending" : "confirmed",
      payment_status: "unpaid",
      payment_preference: data.paymentPreference,
      source: data.source,
      // A desk booking holds a numbered room from the moment it is taken. The
      // function picks the lowest-numbered free room of the type, and leaves
      // room_id null rather than failing a valid reservation if none is free.
      assign_room: true,
      room_id: data.roomId ?? null,
      guest_id: data.guestId ?? null,
      guest_name: data.guestName,
      guest_email: data.guestEmail ?? "",
      guest_phone: data.guestPhone ?? "",
      nationality: data.nationality ?? null,
      special_requests: data.specialRequests ?? null,
      internal_notes: data.internalNotes ?? null,
      estimated_arrival: data.estimatedArrival ?? null,
      created_by: ctx.staffId,
    });

    if (!created.ok) {
      return {
        success: false,
        error: rejectionMessage(created.rejection, {
          checkIn: data.checkIn,
          checkOut: data.checkOut,
        }),
      };
    }

    const booking = created.booking;

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "booking.created",
      entityType: "booking",
      entityId: booking.booking_id,
      afterState: {
        reference: booking.reference,
        source: data.source,
        payment_preference: data.paymentPreference,
        check_in: data.checkIn,
        check_out: data.checkOut,
        room_id: booking.room_id,
        total_amount: booking.total_amount,
      },
    });

    // A second row, only when a manager sold through a restriction. Separate
    // from booking.created on purpose: this is the row a revenue manager filters
    // on when a closed date still sold, and it carries the violation codes
    // verbatim so the decision can be read back without re-deriving it.
    if (violated) {
      await writeAuditLog(supabase, {
        hotelId,
        staffId: ctx.staffId,
        staffName: ctx.staffName,
        action: "rate.restriction_overridden",
        entityType: "booking",
        entityId: booking.booking_id,
        afterState: {
          reference: booking.reference,
          room_type_id: data.roomTypeId,
          rate_plan_id: violated.ratePlanId,
          check_in: data.checkIn,
          check_out: data.checkOut,
          violations: violated.restrictions.map((restriction) => restriction.raw),
        },
      });
    }

    // Fan out internal alert per staff preference. Creator excluded by design.
    const { data: recipients } = await supabase
      .from("staff_profiles")
      .select("id, notification_prefs")
      .eq("clerk_org_id", ctx.orgId)
      .eq("is_active", true)
      .neq("id", ctx.staffId);
    const rows = (recipients ?? [])
      .filter((staff) => (staff.notification_prefs as Record<string, boolean> | null)?.new_booking !== false)
      .map((staff) => ({
        hotel_id: hotelId,
        type: "new_booking",
        title: "New booking created",
        message: `${booking.reference} added by ${ctx.staffName ?? "staff"}`,
        booking_id: booking.booking_id,
        created_by_staff_id: ctx.staffId,
        recipient_staff_id: staff.id,
      }));
    if (rows.length) {
      const { error: notifyError } = await supabase.from("notifications").insert(rows as never);
      if (notifyError) {
        // Booking already persisted; losing alerts must not fail the request,
        // but it must never fail silently either.
        console.error("[createBooking] staff notification insert failed", {
          bookingId: booking.booking_id,
          error: notifyError.message,
        });
      } else {
        kickDeliveryWorker();
      }
    }

    return { success: true, bookingId: booking.booking_id, reference: booking.reference };
  } catch (err) {
    return toActionError(err, { action: "bookings.createBooking" });
  }
}

// ── Update Booking Status ────────────────────────────────────────────

export async function updateBookingStatus(
  bookingId: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Industry-standard PMS: every reservation lifecycle transition (confirm,
    // check-in/out, cancel, no-show, reinstate) is a front-desk operation.
    const ctx = await requireMinRole("front_desk", `set booking status to '${status}'`);

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
    if (!canTransitionBooking(before.status ?? "", status)) {
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
        // Reinstating (cancelled → confirmed) clears the cancellation audit
        // fields, matching the settlement RPC's resurrection path — a stale
        // cancelled_at on a live booking would misreport in detail views.
        ...(before.status === "cancelled" && status !== "cancelled"
          ? { cancelled_at: null, cancellation_reason: null }
          : {}),
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
