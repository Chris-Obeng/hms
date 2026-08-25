"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { parseISO, addDays, format } from "date-fns";
import { toStoredBlockRange } from "@/lib/calendar-domain";
import { businessToday } from "@/lib/business-date";
import { writeAuditLog } from "@/lib/audit";

// ── Helpers ──────────────────────────────────────────────────────────

async function getHotelScopedClient() {
  const { orgId, userId } = await auth();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency, logo_url, timezone")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) throw new Error("Hotel not found");

  return { supabase, hotelId: hotel.id, hotel, userId };
}

// ── Staff Role Resolution ────────────────────────────────────────────

export type StaffRole =
  | "super_admin"
  | "manager"
  | "front_desk"
  | "read_only"
  | "pending";

export type StaffRoleInfo = {
  role: StaffRole;
  canEdit: boolean;
  canBlock: boolean;
  canUnblock: boolean;
};

/**
 * Resolves the current user's staff role within the active organization.
 * Returns role + a derived canEdit flag + canBlock flag (super_admin | manager).
 */
export async function getCurrentStaffRole(): Promise<StaffRoleInfo> {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) {
    return { role: "pending", canEdit: false, canBlock: false, canUnblock: false };
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  if (!profile || !profile.is_active) {
    return { role: "pending", canEdit: false, canBlock: false, canUnblock: false };
  }

  const role = profile.role as StaffRole;
  const canEdit = role === "super_admin" || role === "manager" || role === "front_desk";
  // Front desk blocks rooms daily (maintenance, cleaning, owner stays).
  // Removing blocks stays manager+ — enforced in deleteAvailabilityBlock and
  // mirrored by the availability_blocks DELETE RLS policy.
  const canBlock = canEdit;
  const canUnblock = role === "super_admin" || role === "manager";

  return { role, canEdit, canBlock, canUnblock };
}

// ── Calendar Data ────────────────────────────────────────────────────

export interface CalendarRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  status: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeSlug: string;
  roomTypeSortOrder: number;
  roomTypeBasePrice: number;
}

export interface CalendarBooking {
  id: string;
  reference: string;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  status: string;
  paymentStatus: string | null;
  source: string | null;
  totalAmount: number;
  adults: number | null;
  children: number | null;
  estimatedArrival: string | null;
  specialRequests: string | null;
}

export interface CalendarAvailabilityBlock {
  id: string;
  roomId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  notes: string | null;
  createdAt: string | null;
  createdByName: string | null;
}

export interface CalendarData {
  rooms: CalendarRoom[];
  roomTypes: { id: string; name: string; slug: string; basePrice: number; sortOrder: number | null }[];
  bookings: CalendarBooking[];
  availabilityBlocks: CalendarAvailabilityBlock[];
}

/**
 * Fetches all data needed to render the calendar for a given date window.
 * Rooms are ordered by room_type.sort_order, room_type.name, room_number.
 * Bookings and blocks are filtered to overlap with [startDate, startDate + days].
 */
