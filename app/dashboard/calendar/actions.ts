"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { z } from "zod";
import { parseISO, addDays, differenceInCalendarDays, format } from "date-fns";
import { toStoredBlockRange } from "@/lib/calendar-domain";
import { businessToday } from "@/lib/business-date";
import { writeAuditLog } from "@/lib/audit";
import { captureIssue } from "@/lib/observability/sentry";
import { isoDateParam } from "@/lib/validation/params";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchNightlyRates } from "@/lib/pricing/nightly-rates";
import { applyBps, percentToBps, toMinor } from "@/lib/money";
import {
  repriceBookingStay,
  type BookingRejection,
} from "@/lib/bookings/create-booking-atomic";

// ── Input validation ────────────────────────────────────────────────────────
// Bundled server actions are directly invocable, so every client-supplied
// value is validated here before it reaches PostgREST. Caps mirror the CHECK
// constraints in 20260923120000_bookings_role_gates.sql.

const uuidParam = z.uuid();
/** Visible calendar window. VIEW_PRESETS top out at 30; 45 leaves headroom. */
const calendarDaysParam = z.number().int().min(1).max(45);
const blockReasonParam = z.string().trim().min(1).max(50);
const blockNotesParam = z.string().trim().max(2000).nullable();

/** Raw PostgREST/Postgres text must never reach the client (M7): report the
 *  detail, return copy staff can act on. */
