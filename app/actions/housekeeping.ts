"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAuth, requireMinRole, toActionError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

// ── Helpers ──────────────────────────────────────────────────────────

async function getHotelScopedClient(
  minRole?: "front_desk" | "manager" | "super_admin",
  actionName?: string
) {
  const ctx =
    minRole && actionName
      ? await requireMinRole(minRole, actionName)
      : await requireAuth();

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency")
    .eq("clerk_org_id", ctx.orgId)
    .single();

  if (!hotel) throw new Error("Hotel not found");

  return { supabase, hotelId: hotel.id, hotel, ctx };
}

// ── Types ────────────────────────────────────────────────────────────

/**
 * Occupancy status derived from booking data for a given date.
 * Mirrors Little Hotelier terminology.
 */
export type RoomOccupancyStatus =
  | "occupied"          // Guest is staying (check_in < date < check_out)
  | "check_in_only"     // Guest checks in on this date
  | "check_out_only"    // Guest checks out on this date
  | "check_in_out"      // Same-day turnover
  | "unoccupied";       // No active booking

/** Cleaning / housekeeping status stored in rooms.status */
export type CleaningStatus =
  | "available"         // Clean & ready
  | "occupied"          // Occupied (auto-managed, room is in use)
  | "checkout_pending"  // Dirty — needs cleaning after checkout
  | "cleaning"          // Currently being cleaned
  | "maintenance"       // Under maintenance
  | "out_of_service";   // Out of service

export interface HousekeepingRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomTypeId: string;
  roomTypeName: string;
  /** Cleaning/housekeeping status stored on rooms.status */
  cleaningStatus: CleaningStatus;
  /** Occupancy status derived from bookings for the given date */
  occupancyStatus: RoomOccupancyStatus;
  isActive: boolean;
  notes: string | null;
  /** Adults staying this night (from booking) */
  adults: number;
  /** Children staying this night (from booking) */
  children: number;
  /** Infants staying this night — not in DB, always 0 */
  infants: number;
  /** True if a guest checks in on this date */
  hasArrivalToday: boolean;
  /** True if a guest checks out on this date */
  hasDepartureToday: boolean;
  isVip: boolean;
  guestName: string | null;
}

export interface HousekeepingData {
  rooms: HousekeepingRoom[];
  /** The date this report was generated for (ISO date string YYYY-MM-DD) */
  reportDate: string;
  /** ISO timestamp of when the data was last fetched */
  lastUpdated: string;
  stats: {
    dirty: number;
    cleaning: number;
    inspected: number;
    ready: number;
    occupied: number;
    maintenance: number;
    outOfService: number;
    totalRooms: number;
  };
  todayDepartures: number;
  todayArrivals: number;
}

// ── Derive occupancy status ──────────────────────────────────────────

function deriveOccupancyStatus(
  booking: { checkIn: string; checkOut: string; status: string | null } | undefined,
  arrivalToday: boolean,
  departureToday: boolean
): RoomOccupancyStatus {
  if (!booking) return "unoccupied";

  if (arrivalToday && departureToday) return "check_in_out";
  if (arrivalToday) return "check_in_only";
  if (departureToday) return "check_out_only";

  if (
    booking.status === "checked_in" ||
    (booking.status === "confirmed" && !arrivalToday)
  ) {
    return "occupied";
  }

  return "unoccupied";
}

// ── Get Housekeeping Data ────────────────────────────────────────────

/**
 * Fetches housekeeping data for a given date (defaults to today).
 * `date` is an ISO date string: YYYY-MM-DD
 */