export async function getCalendarData(
  startDate: string,
  days: number
): Promise<CalendarData> {
  const { supabase, hotelId } = await getHotelScopedClient();

  // Calculate the end of the visible window
  const endDate = format(addDays(parseISO(startDate), days), "yyyy-MM-dd");

  // Parallel queries ──────────────────────────────────────────────────

  // 1. Room types for this hotel
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id, name, slug, base_price, sort_order")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  // 2. Rooms ordered by type then number
  const { data: rooms } = await supabase
    .from("rooms")
    .select(`
      id, room_number, floor, status,
      room_types!inner(id, name, slug, base_price, sort_order)
    `)
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("room_number", { ascending: true });

  // 3. Bookings overlapping the visible window (assigned + unassigned).
  //    ALL statuses are returned so scrolling into history still shows
  //    past stays (checked_out / cancelled / no_show render muted and are
  //    not draggable). Window bounds keep the payload proportional to what
  //    is actually on screen.
  const { data: bookings } = await supabase
    .from("bookings")
    .select(`
      id, reference,
      check_in, check_out, nights,
      status, payment_status, source,
      total_amount, adults, children,
      estimated_arrival, special_requests,
      room_id,
      room_type_id,
      guests(full_name, email, phone),
      rooms(room_number, room_types!inner(name))
    `)
    .eq("hotel_id", hotelId)
    .lt("check_in", endDate)
    .gt("check_out", startDate)
    .order("check_in", { ascending: true });

  // 4. Availability blocks overlapping the visible window
  const { data: blocks } = await supabase
    .from("availability_blocks")
    .select("id, room_id, start_date, end_date, reason, notes, created_by, created_at")
    .eq("hotel_id", hotelId)
    .lt("start_date", endDate)
    .gt("end_date", startDate)
    .order("start_date", { ascending: true });

  // Resolve blocker names in one query
  const blockCreatorIds = [...new Set((blocks || []).map((b) => b.created_by).filter(Boolean))] as string[];
  const blockStaffMap = new Map<string, string>();
  if (blockCreatorIds.length > 0) {
    const { data: blockStaff } = await supabase
      .from("staff_profiles")
      .select("id, full_name")
      .in("id", blockCreatorIds);
    for (const s of blockStaff || []) {
      if (s.full_name) blockStaffMap.set(s.id, s.full_name);
    }
  }

  // ── Map to client shapes ────────────────────────────────────────────

  const mappedRoomTypes = (roomTypes || []).map((rt) => ({
    id: rt.id,
    name: rt.name,
    slug: rt.slug,
    basePrice: rt.base_price,
    sortOrder: rt.sort_order,
  }));

  // Build a lookup for room type info
  const roomTypeLookup = new Map(mappedRoomTypes.map((rt) => [rt.id, rt]));

  const mappedRooms = (rooms || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    roomNumber: r.room_number as string,
    floor: (r.floor as string | null) ?? null,
    status: (r.status as string) ?? "available",
    roomTypeId: (r.room_types as Record<string, unknown>).id as string,
    roomTypeName: (r.room_types as Record<string, unknown>).name as string,
    roomTypeSlug: (r.room_types as Record<string, unknown>).slug as string,
    roomTypeSortOrder: ((r.room_types as Record<string, unknown>).sort_order ?? 0) as number,
    roomTypeBasePrice: (r.room_types as Record<string, unknown>).base_price as number,
  }));

  // Sort rooms by room_type.sort_order, room_type.name, room_number
  mappedRooms.sort((a, b) => {
    const aType = roomTypeLookup.get(a.roomTypeId);
    const bType = roomTypeLookup.get(b.roomTypeId);
    const typeOrder =
      (aType?.sortOrder ?? 0) - (bType?.sortOrder ?? 0) ||
      (aType?.name ?? "").localeCompare(bType?.name ?? "");
    if (typeOrder !== 0) return typeOrder;
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  });

  const mappedBookings: CalendarBooking[] = (bookings || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    reference: row.reference as string,
    guestName: ((row.guests as Record<string, unknown> | null)?.full_name as string | null) ?? null,
    guestPhone: ((row.guests as Record<string, unknown> | null)?.phone as string | null) ?? null,
    guestEmail: ((row.guests as Record<string, unknown> | null)?.email as string | null) ?? null,
    roomId: (row.room_id as string | null) ?? null,
    roomNumber: ((row.rooms as Record<string, unknown> | null)?.room_number as string | null) ?? null,
    roomTypeId: (row.room_type_id as string | null) ?? null,
    roomTypeName: (((row.rooms as Record<string, unknown> | null)?.room_types as Record<string, unknown>)?.name as string | null) ?? null,
    checkIn: row.check_in as string,
    checkOut: row.check_out as string,
    nights: (row.nights as number | null) ?? null,
    status: (row.status as string) ?? "confirmed",
    paymentStatus: (row.payment_status as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    totalAmount: row.total_amount as number,
    adults: (row.adults as number | null) ?? null,
    children: (row.children as number | null) ?? null,
    estimatedArrival: (row.estimated_arrival as string | null) ?? null,
    specialRequests: (row.special_requests as string | null) ?? null,
  }));

  const mappedBlocks: CalendarAvailabilityBlock[] = (blocks || []).map((blk) => ({
    id: blk.id,
    roomId: blk.room_id,
    startDate: blk.start_date,
    endDate: blk.end_date,
    reason: blk.reason,
    notes: blk.notes,
    createdAt: blk.created_at ?? null,
    createdByName: blk.created_by ? blockStaffMap.get(blk.created_by) ?? null : null,
  }));

  return {
    rooms: mappedRooms,
    roomTypes: mappedRoomTypes,
    bookings: mappedBookings,
    availabilityBlocks: mappedBlocks,
  };
}