function reportCalendarFailure(
  message: string,
  meta: { hotelId?: string | null; bookingId?: string | null; tags?: Record<string, string | number | boolean | null | undefined>; contexts?: Record<string, Record<string, unknown>> },
): void {
  captureIssue(message, { scope: "server-action", level: "error", ...meta });
}

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
  const canEdit = can(role, "calendar:edit");
  // Front desk blocks rooms daily (maintenance, cleaning, owner stays).
  // Removing blocks stays manager+ — enforced in deleteAvailabilityBlock and
  // mirrored by the availability_blocks DELETE RLS policy.
  const canBlock = can(role, "availability:block");
  const canUnblock = can(role, "availability:unblock");

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
  groupId: string | null;
  roomsCount: number | null;
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
  internalNotes: string | null;
  /** Legacy rows with rooms_count>1 are split into N room strips; extra siblings are light wrappers around the real row that cannot be dragged. */
  isVirtual?: boolean;
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
  // Validate before touching the DB: an unbounded `days` would dump the full
  // booking history (guest PII included) to any active staff member (M2), and
  // a malformed date would produce a nonsense window.
  if (!isoDateParam.safeParse(startDate).success) {
    throw new Error("Invalid calendar start date");
  }
  if (!calendarDaysParam.safeParse(days).success) {
    throw new Error("Invalid calendar window");
  }

  const { supabase, hotelId } = await getHotelScopedClient();

  // Calculate the end of the visible window
  const endDate = format(addDays(parseISO(startDate), days), "yyyy-MM-dd");

  // A failed query must surface as a thrown error (H4): returning `?? []`
  // renders an empty grid that is indistinguishable from a zero-room hotel.
  const failLoad = (step: string, error: { message?: string; code?: string }): never => {
    reportCalendarFailure(`getCalendarData: ${step} query failed`, {
      hotelId,
      tags: { step, code: error.code },
      contexts: { supabase: { message: error.message } },
    });
    throw new Error("Failed to load calendar data");
  };

  // 1. Room types for this hotel
  // Parallel queries ──────────────────────────────────────────────────

  // 1. Room types for this hotel
  const { data: roomTypes, error: roomTypesError } = await supabase
    .from("room_types")
    .select("id, name, slug, base_price, sort_order")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (roomTypesError) failLoad("room_types", roomTypesError);

  // 2. Rooms ordered by type then number
  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select(`
      id, room_number, floor, status,
      room_types!inner(id, name, slug, base_price, sort_order)
    `)
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("room_number", { ascending: true });

  if (roomsError) failLoad("rooms", roomsError);

  // 3. Bookings overlapping the visible window (assigned + unassigned).
  //    ALL statuses are returned so scrolling into history still shows
  //    past stays (checked_out / cancelled / no_show render muted and are
  //    not draggable). Window bounds keep the payload proportional to what
  //    is actually on screen.
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(`
      id, reference,
      check_in, check_out, nights,
      status, payment_status, source,
      total_amount, adults, children,
      estimated_arrival, special_requests, internal_notes,
      room_id,
      room_type_id,
      group_id, rooms_count,
      guests(full_name, email, phone),
      rooms(room_number, room_types!inner(name))
    `)
    .eq("hotel_id", hotelId)
    .lt("check_in", endDate)
    .gt("check_out", startDate)
    .order("check_in", { ascending: true });

  if (bookingsError) failLoad("bookings", bookingsError);

  // 4. Availability blocks overlapping the visible window
  const { data: blocks, error: blocksError } = await supabase
    .from("availability_blocks")
    .select("id, room_id, start_date, end_date, reason, notes, created_by, created_at")
    .eq("hotel_id", hotelId)
    .lt("start_date", endDate)
    .gt("end_date", startDate)
    .order("start_date", { ascending: true });

  if (blocksError) failLoad("availability_blocks", blocksError);

  // Resolve blocker names in one query
  const blockCreatorIds = [...new Set((blocks || []).map((b) => b.created_by).filter(Boolean))] as string[];
  const blockStaffMap = new Map<string, string>();
  if (blockCreatorIds.length > 0) {
    const { data: blockStaff, error: blockStaffError } = await supabase
      .from("staff_profiles")
      .select("id, full_name")
      .in("id", blockCreatorIds);
    // Degraded-only failure: blocks still render, just without creator names.
    if (blockStaffError) {
      captureIssue("getCalendarData: staff_profiles enrichment failed", {
        scope: "server-action",
        level: "warning",
        hotelId,
        contexts: { supabase: { message: blockStaffError.message, code: blockStaffError.code } },
      });
    }
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
    groupId: (row.group_id as string | null) ?? null,
    roomsCount: (row.rooms_count as number | null) ?? null,
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
    internalNotes: (row.internal_notes as string | null) ?? null,
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

  // ── Legacy multi-room expansion (virtualization) ──────────────────────
  // New reservations write N rows (group_id shared, rooms_count=1) so the
  // timeline gets N strips. Legacy rows store N rooms on one row (rooms_count>1,
  // group_id null, one room_id) and would otherwise render as a single ×N bar.
  // Virtualize them at read time: split into N room-level strips, reusing free
  // rooms of the same type for the extra units so the rack again shows the
  // physical inventory held. Purely presentational — no DB write — and only for
  // active stays (cancelled/checked_out/noshow never occupy inventory).
  const TERMINAL_FOR_EXPANSION = new Set(["cancelled", "checked_out", "no_show"]);
  const rangeOverlapsForExpand = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
    aStart < bEnd && bStart < aEnd;
  const blocksByRoomForExpand = new Map<string, CalendarAvailabilityBlock[]>();
  for (const blk of mappedBlocks) {
    const list = blocksByRoomForExpand.get(blk.roomId) ?? [];
    list.push(blk);
    blocksByRoomForExpand.set(blk.roomId, list);
  }
  // Track physical occupancy for virtual placement (including prior virtuals).
  const bookingsByRoomForExpand = new Map<string, CalendarBooking[]>();
  for (const b of mappedBookings) {
    if (!b.roomId) continue;
    if (TERMINAL_FOR_EXPANSION.has(b.status)) continue;
    const list = bookingsByRoomForExpand.get(b.roomId) ?? [];
    list.push(b);
    bookingsByRoomForExpand.set(b.roomId, list);
  }
  const isRoomFreeForBooking = (roomId: string, target: CalendarBooking): boolean => {
    for (const other of bookingsByRoomForExpand.get(roomId) ?? []) {
      if (other.id === target.id) continue;
      if (rangeOverlapsForExpand(target.checkIn, target.checkOut, other.checkIn, other.checkOut)) return false;
    }
    for (const blk of blocksByRoomForExpand.get(roomId) ?? []) {
      if (rangeOverlapsForExpand(target.checkIn, target.checkOut, blk.startDate, blk.endDate)) return false;
    }
    return true;
  };
  const expandedBookings: CalendarBooking[] = [];
  for (const b of mappedBookings) {
    const n = Math.max(1, Number(b.roomsCount) || 1);
    const needsExpansion = n > 1 && !b.groupId && !TERMINAL_FOR_EXPANSION.has(b.status);
    if (!needsExpansion) {
      expandedBookings.push(b);
      continue;
    }
    // Anchor keeps its id; extra units are virtual siblings sharing groupId=b.id so
    // the group accent unifies them and onOpenBooking(groupId) opens the real row.
    // Carry remainder so split totals reconcile to the stored group total.
    const totalMinor = Math.round(Number(b.totalAmount ?? 0));
    const base = Math.floor(totalMinor / n);
    const remainder = totalMinor - base * n;
    const anchorTotal = base + (0 < remainder ? 1 : 0);
    const anchor: CalendarBooking = { ...b, groupId: b.id, roomsCount: 1, totalAmount: anchorTotal, isVirtual: false };
    expandedBookings.push(anchor);
    // Claim anchor's room for subsequent overlap checks
    if (anchor.roomId) {
      const list = bookingsByRoomForExpand.get(anchor.roomId) ?? [];
      // replace the original entry's reference with anchor for overlap probes
      const idx = list.findIndex((x) => x.id === b.id);
      if (idx >= 0) list[idx] = anchor;
      else list.push(anchor);
      bookingsByRoomForExpand.set(anchor.roomId, list);
    }
    const typeRooms = mappedRooms.filter((r) => !b.roomTypeId || r.roomTypeId === b.roomTypeId);
    // Prefer numeric room order for deterministic allocation
    const sortedTypeRooms = [...typeRooms].sort((a, c) => a.roomNumber.localeCompare(c.roomNumber, undefined, { numeric: true }));
    const anchorIsUnassigned = !b.roomId;
    for (let i = 1; i < n; i++) {
      let chosenId: string | null = null;
      let chosenNumber: string | null = null;
      // Unassigned legacy holds stay unassigned — do not auto-place virtuals on the rack.
      if (!anchorIsUnassigned) {
        for (const room of sortedTypeRooms) {
          if (room.id === b.roomId) continue;
          if (!isRoomFreeForBooking(room.id, b)) continue;
          // Already claimed by a prior virtual sibling in this same expansion?
          if (expandedBookings.some((x) => x.roomId === room.id && rangeOverlapsForExpand(b.checkIn, b.checkOut, x.checkIn, x.checkOut) && x.groupId === b.id)) {
            // linear scan over expandedBookings is tiny; reuses virtual claims
            continue;
          }
          chosenId = room.id;
          chosenNumber = room.roomNumber;
          break;
        }
      }
      const perUnitForVirtual = base + (i < remainder ? 1 : 0);
      const virtual: CalendarBooking = {
        ...b,
        id: `${b.id}:v${i}`,
        groupId: b.id,
        roomsCount: 1,
        roomId: chosenId,
        roomNumber: chosenNumber,
        totalAmount: perUnitForVirtual,
        isVirtual: true,
      };
      expandedBookings.push(virtual);
      if (chosenId) {
        const list = bookingsByRoomForExpand.get(chosenId) ?? [];
        list.push(virtual);
        bookingsByRoomForExpand.set(chosenId, list);
      }
    }
  }

  return {
    rooms: mappedRooms,
    roomTypes: mappedRoomTypes,
    bookings: expandedBookings,
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

export interface AvailabilityBlockConflict {
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface AvailabilityCheckResult {
  available: boolean;
  conflicts: AvailabilityConflict[];
  /** H2: reprice_booking_stay does NOT consult availability_blocks, so this
   *  app-layer check is the only enforcement against booking into a blocked
   *  room. Callers must surface these the same way as booking conflicts. */
  blocks: AvailabilityBlockConflict[];
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
    return { available: false, conflicts: [], blocks: [] };
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

  // Overlapping availability blocks (maintenance, owner use, ...). Blocks are
  // stored as [start_date, end_date) with end_date = blocked end day + 1, so
  // the same half-open overlap test applies.
  const { data: blockRows } = await supabase
    .from("availability_blocks")
    .select("start_date, end_date, reason")
    .eq("hotel_id", hotelId)
    .eq("room_id", roomId)
    .lt("start_date", checkOut)
    .gt("end_date", checkIn);

  const mappedBlocks: AvailabilityBlockConflict[] = (blockRows ?? []).map((b) => ({
    startDate: b.start_date as string,
    endDate: b.end_date as string,
    reason: (b.reason as string | null) ?? null,
  }));

  return {
    available: mapped.length === 0 && mappedBlocks.length === 0,
    conflicts: mapped,
    blocks: mappedBlocks,
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
    const { supabase, hotelId, userId } = await getHotelScopedClient();

    // H1: bundled server actions are directly invocable — hiding the toolbar
    // affordance from read_only staff is not a control, the capability check
    // must live here. Mirrors the restrictive bookings UPDATE RLS policy.
    const { role } = await getCurrentStaffRole();
    if (!can(role, "calendar:edit")) {
      return { success: false, error: "You don't have permission to assign rooms" };
    }

    // M9: untrusted client input
    if (!uuidParam.safeParse(bookingId).success || !uuidParam.safeParse(roomId).success) {
      return { success: false, error: "Invalid booking or room" };
    }

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
      // Blocks first: a maintenance block is the more actionable answer than a
      // "booked by" conflict when both overlap.
      const block = availability.blocks[0];
      if (block) {
        const reasonLabel = block.reason ? ` — ${block.reason.replaceAll("_", " ")}` : "";
        return {
          success: false,
          error: `Room is blocked ${block.startDate} → ${block.endDate}${reasonLabel}`,
        };
      }
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
      // If the EXCLUDE constraint or physical room guard caught a race condition
      if (error.message?.includes("bookings_no_room_overlap")) {
        return { success: false, error: "Room is no longer available — another booking was just placed" };
      }
      if (
        error.message?.includes("bookings_no_availability_block_overlap") ||
        error.message?.includes("bookings_physical_room_bookable")
      ) {
        return { success: false, error: "Room is blocked or out of service for those dates" };
      }
      if (error.message?.includes("bookings_physical_room_type_match")) {
        return { success: false, error: "Room type mismatch — this booking requires a different room type" };
      }
      // M7: raw PostgREST text (constraint names, schema internals) must not
      // reach staff — report the detail, return generic copy.
      reportCalendarFailure("assignBookingToRoom: update failed", {
        hotelId,
        bookingId,
        tags: { code: error.code },
        contexts: { supabase: { message: error.message } },
      });
      return { success: false, error: "Could not assign the room — try again" };
    }

    // M5: assignment is an operational event worth an audit trail (moves have
    // one; this path was silent).
    let assignedByStaffId: string | null = null;
    if (userId) {
      const { data: staffProfile } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();
      assignedByStaffId = staffProfile?.id ?? null;
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId: assignedByStaffId,
      action: "booking.room_assigned",
      entityType: "booking",
      entityId: bookingId,
      beforeState: { room_id: booking.room_id },
      afterState: { room_id: roomId },
    });

    return { success: true };
  } catch (err) {
    reportCalendarFailure("assignBookingToRoom: unexpected failure", {
      bookingId,
      contexts: { error: { message: err instanceof Error ? err.message : String(err) } },
    });
    return { success: false, error: "Assignment failed — try again" };
  }
}

// ── Move Booking (drag-and-drop) ──────────────────────────────────────

export type MoveBookingResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Staff-facing copy for a `reprice_booking_stay` rejection. Front desk needs to
 * know what to do next, so the two codes that carry a HINT spend it: the status
 * that closed the stay, and the name of whoever is already in the room.
 */
function moveRejectionMessage(rejection: BookingRejection): string {
  switch (rejection.code) {
    // The room went to someone else between the availability check and the
    // write. Both room-overlap constraints and the room-type inventory guard
    // land here; the old substring match on `bookings_no_room_overlap` caught
    // only the first of the three.
    case "inventory_conflict":
      return "Room is no longer available — another booking was just placed";
    case "room_conflict":
      return rejection.hint
        ? `Room is occupied by ${rejection.hint} for those dates`
        : "Room is occupied for those dates";
    case "booking_not_found":
      return "Booking not found";
    case "booking_not_open":
      return `Cannot move a ${(rejection.hint ?? "closed").replace("_", " ")} booking`;
    case "room_not_bookable":
      return "That room cannot take this stay — check its type and status";
    case "room_type_not_found":
      return "Room type not found";
    case "invalid_date_range":
      return "Check-out must be after check-in";
    case "invalid_rooms_count":
      return "That number of rooms cannot be booked";
    // The target type has no active rate plan at all — the one gap "keep the
    // rate" cannot bridge either, because the plan is the stay's pricing
    // authority, not just its price source.
    case "rate_plan_not_found":
      return "That room type has no active rate plan — create one for it first";
    // The new window has no rate for at least one night, so there is no price to
    // move the stay to. A pricing gap, not a staff mistake.
    case "unpriced_stay":
      return "No rate is set for one or more of those nights — set pricing first";
    default:
      return rejection.message || "Move failed";
  }
}

/**
 * Moves a booking to a different room and/or date range.
 * Used by drag-and-drop move and resize operations.
 * Validates room type compatibility and availability before applying.
 *
 * `roomTypeId` opts in to an explicit room type change (upgrade/downgrade).
 * When provided, the booking's room_type_id is rewritten and the usual
 * "type mismatch" guard is bypassed for the target room.
 *
 * The write itself goes through `reprice_booking_stay`, so the stay's nightly
 * rates, its totals and its payment status are re-derived for the new window in
 * the same transaction that moves it. The guards below stay in front of that
 * call: they enforce the rules the SQL deliberately leaves to the caller (an
 * active room type, the business-date past-date rule, room status) and they
 * produce the copy front desk can act on.
 */
export async function moveBooking(
  bookingId: string,
  updates: {
    roomId?: string;
    checkIn?: string;
    checkOut?: string;
    roomTypeId?: string;
    /** The type-change dialog's "Keep current rate" choice: freeze the booked
     *  price through the move instead of repricing at the target type's rate. */
    keepRates?: boolean;
  }
): Promise<MoveBookingResult> {
  try {
    const { supabase, hotelId, hotel, userId } = await getHotelScopedClient();

    // H1: bundled server actions are directly invocable — the capability check
    // must live server-side, not just in the toolbar. Mirrors the restrictive
    // bookings UPDATE RLS policy.
    const { role } = await getCurrentStaffRole();
    if (!can(role, "calendar:edit")) {
      return { success: false, error: "You don't have permission to move bookings" };
    }

    // M9: untrusted client input
    if (!uuidParam.safeParse(bookingId).success) {
      return { success: false, error: "Invalid booking" };
    }
    if (updates.roomId !== undefined && !uuidParam.safeParse(updates.roomId).success) {
      return { success: false, error: "Invalid room" };
    }
    if (updates.roomTypeId !== undefined && !uuidParam.safeParse(updates.roomTypeId).success) {
      return { success: false, error: "Invalid room type" };
    }
    if (
      (updates.checkIn !== undefined && !isoDateParam.safeParse(updates.checkIn).success) ||
      (updates.checkOut !== undefined && !isoDateParam.safeParse(updates.checkOut).success)
    ) {
      return { success: false, error: "Invalid dates" };
    }

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
        // Blocks first: a maintenance block is the more actionable answer than
        // a booking conflict when both overlap (H2).
        const block = availability.blocks[0];
        if (block) {
          const reasonLabel = block.reason ? ` — ${block.reason.replaceAll("_", " ")}` : "";
          return {
            success: false,
            error: `Room is blocked ${block.startDate} → ${block.endDate}${reasonLabel}`,
          };
        }
        const conflict = availability.conflicts[0];
        return {
          success: false,
          error: `Conflicts with ${conflict.guestName || conflict.reference} (${conflict.checkIn} → ${conflict.checkOut})`,
        };
      }
    }

    // The booking row, its nightly rates and its money move together. A bare
    // `.update()` here left `booking_nights` describing dates the stay no longer
    // occupied and a total priced for the window it had left, so a moved stay
    // could sit marked paid while underpaid. `reprice_booking_stay` re-resolves
    // the nights and rewrites both in one transaction, or rejects and leaves
    // every one of them as it was.
    //
    // Key *presence* is the instruction: an absent key means "leave this field
    // alone" and `room_id: null` means "unassign". Never normalise an unsent
    // field to null, or `{ room_id: updates.roomId ?? null }` would quietly turn
    // every date-only move into an unassignment.
    const repriced = await repriceBookingStay({
      booking_id: bookingId,
      hotel_id: hotelId,
      ...(updates.roomId !== undefined ? { room_id: newRoomId } : {}),
      ...(updates.checkIn !== undefined ? { check_in: newCheckIn } : {}),
      ...(updates.checkOut !== undefined ? { check_out: newCheckOut } : {}),
      ...(typeChangeRequested ? { room_type_id: updates.roomTypeId as string } : {}),
      ...(updates.keepRates ? { keep_rates: true } : {}),
    });

    if (!repriced.ok) {
      // Three of the codes cannot be reached from here: this action always sends
      // both ids and has already resolved the hotel, and `unknown` means the
      // function raised something no caller has a name for. They are bugs rather
      // than front-desk mistakes, so they are reported. The rest are ordinary
      // operational answers and would only be noise.
      const { code, sqlstate, message, hint } = repriced.rejection;
      if (code === "invalid_payload" || code === "hotel_not_found" || code === "unknown") {
        captureIssue(`reprice_booking_stay rejected: ${code}`, {
          scope: "server-action",
          hotelId,
          bookingId,
          level: "error",
          tags: { rejection: code, sqlstate },
          contexts: { rejection: { message, hint } },
        });
      }
      return { success: false, error: moveRejectionMessage(repriced.rejection) };
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

    await writeAuditLog(supabase, {
      hotelId,
      staffId: movedByStaffId,
      action: typeChangeRequested ? "booking.room_type_change" : "booking.move",
      entityType: "booking",
      entityId: bookingId,
      // The function's own snapshots, taken either side of the write under the
      // row lock it held, so the trail records the money the move actually cost
      // rather than the fields the caller happened to send.
      beforeState: repriced.stay.before,
      afterState: {
        ...repriced.stay.after,
        nights_kept: repriced.stay.nights_kept,
        type_changed: repriced.stay.type_changed,
      },
    });

    return { success: true };
  } catch (err) {
    reportCalendarFailure("moveBooking: unexpected failure", {
      bookingId,
      contexts: { error: { message: err instanceof Error ? err.message : String(err) } },
    });
    return { success: false, error: "Move failed — try again" };
  }
}