export async function getHousekeepingData(
  date?: string
): Promise<{ success: true; data: HousekeepingData } | { success: false; error: string }> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();
    const reportDate = date ?? new Date().toISOString().split("T")[0];

    // Fetch all active rooms with their room types
    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select(`
        id, room_number, floor, status, is_active, notes,
        room_types!inner(id, name)
      `)
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("room_number", { ascending: true });

    if (roomsError) return { success: false, error: roomsError.message };

    // Fetch bookings relevant to the report date.
    // A booking is relevant if check_in <= reportDate < check_out (guest is staying)
    // OR check_in = reportDate (arriving) OR check_out = reportDate (departing).
    const { data: dateBookings } = await supabase
      .from("bookings")
      .select(`
        id, room_id, check_in, check_out, status,
        adults, children,
        guests(full_name)
      `)
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", reportDate)
      .gte("check_out", reportDate);

    // Priority: checked_in beats confirmed for same room
    const STATUS_PRIORITY: Record<string, number> = {
      checked_in: 2,
      confirmed: 1,
    };

    const bookingByRoom = new Map<
      string,
      {
        guestName: string | null;
        checkIn: string;
        checkOut: string;
        status: string | null;
        adults: number;
        children: number;
      }
    >();

    // Track arriving guests separately to avoid mixing with departing guest names
    const arrivingRooms = new Map<
      string,
      {
        guestName: string | null;
        adults: number;
        children: number;
      }
    >();
    const departingRooms = new Set<string>();

    for (const b of dateBookings || []) {
      if (!b.room_id) continue;

      const isArrival = b.check_in === reportDate && b.status === "confirmed";
      const isDeparture = b.check_out === reportDate && b.status === "checked_in";

      if (isArrival) {
        arrivingRooms.set(b.room_id, {
          guestName: (b.guests as any)?.full_name || null,
          adults: b.adults ?? 0,
          children: b.children ?? 0,
        });
      }
      if (isDeparture) {
        departingRooms.add(b.room_id);
      }

      const existing = bookingByRoom.get(b.room_id);
      const newPriority = STATUS_PRIORITY[b.status || ""] || 0;
      const existingPriority = existing
        ? STATUS_PRIORITY[existing.status || ""] || 0
        : 0;

      if (!existing || newPriority >= existingPriority) {
        bookingByRoom.set(b.room_id, {
          guestName: (b.guests as any)?.full_name || null,
          checkIn: b.check_in,
          checkOut: b.check_out,
          status: b.status,
          adults: b.adults ?? 0,
          children: b.children ?? 0,
        });
      }
    }

    const mappedRooms: HousekeepingRoom[] = (rooms || []).map((r) => {
      const booking = bookingByRoom.get(r.id);
      const arrival = arrivingRooms.get(r.id);
      const hasArrivalToday = !!arrival;
      const hasDepartureToday = departingRooms.has(r.id);

      const occupancyStatus = deriveOccupancyStatus(
        booking
          ? { checkIn: booking.checkIn, checkOut: booking.checkOut, status: booking.status }
          : undefined,
        hasArrivalToday,
        hasDepartureToday
      );

      // Guest name: prefer arriving guest; fallback to current occupant
      const guestName = hasArrivalToday
        ? (arrival?.guestName ?? null)
        : booking?.status === "checked_in"
        ? (booking?.guestName ?? null)
        : null;

      // Adults & children: if hasArrivalToday is true, prefer the arriving booking's counts
      const adults = hasArrivalToday
        ? (arrival?.adults ?? 0)
        : booking?.adults ?? 0;
      const children = hasArrivalToday
        ? (arrival?.children ?? 0)
        : booking?.children ?? 0;

      return {
        id: r.id,
        roomNumber: r.room_number,
        floor: r.floor,
        roomTypeId: (r.room_types as any).id,
        roomTypeName: (r.room_types as any).name,
        cleaningStatus: (r.status as CleaningStatus) || "available",
        occupancyStatus,
        isActive: r.is_active || false,
        notes: r.notes,
        adults,
        children,
        infants: 0,
        hasArrivalToday,
        hasDepartureToday,
        isVip: false,
        guestName,
      };
    });

    const stats = {
      dirty: mappedRooms.filter((r) => r.cleaningStatus === "checkout_pending").length,
      cleaning: mappedRooms.filter((r) => r.cleaningStatus === "cleaning").length,
      inspected: 0,
      ready: mappedRooms.filter((r) => r.cleaningStatus === "available").length,
      occupied: mappedRooms.filter(
        (r) => r.occupancyStatus !== "unoccupied"
      ).length,
      maintenance: mappedRooms.filter((r) => r.cleaningStatus === "maintenance").length,
      outOfService: mappedRooms.filter(
        (r) => r.cleaningStatus === "out_of_service"
      ).length,
      totalRooms: mappedRooms.length,
    };

    return {
      success: true,
      data: {
        rooms: mappedRooms,
        reportDate,
        lastUpdated: new Date().toISOString(),
        stats,
        todayDepartures: mappedRooms.filter((r) => r.hasDepartureToday).length,
        todayArrivals: mappedRooms.filter((r) => r.hasArrivalToday).length,
      },
    };
  } catch (err) {
    return toActionError(err);
  }
}