// ── Room Availability Check ───────────────────────────────────────────

export interface AvailabilityConflict {
  bookingId: string;
  reference: string;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
}

export interface AvailabilityCheckResult {
  available: boolean;
  conflicts: AvailabilityConflict[];
}

/**
 * Checks if a specific room is available for a date range.
 * Optionally excludes one booking (e.g., the one being moved/resized).
 */
export async function checkRoomAvailability(
  roomId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
): Promise<AvailabilityCheckResult> {
  const { supabase, hotelId } = await getHotelScopedClient();

  // Verify the room belongs to this hotel
  const { data: room } = await supabase
    .from("rooms")
    .select("id")
    .eq("id", roomId)
    .eq("hotel_id", hotelId)
    .single();

  if (!room) {
    return { available: false, conflicts: [] };
  }

  // Find overlapping active bookings for this room
  let query = supabase
    .from("bookings")
    .select(
      "id, reference, guests(full_name), check_in, check_out, status"
    )
    .eq("hotel_id", hotelId)
    .eq("room_id", roomId)
    .in("status", ["pending", "confirmed", "checked_in"])
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);

  if (excludeBookingId) {
    query = query.neq("id", excludeBookingId);
  }

  const { data: conflicts } = await query;

  const mapped: AvailabilityConflict[] = (conflicts || []).map((c: Record<string, unknown>) => ({
    bookingId: c.id as string,
    reference: c.reference as string,
    guestName: ((c.guests as Record<string, unknown> | null)?.full_name as string | null) ?? null,
    checkIn: c.check_in as string,
    checkOut: c.check_out as string,
    status: (c.status as string) ?? "",
  }));

  return {
    available: mapped.length === 0,
    conflicts: mapped,
  };
}

// ── Assign Booking to Room ────────────────────────────────────────────

export type AssignResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Assigns an existing booking to a specific room.
 * Validates:
 *  1. Booking belongs to this hotel
 *  2. Room belongs to this hotel
 *  3. Room type matches booking's room_type_id
 *  4. No double-booking conflict (exclusion constraint also catches races)
 */
export async function assignBookingToRoom(
  bookingId: string,
  roomId: string
): Promise<AssignResult> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();

    // Fetch booking with its room_type_id and dates
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, room_type_id, status, room_id, check_in, check_out")
      .eq("id", bookingId)
      .eq("hotel_id", hotelId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status === "cancelled" || booking.status === "checked_out" || booking.status === "no_show") {
      return { success: false, error: `Cannot assign a ${booking.status} booking` };
    }

    // Fetch room with its room_type_id
    const { data: room } = await supabase
      .from("rooms")
      .select("id, room_type_id, status")
      .eq("id", roomId)
      .eq("hotel_id", hotelId)
      .single();

    if (!room) return { success: false, error: "Room not found" };
    if (room.status === "maintenance" || room.status === "out_of_service") {
      return { success: false, error: `Room is ${room.status.replace("_", " ")}` };
    }

    // Room type must match
    if (booking.room_type_id && room.room_type_id !== booking.room_type_id) {
      return {
        success: false,
        error: "Room type mismatch — this booking requires a different room type",
      };
    }

    // Check for availability conflicts
    const availability = await checkRoomAvailability(
      roomId,
      booking.check_in,
      booking.check_out,
      bookingId // exclude self
    );

    if (!availability.available) {
      const conflict = availability.conflicts[0];
      return {
        success: false,
        error: `Room already booked by ${conflict.guestName || conflict.reference} (${conflict.checkIn} → ${conflict.checkOut})`,
      };
    }

    // Perform the assignment
    const { error } = await supabase
      .from("bookings")
      .update({ room_id: roomId })
      .eq("id", bookingId)
      .eq("hotel_id", hotelId);

    if (error) {
      // If the EXCLUDE constraint caught a race condition
      if (error.message?.includes("bookings_no_room_overlap")) {
        return { success: false, error: "Room is no longer available — another booking was just placed" };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Assignment failed",
    };
  }
}

// ── Move Booking (drag-and-drop) ──────────────────────────────────────

export type MoveBookingResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Moves a booking to a different room and/or date range.
 * Used by drag-and-drop move and resize operations.
 * Validates room type compatibility and availability before applying.
 *
 * `roomTypeId` opts in to an explicit room type change (upgrade/downgrade).
 * When provided, the booking's room_type_id is rewritten and the usual
 * "type mismatch" guard is bypassed for the target room.
 */