// ── Move Price Preview (room-type change dialog) ────────────────────────────

export type RoomTypeMovePreview = {
  currency: string;
  /** Nights in the window being previewed. */
  nights: number;
  /** The booking's current total, minor units. */
  currentTotalMinor: number;
  /** Total if repriced at the target type's rate; null when unpriceable. */
  repriceTotalMinor: number | null;
  /** Hand-priced nights inside the window that a reprice would overwrite. */
  manualNights: number;
  /** Nights with no usable rate at the target type — a reprice would reject. */
  unpricedNights: number;
  /** The target type has no active rate plan, so even a keep-rate move rejects. */
  noRatePlan: boolean;
};

export type PreviewRoomTypeMoveResult =
  | { success: true; preview: RoomTypeMovePreview }
  | { success: false; error: string };

/**
 * Quotes the two ways a room-type move can land, so the calendar dialog offers
 * the industry-standard choice instead of repricing blindly: keep the booked
 * rate (every in-window night frozen) or reprice at the new type's rate. The
 * numbers come from the same plan resolver, the same nightly-rates resolver
 * and the same tax formula `reprice_booking_stay` uses, so the previewed
 * reprice total is the total the move will store.
 *
 * Advisory only: the move re-derives everything under the booking's row lock,
 * so a rate change between preview and confirm can still shift the outcome.
 */