// ── Update Cleaning Status ──────────────────────────────────────────

const VALID_CLEANING_STATUSES: CleaningStatus[] = [
  "available",
  "occupied",
  "checkout_pending",
  "cleaning",
  "maintenance",
  "out_of_service",
];

export async function updateCleaningStatus(
  roomId: string,
  status: CleaningStatus
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId, ctx } = await getHotelScopedClient(
      "front_desk",
      "update room cleaning status"
    );

    if (!VALID_CLEANING_STATUSES.includes(status)) {
      return { success: false, error: `Invalid status: ${status}` };
    }

    const { data: before } = await supabase
      .from("rooms")
      .select("room_number, status")
      .eq("id", roomId)
      .eq("hotel_id", hotelId)
      .single();

    if (!before) return { success: false, error: "Room not found" };

    const { error } = await supabase
      .from("rooms")
      .update({ status })
      .eq("id", roomId)
      .eq("hotel_id", hotelId);

    if (error) return { success: false, error: error.message };

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "room.status_changed",
      entityType: "room",
      entityId: roomId,
      beforeState: { room_number: before.room_number, status: before.status },
      afterState: { room_number: before.room_number, status },
    });

    revalidatePath("/dashboard/housekeeping");
    return { success: true };
  } catch (err) {
    return toActionError(err);
  }
}

// ── Update Room Status (legacy alias kept for kanban board) ──────────

export async function updateHousekeepingStatus(
  roomId: string,
  status: string
): Promise<{ success: true } | { success: false; error: string }> {
  return updateCleaningStatus(roomId, status as CleaningStatus);
}

// ── Update Room Note ────────────────────────────────────────────────

export async function updateRoomNote(
  roomId: string,
  note: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId, ctx } = await getHotelScopedClient(
      "front_desk",
      "update room note"
    );

    // Sanitise: trim whitespace, cap at 500 chars
    const sanitisedNote = note.trim().slice(0, 500) || null;

    const { data: before } = await supabase
      .from("rooms")
      .select("room_number, notes")
      .eq("id", roomId)
      .eq("hotel_id", hotelId)
      .single();

    if (!before) return { success: false, error: "Room not found" };

    const { error } = await supabase
      .from("rooms")
      .update({ notes: sanitisedNote })
      .eq("id", roomId)
      .eq("hotel_id", hotelId);

    if (error) return { success: false, error: error.message };

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "room.note_updated",
      entityType: "room",
      entityId: roomId,
      beforeState: { room_number: before.room_number, notes: before.notes },
      afterState: { room_number: before.room_number, notes: sanitisedNote },
    });

    revalidatePath("/dashboard/housekeeping");
    return { success: true };
  } catch (err) {
    return toActionError(err);
  }
}

// ── Bulk Update Cleaning Statuses ───────────────────────────────────

export async function bulkUpdateHousekeepingStatus(
  updates: { roomId: string; status: string }[]
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId, ctx } = await getHotelScopedClient(
      "front_desk",
      "bulk update room housekeeping status"
    );

    for (const update of updates) {
      if (!VALID_CLEANING_STATUSES.includes(update.status as CleaningStatus)) {
        return { success: false, error: `Invalid status: ${update.status}` };
      }
    }

    const roomIds = updates.map((u) => u.roomId);
    const { data: beforeRooms } = await supabase
      .from("rooms")
      .select("id, room_number, status")
      .in("id", roomIds)
      .eq("hotel_id", hotelId);

    const { error: rpcError } = await supabase.rpc("bulk_update_room_statuses", {
      p_hotel_id: hotelId,
      p_updates: updates.map((u) => ({ room_id: u.roomId, status: u.status })),
    });

    if (rpcError) return { success: false, error: rpcError.message };

    if (beforeRooms) {
      for (const before of beforeRooms) {
        const update = updates.find((u) => u.roomId === before.id);
        if (update) {
          await writeAuditLog(supabase, {
            hotelId,
            staffId: ctx.staffId,
            staffName: ctx.staffName,
            action: "room.status_changed",
            entityType: "room",
            entityId: before.id,
            beforeState: { room_number: before.room_number, status: before.status },
            afterState: { room_number: before.room_number, status: update.status },
          });
        }
      }
    }

    revalidatePath("/dashboard/housekeeping");
    return { success: true };
  } catch (err) {
    return toActionError(err);
  }
}
