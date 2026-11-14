"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  createBookingAtomic,
  createBookingGroupAtomic,
  type BookingRejection,
} from "@/lib/bookings/create-booking-atomic";
import { writeAuditLog } from "@/lib/audit";
import { canPerformAction, requireMinRole, toActionError } from "@/lib/auth";
import {
  fetchStayRestrictions,
  staffStayRestrictionMessage,
  type RoomTypeStayRestrictions,
} from "@/lib/bookings/stay-restrictions";
import { captureError } from "@/lib/observability/sentry";
import { fromMinor } from "@/lib/money";
import { notifyHotelStaff } from "@/lib/notifications/notify-hotel-staff";
import {
  buildBookingCancelledNotification,
  buildNewBookingNotification,
} from "@/lib/notifications/staff-notifications";
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

// ── Group (multi-room) schemas ───────────────────────────────────────
// Staff cart keeps occupancy + quantity per line, keyed by roomTypeId.
// Limits mirror the guest funnel (4 types, 5 of each) so the product caps
// and the DB ceiling (10 lines) never surprise each other.
const NewBookingGroupLineSchema = z.object({
  roomTypeId: z.string().uuid("Room type is required"),
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
  quantity: z.coerce.number().int().min(1).max(5).default(1),
});

const NewBookingGroupSchema = z
  .object({
    guestId: z.string().uuid().optional(),
    guestName: z.string().min(1, "Guest name is required").max(200),
    guestEmail: z.string().email().optional().or(z.literal("")),
    guestPhone: z.string().max(30).optional().or(z.literal("")),
    nationality: z.string().max(80).optional().or(z.literal("")),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-in date"),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-out date"),
    source: z.enum(["direct", "manual", "phone", "walk_in"]),
    paymentPreference: z.enum(["pay_now", "pay_at_checkin"]),
    estimatedArrival: z.string().optional().or(z.literal("")),
    specialRequests: z.string().max(1000).optional().or(z.literal("")),
    internalNotes: z.string().max(2000).optional().or(z.literal("")),
    overrideRestrictions: z.coerce.boolean().optional(),
    lines: z.array(NewBookingGroupLineSchema).min(1).max(4),
  })
  .superRefine((data, ctx) => {
    const total = data.lines.reduce((sum, l) => sum + l.quantity, 0);
    if (total > 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines"],
        message: "At most 10 rooms per reservation — reduce quantities",
      });
    }
  });

export type NewBookingGroupInput = z.infer<typeof NewBookingGroupSchema>;

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
      .select("name, max_adults, max_children")
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
      // function picks the best free room of the type (see
      // bookings_private.pick_best_room), and leaves room_id null rather than
      // failing a valid reservation if none is free for the whole stay.
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
    const singleAlertCopy = buildNewBookingNotification({
      guestName: data.guestName,
      roomLabel: capacity.name,
      roomsCount: 1,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      nights: booking.night_count,
      currency: ctx.hotel.currency || "GHS",
      totalAmount: booking.total_amount,
      paymentPreference: data.paymentPreference,
      actorName: ctx.staffName,
    });
    await notifyHotelStaff({
      hotelId,
      clerkOrgId: ctx.orgId,
      type: "new_booking",
      prefKey: "new_booking",
      title: singleAlertCopy.title,
      message: singleAlertCopy.message,
      bookingId: booking.booking_id,
      excludeStaffId: ctx.staffId,
    });

    return { success: true, bookingId: booking.booking_id, reference: booking.reference };
  } catch (err) {
    return toActionError(err, { action: "bookings.createBooking" });
  }
}

// ── Create Booking Group (staff multi-room) ──────────────────────────
// One reservation = N space stays for the same guest (shared dates, guest
// and payment posture). Reuses createBookingGroupAtomic exactly as the guest
// /api/booking/[slug]/bookings group path does, so the N× available-count +
// restriction + capacity checks and the DB-side inventory/repriced-nights
// flow are byte-for-byte the single-room path per line. Any line's HINT
// travels back (invalid_line_count / no_availability / inventory_conflict /
// stay_restrictions) and the caller never sees raw SQL text.

function groupRejectionMessage(
  rejection: BookingRejection,
  stay: { checkIn: string; checkOut: string }
): string {
  // Dedicated group codes first — single-room failures fall through to the
  // same curated copy the front desk already sees.
  switch (rejection.code) {
    case "invalid_line_count":
      return "A reservation can hold 1–10 rooms. Check the quantities and try again.";
    default:
      return rejectionMessage(rejection, stay);
  }
}