export async function previewRoomTypeMove(
  bookingId: string,
  toRoomTypeId: string,
  checkIn: string,
  checkOut: string
): Promise<PreviewRoomTypeMoveResult> {
  try {
    const { supabase, hotelId, hotel } = await getHotelScopedClient();

    // Same capability as the move itself — a preview still reads folio money.
    const { role } = await getCurrentStaffRole();
    if (!can(role, "calendar:edit")) {
      return { success: false, error: "You don't have permission to move bookings" };
    }

    if (!uuidParam.safeParse(bookingId).success || !uuidParam.safeParse(toRoomTypeId).success) {
      return { success: false, error: "Invalid booking or room type" };
    }
    if (!isoDateParam.safeParse(checkIn).success || !isoDateParam.safeParse(checkOut).success) {
      return { success: false, error: "Invalid dates" };
    }
    if (checkOut <= checkIn) {
      return { success: false, error: "Check-out must be after check-in" };
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, room_type_id, rate_plan_id, status, rooms_count, total_amount, currency")
      .eq("id", bookingId)
      .eq("hotel_id", hotelId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status === "cancelled" || booking.status === "checked_out" || booking.status === "no_show") {
      return { success: false, error: `Cannot move a ${booking.status} booking` };
    }

    const currency = booking.currency ?? hotel.currency ?? "GHS";

    // Occupancy is historical pricing input carried on the nights; mirror the
    // function's read so the quote prices the same occupancy the move would.
    const { data: nightRow } = await supabase
      .from("booking_nights")
      .select("occupancy")
      .eq("booking_id", bookingId)
      .limit(1)
      .maybeSingle();

    // Hand-priced nights inside the new window: what a reprice would overwrite.
    const { count: manualNights } = await supabase
      .from("booking_nights")
      .select("stay_date", { count: "exact", head: true })
      .eq("booking_id", bookingId)
      .eq("source", "manual")
      .gte("stay_date", checkIn)
      .lt("stay_date", checkOut);

    // The plan the stay would re-anchor to — the same resolver the write path
    // and the quote path are pinned to. Not yet in the generated types, hence
    // the cast (same gap fetchNightlyRates documents).
    const planRpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
      fn: "effective_rate_plan_id",
      params: { p_hotel_id: string; p_room_type_id: string; p_rate_plan_id: string | null }
    ) => Promise<{ data: string | null; error: { message: string } | null }>;
    const { data: planId, error: planError } = await planRpc("effective_rate_plan_id", {
      p_hotel_id: hotelId,
      p_room_type_id: toRoomTypeId,
      p_rate_plan_id: booking.rate_plan_id,
    });
    if (planError) throw new Error(`effective_rate_plan_id failed: ${planError.message}`);

    const nights = differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));

    const preview: RoomTypeMovePreview = {
      currency,
      nights,
      currentTotalMinor: toMinor(Number(booking.total_amount ?? 0), currency),
      repriceTotalMinor: null,
      manualNights: manualNights ?? 0,
      unpricedNights: 0,
      noRatePlan: !planId,
    };

    // No plan on the target type: the move rejects as rate_plan_not_found
    // whichever price choice the operator makes — the dialog needs to know.
    if (!planId) return { success: true, preview };

    const rates = await fetchNightlyRates({
      p_hotel_id: hotelId,
      p_room_type_ids: [toRoomTypeId],
      p_from: checkIn,
      p_to: checkOut,
      p_rate_plan_id: planId,
      p_occupancy: nightRow?.occupancy ?? 0,
    });

    const pricedDates = new Set(
      rates.filter((r) => Number(r.rate_minor) > 0).map((r) => r.stay_date)
    );
    preview.unpricedNights = Math.max(0, nights - pricedDates.size);

    if (preview.unpricedNights === 0) {
      const subtotalMinor =
        rates.reduce((sum, r) => sum + Number(r.rate_minor), 0) *
        Math.max(1, Number(booking.rooms_count ?? 1));

      // Tax exactly as reprice_booking_stay computes it: enabled flag plus a
      // percentage turned into basis points on the subtotal. The two must
      // never disagree about what a stay costs.
      const { data: hotelRow } = await supabase
        .from("hotels")
        .select("settings")
        .eq("id", hotelId)
        .single();
      const settings = (hotelRow?.settings ?? {}) as {
        tax_enabled?: boolean;
        tax_percentage?: number;
      };
      const taxBps =
        settings.tax_enabled === true && typeof settings.tax_percentage === "number"
          ? percentToBps(settings.tax_percentage)
          : 0;
      preview.repriceTotalMinor = subtotalMinor + applyBps(subtotalMinor, taxBps);
    }

    return { success: true, preview };
  } catch (err) {
    reportCalendarFailure("previewRoomTypeMove: unexpected failure", {
      bookingId,
      contexts: { error: { message: err instanceof Error ? err.message : String(err) } },
    });
    return { success: false, error: "Could not preview the move — try again" };
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
    const { supabase, hotelId, userId } = await getHotelScopedClient();

    // H1: bundled server actions are directly invocable — capability check
    // must live server-side. Mirrors the restrictive bookings UPDATE RLS policy.
    const { role } = await getCurrentStaffRole();
    if (!can(role, "calendar:edit")) {
      return { success: false, error: "You don't have permission to unassign rooms" };
    }

    if (!uuidParam.safeParse(bookingId).success) {
      return { success: false, error: "Invalid booking" };
    }

    // M5: guard the status before clearing room_id — unassigning a finished or
    // cancelled stay wipes the room attribution its audit trail relies on.
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, room_id")
      .eq("id", bookingId)
      .eq("hotel_id", hotelId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status === "cancelled" || booking.status === "checked_out" || booking.status === "no_show") {
      return { success: false, error: `Cannot unassign a ${booking.status} booking` };
    }

    const { error } = await supabase
      .from("bookings")
      .update({ room_id: null })
      .eq("id", bookingId)
      .eq("hotel_id", hotelId);

    if (error) {
      reportCalendarFailure("unassignBooking: update failed", {
        hotelId,
        bookingId,
        tags: { code: error.code },
        contexts: { supabase: { message: error.message } },
      });
      return { success: false, error: "Could not unassign the room — try again" };
    }

    let unassignedByStaffId: string | null = null;
    if (userId) {
      const { data: staffProfile } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();
      unassignedByStaffId = staffProfile?.id ?? null;
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId: unassignedByStaffId,
      action: "booking.room_unassigned",
      entityType: "booking",
      entityId: bookingId,
      beforeState: { room_id: booking.room_id },
      afterState: { room_id: null },
    });

    return { success: true };
  } catch (err) {
    reportCalendarFailure("unassignBooking: unexpected failure", {
      bookingId,
      contexts: { error: { message: err instanceof Error ? err.message : String(err) } },
    });
    return { success: false, error: "Unassign failed — try again" };
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

    // M9: untrusted client input. Caps mirror the CHECK constraints in
    // 20260923120000_bookings_role_gates.sql.
    const parsedReason = blockReasonParam.safeParse(reason);
    const parsedNotes = blockNotesParam.safeParse(notes);
    if (
      !uuidParam.safeParse(roomId).success ||
      !isoDateParam.safeParse(startDate).success ||
      !isoDateParam.safeParse(endDate).success ||
      !parsedReason.success ||
      !parsedNotes.success
    ) {
      return { success: false, error: "Invalid block details" };
    }
    if (endDate < startDate) {
      return { success: false, error: "End date must be on or after the start date" };
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

    // H2: a block over nights with active reservations leaves guests booked
    // into a room marked out of service. Reject and name the first conflict so
    // staff can move or cancel it first.
    const { data: overlapping } = await supabase
      .from("bookings")
      .select("id, reference, check_in, check_out")
      .eq("hotel_id", hotelId)
      .eq("room_id", roomId)
      .in("status", ["pending", "confirmed", "checked_in"])
      .lt("check_in", storedRange.endDate)
      .gt("check_out", storedRange.startDate)
      .order("check_in", { ascending: true })
      .limit(3);

    if (overlapping && overlapping.length > 0) {
      const first = overlapping[0];
      const count = overlapping.length >= 3 ? "3+" : `${overlapping.length}`;
      return {
        success: false,
        error: `Room has ${count} reservation(s) in this window — first: ${first.reference} (${first.check_in} → ${first.check_out}). Move or cancel it first.`,
      };
    }

    const { error } = await supabase
      .from("availability_blocks")
      .insert({
        hotel_id: hotelId,
        room_id: roomId,
        start_date: storedRange.startDate,
        end_date: storedRange.endDate,
        reason: parsedReason.data,
        notes: parsedNotes.data && parsedNotes.data.length > 0 ? parsedNotes.data : null,
        created_by: createdByStaffId,
      });

    if (error) {
      reportCalendarFailure("createAvailabilityBlock: insert failed", {
        hotelId,
        tags: { code: error.code },
        contexts: { supabase: { message: error.message } },
      });
      return { success: false, error: "Could not create the block — try again" };
    }

    await writeAuditLog(supabase, {
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
    reportCalendarFailure("createAvailabilityBlock: unexpected failure", {
      contexts: { error: { message: err instanceof Error ? err.message : String(err) } },
    });
    return { success: false, error: "Failed to create block" };
  }
}
/**
 * Updates an existing availability block's dates, reason and notes (H6).
 * Same permission as creating (front desk+); removal stays manager+.
 */
export async function updateAvailabilityBlock(
  blockId: string,
  updates: { startDate: string; endDate: string; reason: string; notes: string | null }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, hotelId, userId } = await getHotelScopedClient();

    const { canBlock } = await getCurrentStaffRole();
    if (!canBlock) {
      return { success: false, error: "You don't have permission to edit blocks" };
    }

    const parsedReason = blockReasonParam.safeParse(updates.reason);
    const parsedNotes = blockNotesParam.safeParse(updates.notes);
    if (
      !uuidParam.safeParse(blockId).success ||
      !isoDateParam.safeParse(updates.startDate).success ||
      !isoDateParam.safeParse(updates.endDate).success ||
      !parsedReason.success ||
      !parsedNotes.success
    ) {
      return { success: false, error: "Invalid block details" };
    }
    if (updates.endDate < updates.startDate) {
      return { success: false, error: "End date must be on or after the start date" };
    }

    // Fetch the existing block (hotel-scoped) for the room id and audit trail.
    const { data: existing } = await supabase
      .from("availability_blocks")
      .select("id, room_id, start_date, end_date, reason, notes")
      .eq("id", blockId)
      .eq("hotel_id", hotelId)
      .single();

    if (!existing) return { success: false, error: "Block not found" };

    const storedRange = toStoredBlockRange(updates.startDate, updates.endDate);

    // Same guard as createAvailabilityBlock (H2): never stretch a block over
    // an active reservation.
    const { data: overlapping } = await supabase
      .from("bookings")
      .select("id, reference, check_in, check_out")
      .eq("hotel_id", hotelId)
      .eq("room_id", existing.room_id)
      .in("status", ["pending", "confirmed", "checked_in"])
      .lt("check_in", storedRange.endDate)
      .gt("check_out", storedRange.startDate)
      .order("check_in", { ascending: true })
      .limit(3);

    if (overlapping && overlapping.length > 0) {
      const first = overlapping[0];
      const count = overlapping.length >= 3 ? "3+" : `${overlapping.length}`;
      return {
        success: false,
        error: `Room has ${count} reservation(s) in this window — first: ${first.reference} (${first.check_in} → ${first.check_out}). Move or cancel it first.`,
      };
    }

    const { error } = await supabase
      .from("availability_blocks")
      .update({
        start_date: storedRange.startDate,
        end_date: storedRange.endDate,
        reason: parsedReason.data,
        notes: parsedNotes.data && parsedNotes.data.length > 0 ? parsedNotes.data : null,
      })
      .eq("id", blockId)
      .eq("hotel_id", hotelId);

    if (error) {
      reportCalendarFailure("updateAvailabilityBlock: update failed", {
        hotelId,
        tags: { code: error.code },
        contexts: { supabase: { message: error.message } },
      });
      return { success: false, error: "Could not update the block — try again" };
    }

    let updatedByStaffId: string | null = null;
    if (userId) {
      const { data: staffProfile } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();
      updatedByStaffId = staffProfile?.id ?? null;
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId: updatedByStaffId,
      action: "room.block_updated",
      entityType: "room",
      entityId: existing.room_id,
      beforeState: {
        block_id: blockId,
        block_range: `${existing.start_date} → ${existing.end_date}`,
        reason: existing.reason,
        notes: existing.notes,
      },
      afterState: {
        block_id: blockId,
        block_range: `${storedRange.startDate} → ${storedRange.endDate}`,
        reason: parsedReason.data,
        notes: parsedNotes.data,
      },
    });

    return { success: true };
  } catch (err) {
    reportCalendarFailure("updateAvailabilityBlock: unexpected failure", {
      contexts: { error: { message: err instanceof Error ? err.message : String(err) } },
    });
    return { success: false, error: "Failed to update block" };
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

    if (fetchError) {
      // PostgREST signals "no row matched" with PGRST116 on .single() — that
      // is a staff-facing answer, everything else is a bug to report (M7).
      if (fetchError.code === "PGRST116") {
        return { success: false, error: "Block not found" };
      }
      reportCalendarFailure("deleteAvailabilityBlock: delete failed", {
        hotelId,
        tags: { code: fetchError.code },
        contexts: { supabase: { message: fetchError.message } },
      });
      return { success: false, error: "Could not remove the block — try again" };
    }

    await writeAuditLog(supabase, {
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
    reportCalendarFailure("deleteAvailabilityBlock: unexpected failure", {
      contexts: { error: { message: err instanceof Error ? err.message : String(err) } },
    });
    return { success: false, error: "Failed to remove block" };
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