export async function moveBooking(
  bookingId: string,
  updates: {
    roomId?: string;
    checkIn?: string;
    checkOut?: string;
    roomTypeId?: string;
  }
): Promise<MoveBookingResult> {
  try {
    const { supabase, hotelId, hotel, userId } = await getHotelScopedClient();

    // Fetch current booking
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, room_id, room_type_id, check_in, check_out, status, nights, source")
      .eq("id", bookingId)
      .eq("hotel_id", hotelId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status === "cancelled" || booking.status === "checked_out" || booking.status === "no_show") {
      return { success: false, error: `Cannot move a ${booking.status} booking` };
    }

    const newRoomId = updates.roomId ?? booking.room_id;
    const newCheckIn = updates.checkIn ?? booking.check_in;
    const newCheckOut = updates.checkOut ?? booking.check_out;
    const typeChangeRequested =
      updates.roomTypeId !== undefined && updates.roomTypeId !== booking.room_type_id;

    // Validate dates
    if (newCheckOut <= newCheckIn) {
      return { success: false, error: "Check-out must be after check-in" };
    }

    // Past-date guard — mirrors the timeline preview rule. Client checks are
    // advisory (bundled server actions are directly invocable), so the policy
    // is enforced here against the property's business date.
    const todayKey = businessToday(hotel.timezone || "UTC");
    if (
      newCheckIn < todayKey &&
      booking.status !== "checked_in" &&
      !["manual", "phone", "walk_in"].includes(booking.source ?? "")
    ) {
      return { success: false, error: "Cannot schedule in the past" };
    }

    // An explicit room type change must reference a valid, active type of this hotel
    if (typeChangeRequested) {
      const { data: roomType } = await supabase
        .from("room_types")
        .select("id, name")
        .eq("id", updates.roomTypeId as string)
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .single();

      if (!roomType) return { success: false, error: "Room type not found" };
    }

    // Resolve the effective room whenever a move is happening OR a type change
    // was requested, so room/type consistency holds even when the caller sends
    // only `roomTypeId` for a booking that stays in its current room.
    const roomChanged = !!updates.roomId && updates.roomId !== booking.room_id;
    if ((roomChanged || typeChangeRequested) && newRoomId) {
      const { data: room } = await supabase
        .from("rooms")
        .select("id, room_type_id, status")
        .eq("id", newRoomId)
        .eq("hotel_id", hotelId)
        .single();

      if (!room) return { success: false, error: "Room not found" };
      if (room.status === "maintenance" || room.status === "out_of_service") {
        return { success: false, error: `Room is ${room.status.replace("_", " ")}` };
      }
      if (!typeChangeRequested && booking.room_type_id && room.room_type_id !== booking.room_type_id) {
        return { success: false, error: "Room type mismatch" };
      }
      if (typeChangeRequested && room.room_type_id !== updates.roomTypeId) {
        return { success: false, error: "Selected room does not belong to the chosen room type" };
      }
    }

    // Check for availability conflicts on the target room+dates
    if (newRoomId) {
      const availability = await checkRoomAvailability(
        newRoomId,
        newCheckIn,
        newCheckOut,
        bookingId // exclude self
      );

      if (!availability.available) {
        const conflict = availability.conflicts[0];
        return {
          success: false,
          error: `Conflicts with ${conflict.guestName || conflict.reference} (${conflict.checkIn} → ${conflict.checkOut})`,
        };
      }
    }

    // Build update payload (only changed fields)
    const payload: Partial<{
      room_id: string | null;
      check_in: string;
      check_out: string;
      room_type_id: string | null;
    }> = {};
    if (updates.roomId !== undefined) payload.room_id = newRoomId;
    if (updates.checkIn !== undefined) payload.check_in = newCheckIn;
    if (updates.checkOut !== undefined) payload.check_out = newCheckOut;
    if (typeChangeRequested) payload.room_type_id = updates.roomTypeId as string;

    const { error } = await supabase
      .from("bookings")
      .update(payload)
      .eq("id", bookingId)
      .eq("hotel_id", hotelId);

    if (error) {
      if (error.message?.includes("bookings_no_room_overlap")) {
        return { success: false, error: "Room is no longer available — another booking was just placed" };
      }
      return { success: false, error: error.message };
    }

    // Audit trail: room moves are high-value operational events
    // (staff_id is a uuid referencing staff_profiles, not the Clerk user id)
    let movedByStaffId: string | null = null;
    if (userId) {
      const { data: staffProfile } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();
      movedByStaffId = staffProfile?.id ?? null;
    }

    void writeAuditLog(supabase, {
      hotelId,
      staffId: movedByStaffId,
      action: typeChangeRequested ? "booking.room_type_change" : "booking.move",
      entityType: "booking",
      entityId: bookingId,
      beforeState: {
        room_id: booking.room_id,
        room_type_id: booking.room_type_id,
        check_in: booking.check_in,
        check_out: booking.check_out,
      },
      afterState: payload,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Move failed",
    };
  }
}

// ── Unassign Booking ───────────────────────────────────────────────────

export type UnassignResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Removes a booking's room assignment, returning it to the unassigned tray.
 */
export async function unassignBooking(
  bookingId: string
): Promise<UnassignResult> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();

    const { error } = await supabase
      .from("bookings")
      .update({ room_id: null })
      .eq("id", bookingId)
      .eq("hotel_id", hotelId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unassign failed",
    };
  }
}