export type CreateBookingGroupResult =
  | {
      success: true;
      groupId: string;
      reference: string;
      groupTotalMinor?: number;
      lineCount: number;
      lines: { bookingId: string; reference: string; totalAmount: number }[];
    }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createBookingGroup(
  raw: unknown
): Promise<CreateBookingGroupResult> {
  try {
    const ctx = await requireMinRole("front_desk", "create bookings");
    const supabase = await createClient();

    const parsed = NewBookingGroupSchema.safeParse(raw);
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

    const checkIn = new Date(data.checkIn);
    const checkOut = new Date(data.checkOut);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return { success: false, error: "Invalid dates" };
    }
    if (checkOut <= checkIn) {
      return { success: false, error: "Check-out must be after check-in" };
    }

    const needsTotal = data.lines.reduce((sum, l) => sum + l.quantity, 0);
    // Expand the cart so rooms_count===1 per row: N physical stays (industry
    // norm: one reservation → N space stays → N assignable strips), not one
    // row holding rooms_count>1 (which would render as a single strip after).
    // Keep a per-line summary so the audit/notification text still reads "2×
    // Deluxe ×3 + 1× Standard ×1".
    type CartRow = { roomTypeId: string; adults: number; children: number };
    const cartRows: CartRow[] = data.lines.flatMap((l) =>
      Array.from({ length: l.quantity }, () => ({
        roomTypeId: l.roomTypeId,
        adults: l.adults,
        children: l.children,
      }))
    );
    const lineCounts = new Map<string, number>();
    for (const row of cartRows) {
      lineCounts.set(row.roomTypeId, (lineCounts.get(row.roomTypeId) ?? 0) + 1);
    }

    // Convex hull is the whole stay for this product, so one pass covering N
    // room types over one window beats N round trips. Availability caps the
    // product regardless of restrictions — getStaffAvailability returns the
    // min free nights per type across the stay, which is the correct headroom
    // when N holds already land pre-branch. fetchStayRestrictions stays the
    // source of truth for the "blocked by plan" copy.
    const roomTypeIds = [...new Set(cartRows.map((r) => r.roomTypeId))];

    // Per-row-type capacities server-side: createBooking already derives these
    // for single; the group must do it line-by-line before anything else.
    const { data: capacities, error: capErr } = await supabase
      .from("room_types")
      .select("id, max_adults, max_children")
      .eq("hotel_id", hotelId)
      .in("id", roomTypeIds);

    if (capErr || !capacities || capacities.length !== roomTypeIds.length) {
      return { success: false, error: "One or more room types not found" };
    }
    const capById = new Map(
      capacities.map((r) => [r.id, { maxAdults: r.max_adults ?? 2, maxChildren: r.max_children ?? 0 }])
    );
    for (const row of cartRows) {
      const cap = capById.get(row.roomTypeId)!;
      if (row.adults > cap.maxAdults || row.children > cap.maxChildren) {
        const label =
          cap.maxChildren > 0
            ? `${cap.maxAdults} adult${cap.maxAdults === 1 ? "" : "s"} and ${cap.maxChildren} child${cap.maxChildren === 1 ? "" : "ren"}`
            : `${cap.maxAdults} guest${cap.maxAdults === 1 ? "" : "s"}`;
        return { success: false, error: `That room type holds up to ${label}.` };
      }
    }

    // Batch availability so the product does not overbook on the same dates
    // regardless of how many rows are mid-cart. Build per-type total from
    // distinct room_types to keep the map honest rather than trusting a sum.
    const { data: availRows, error: availError } = await supabase.rpc("room_type_available_counts", {
      p_room_type_ids: roomTypeIds,
      p_from: data.checkIn,
      p_to: data.checkOut,
    });

    if (availError) {
      console.error("[createBookingGroup] available_counts lookup failed", {
        error: availError.message,
      });
    }
    const availById = new Map<string, number>(
      (availRows ?? []).map((r: { room_type_id: string; available: number }) => [r.room_type_id, Number(r.available ?? 0)])
    );
    for (const [roomTypeId, needed] of lineCounts) {
      const available = availById.get(roomTypeId) ?? 0;
      if (available < needed) {
        return {
          success: false,
          error:
            needsTotal > 1
              ? `Only ${available} room(s) left of one type for those dates. Adjust the cart and try again.`
              : "Not enough rooms of that type are available for those dates.",
        };
      }
    }

    // Restrictions are a soft product gate, not a hard DB one for staff: the
    // DB trigger normally fires only for direct, unauthenticated stays, so the
    // check here is what a front desk actually sees. Per-line, same as the
    // single path, so a closed Premium week does not block a booked Superior
    // when both types sit in the same cart.
    let restrictions: Map<string, RoomTypeStayRestrictions> | null = null;
    try {
      restrictions = await fetchStayRestrictions(hotelId, roomTypeIds, data.checkIn, data.checkOut);
    } catch (error) {
      captureError(error, {
        scope: "server-action",
        hotelId,
        role: ctx.role,
        level: "warning",
        tags: { action: "createBookingGroup", read: "room_type_stay_restrictions" },
      });
    }

    const blockedIds: string[] = [];
    if (restrictions) {
      for (const id of roomTypeIds) {
        const r = restrictions.get(id);
        if (r && !r.sellable) blockedIds.push(id);
      }
    }
    if (blockedIds.length) {
      const multi = blockedIds.length > 1;
      const reasons = [...new Set(
        blockedIds
          .map((id) => {
            const r = restrictions!.get(id)!;
            return staffStayRestrictionMessage(r.restrictions);
          })
          .filter(Boolean)
      )].join("; ");
      if (!data.overrideRestrictions) {
        return {
          success: false,
          error: multi
            ? `Rate plan restrictions block this stay on ${blockedIds.length} room type(s): ${reasons}. A manager can override.`
            : `Rate plan restrictions block this stay: ${reasons}. A manager can override this.`,
        };
      }
      if (!canPerformAction(ctx.role, "manager")) {
        return {
          success: false,
          error: multi
            ? `Rate plan restrictions block this stay on ${blockedIds.length} room type(s): ${reasons}. Only a manager or above can override it.`
            : `Rate plan restrictions block this stay: ${reasons}. Only a manager or above can override it.`,
        };
      }
    }

    const created = await createBookingGroupAtomic({
      hotel_id: hotelId,
      status: data.paymentPreference === "pay_now" ? "pending" : "confirmed",
      payment_status: "unpaid",
      payment_preference: data.paymentPreference,
      source: data.source,
      guest_id: data.guestId ?? null,
      guest_name: data.guestName,
      guest_email: data.guestEmail ?? "",
      guest_phone: data.guestPhone ?? "",
      nationality: data.nationality ?? null,
      special_requests: data.specialRequests ?? null,
      estimated_arrival: data.estimatedArrival ?? null,
      created_by: ctx.staffId,
      lines: cartRows.map((row) => ({
        room_type_id: row.roomTypeId,
        check_in: data.checkIn,
        check_out: data.checkOut,
        adults: row.adults,
        children: row.children,
        // One bookable unit each: mixed-cart repricing can then retry per
        // physical row instead of retrying a whole type block, and every row
        // can be assigned on the calendar without inventing rooms_count.
        rooms_count: 1,
        // Desk books hold numbered rooms straight away, so an assigned row per
        // physical unit stays that way through timeline drags. The writer picks
        // the best free room when assign_room is true and still succeeds as
        // unassigned when none is free, so a valid reservation is never lost.
        assign_room: true,
      })),
    });

    if (!created.ok) {
      return {
        success: false,
        error: groupRejectionMessage(created.rejection, {
          checkIn: data.checkIn,
          checkOut: data.checkOut,
        }),
      };
    }

    const group = created.group;

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "booking.created",
      entityType: "booking",
      entityId: group.group_id,
      afterState: {
        reference: group.group_reference,
        group_id: group.group_id,
        line_count: group.line_count,
        // Per-line quantities the desk actually picked (e.g. "2× Deluxe").
        cart: data.lines.map((l) => ({
          room_type_id: l.roomTypeId,
          quantity: l.quantity,
          adults: l.adults,
          children: l.children,
        })),
        source: data.source,
        payment_preference: data.paymentPreference,
        check_in: data.checkIn,
        check_out: data.checkOut,
        total_rooms: needsTotal,
        total_amount_minor: group.group_total_minor,
      },
    });

    // A second audit line only when a manager sold through restrictions — a
    // query a revenue manager can filter on later.
    // Merge duplicate restriction reasons across room types so the log states
    // every distinct violation rather than the first line's.
    if (blockedIds.length) {
      const distinctViolations = [
        ...new Set(
          blockedIds.flatMap((id) =>
            (restrictions!.get(id)!.restrictions ?? []).map((v) => v.raw)
          )
        ),
      ];
      await writeAuditLog(supabase, {
        hotelId,
        staffId: ctx.staffId,
        staffName: ctx.staffName,
        action: "rate.restriction_overridden",
        entityType: "booking",
        entityId: group.group_id,
        afterState: {
          reference: group.group_reference,
          group_id: group.group_id,
          room_type_ids: blockedIds,
          check_in: data.checkIn,
          check_out: data.checkOut,
          violations: distinctViolations,
        },
      });
    }

    // Fan-out internal alerts exactly like single-booking: per-prefs, actors
    // excluded. The atomized group has per-row booking_ids, but the UX is one
    // reservation (one reference), so the fan-out references the anchor id the
    // UI opens — same as the guest funnel's group path.
    const groupCurrency = ctx.hotel.currency || "GHS";
    const groupAlertCopy = buildNewBookingNotification({
      guestName: data.guestName,
      roomLabel: `${needsTotal} ${needsTotal === 1 ? "room" : "rooms"}`,
      roomsCount: needsTotal,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      nights: group.lines[0]?.night_count ?? null,
      currency: groupCurrency,
      totalAmount: fromMinor(group.group_total_minor, groupCurrency),
      paymentPreference: data.paymentPreference,
      actorName: ctx.staffName,
    });
    await notifyHotelStaff({
      hotelId,
      clerkOrgId: ctx.orgId,
      type: "new_booking",
      prefKey: "new_booking",
      title: groupAlertCopy.title,
      message: groupAlertCopy.message,
      bookingId: group.group_id,
      excludeStaffId: ctx.staffId,
    });

    return {
      success: true,
      groupId: group.group_id,
      reference: group.group_reference,
      groupTotalMinor: group.group_total_minor,
      lineCount: group.line_count,
      lines: group.lines.map((l) => ({
        bookingId: l.booking_id,
        reference: l.reference,
        totalAmount: l.total_amount,
      })),
    };
  } catch (err) {
    return toActionError(err, { action: "bookings.createBookingGroup" });
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
        "id, reference, status, payment_status, amount_paid, currency, check_in, check_out, nights, total_amount, room_types(name), guests(full_name, email, phone)"
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

    const amountPaidBefore = Number(before.amount_paid ?? 0);
    if (status === "cancelled" && amountPaidBefore > 0) {
      if (!canPerformAction(ctx.role, "manager")) {
        return {
          success: false,
          error: "Cancelling a paid booking requires manager approval.",
        };
      }
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
      const roomName = (before.room_types as { name?: string } | null)?.name ?? "Room";
      const cancelCopy = buildBookingCancelledNotification({
        guestName: guest?.full_name ?? "Guest",
        roomLabel: roomName,
        checkIn: before.check_in,
        checkOut: before.check_out,
        nights: before.nights,
        actorName: ctx.staffName,
      });

      void notifyHotelStaff({
        hotelId: ctx.hotelId,
        clerkOrgId: ctx.orgId,
        type: "booking_cancelled",
        prefKey: "booking_cancelled",
        title: cancelCopy.title,
        message: cancelCopy.message,
        bookingId,
        excludeStaffId: ctx.staffId,
      });

      if (amountPaidBefore > 0) {
        const bookingCurrency = before.currency ?? ctx.hotel.currency ?? "GHS";
        void import("@/lib/bookings/confirm-online-payment")
          .then(({ alertOncePerBooking }) =>
            alertOncePerBooking(
              ctx.hotelId,
              bookingId,
              "payment_failed",
              `cancel-paid-review:${bookingId}`,
              `Refund review needed (${before.reference})`,
              `Booking ${before.reference} was cancelled with ${bookingCurrency} ${amountPaidBefore.toFixed(2)} already collected. Review the hotel's cancellation policy and process any applicable refund.`
            )
          )
          .catch((e: unknown) =>
            console.error("[updateBookingStatus:paid-cancel-review]", e)
          );
      }

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