// ── Availability Blocks quick actions ────────────────────────────────
/**
 * Creates an availability / maintenance block for a room.
 * PRD §9.3. Front desk and above may block; removal is manager+.
 */
export async function createAvailabilityBlock(
  roomId: string,
  startDate: string,
  endDate: string,
  reason: string,
  notes: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, hotelId, userId } = await getHotelScopedClient();

    const { canBlock } = await getCurrentStaffRole();
    if (!canBlock) {
      return { success: false, error: "You don't have permission to block rooms" };
    }

    // Record which staff member created the block (staff_profiles id).
    let createdByStaffId: string | null = null;
    if (userId) {
      const { data: staffProfile } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();
      createdByStaffId = staffProfile?.id ?? null;
    }

    const storedRange = toStoredBlockRange(startDate, endDate);
    const { error } = await supabase
      .from("availability_blocks")
      .insert({
        hotel_id: hotelId,
        room_id: roomId,
        start_date: storedRange.startDate,
        end_date: storedRange.endDate,
        reason,
        notes,
        created_by: createdByStaffId,
      });

    if (error) throw error;

    void writeAuditLog(supabase, {
      hotelId,
      staffId: createdByStaffId,
      action: "room.block_created",
      entityType: "room",
      entityId: roomId,
      afterState: {
        block_range: `${storedRange.startDate} → ${storedRange.endDate}`,
        reason,
      },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create block",
    };
  }
}

/**
 * Deletes an existing availability block. Manager+ only — mirrors the
 * availability_blocks DELETE RLS policy.
 */
export async function deleteAvailabilityBlock(
  blockId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, hotelId, userId } = await getHotelScopedClient();

    const { canUnblock } = await getCurrentStaffRole();
    if (!canUnblock) {
      return { success: false, error: "Only managers and super admins can remove blocks" };
    }

    // Resolve the acting staff member (staff_profiles id) for audit attribution.
    let deletedByStaffId: string | null = null;
    if (userId) {
      const { data: staffProfile } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();
      deletedByStaffId = staffProfile?.id ?? null;
    }

    const { data: removed, error: fetchError } = await supabase
      .from("availability_blocks")
      .delete()
      .eq("id", blockId)
      .eq("hotel_id", hotelId)
      .select("id, room_id, start_date, end_date")
      .single();

    if (fetchError) throw fetchError;

    void writeAuditLog(supabase, {
      hotelId,
      staffId: deletedByStaffId,
      action: "room.block_deleted",
      entityType: "room",
      entityId: removed?.room_id ?? blockId,
      afterState: {
        block_id: blockId,
        block_range: removed ? `${removed.start_date} → ${removed.end_date}` : undefined,
      },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to remove block",
    };
  }
}

/**
 * Fetches full details for a single booking.
 */
export async function getBookingById(bookingId: string) {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(`
        id, reference, status, payment_status, source,
        check_in, check_out, nights, total_amount, amount_paid,
        adults, children, estimated_arrival, special_requests,
        room_id, room_type_id,
        rooms(room_number, floor),
        guests(id, full_name, email, phone)
      `)
      .eq("id", bookingId)
      .eq("hotel_id", hotelId)
      .single();

    if (error) throw error;
    return { success: true, booking };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch booking",
    };
  }
}
