"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Helpers ──────────────────────────────────────────────────────────

async function getHotelScopedClient() {
  const { orgId } = await auth();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) throw new Error("Hotel not found");

  return { supabase, hotelId: hotel.id, hotel };
}

// ── Types ────────────────────────────────────────────────────────────

export interface HousekeepingRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomTypeId: string;
  roomTypeName: string;
  status: string;
  isActive: boolean;
  notes: string | null;
  hasArrivalToday: boolean;
  hasDepartureToday: boolean;
  isVip: boolean;
  guestName: string | null;
}

export interface HousekeepingData {
  rooms: HousekeepingRoom[];
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

// ── Get Housekeeping Data ────────────────────────────────────────────

export async function getHousekeepingData(): Promise<
  | { success: true; data: HousekeepingData }
  | { success: false; error: string }
> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();
    const today = new Date().toISOString().split("T")[0];

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

    // Fetch today's bookings to check arrivals, departures, VIP status, guest names
    const { data: todayBookings } = await supabase
      .from("bookings")
      .select(`
        id, room_id, check_in, check_out, status,
        guests(full_name)
      `)
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"]);

    // Build a map of room_id → booking info
    const bookingByRoom = new Map<string, { guestName: string | null; checkIn: string; checkOut: string; status: string | null }>();
    for (const b of todayBookings || []) {
      if (b.room_id) {
        bookingByRoom.set(b.room_id, {
          guestName: (b.guests as any)?.full_name || null,
          checkIn: b.check_in,
          checkOut: b.check_out,
          status: b.status,
        });
      }
    }

    const mappedRooms: HousekeepingRoom[] = (rooms || []).map((r) => {
      const booking = bookingByRoom.get(r.id);
      return {
        id: r.id,
        roomNumber: r.room_number,
        floor: r.floor,
        roomTypeId: (r.room_types as any).id,
        roomTypeName: (r.room_types as any).name,
        status: r.status || "available",
        isActive: r.is_active || false,
        notes: r.notes,
        hasArrivalToday: booking?.checkIn === today && booking?.status !== "checked_in",
        hasDepartureToday: booking?.checkOut === today,
        isVip: false, // VIP flag can be extended later
        guestName: booking?.guestName ?? null,
      };
    });

    // Compute stats
    const stats = {
      dirty: mappedRooms.filter((r) => r.status === "checkout_pending").length,
      cleaning: mappedRooms.filter((r) => r.status === "cleaning").length,
      inspected: 0, // inspected status not in DB yet — can be added as a migration
      ready: mappedRooms.filter((r) => r.status === "available").length,
      occupied: mappedRooms.filter((r) => r.status === "occupied").length,
      maintenance: mappedRooms.filter((r) => r.status === "maintenance").length,
      outOfService: mappedRooms.filter((r) => r.status === "out_of_service").length,
      totalRooms: mappedRooms.length,
    };

    const todayDepartures = mappedRooms.filter((r) => r.hasDepartureToday).length;
    const todayArrivals = mappedRooms.filter((r) => r.hasArrivalToday).length;

    return {
      success: true,
      data: {
        rooms: mappedRooms,
        stats,
        todayDepartures,
        todayArrivals,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch housekeeping data",
    };
  }
}

// ── Update Room Status ──────────────────────────────────────────────

export async function updateHousekeepingStatus(
  roomId: string,
  status: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();

    const validStatuses = [
      "available", "occupied", "checkout_pending",
      "cleaning", "maintenance", "out_of_service",
    ];

    if (!validStatuses.includes(status)) {
      return { success: false, error: `Invalid status: ${status}` };
    }

    const { error } = await supabase
      .from("rooms")
      .update({ status })
      .eq("id", roomId)
      .eq("hotel_id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/housekeeping");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update room status",
    };
  }
}

// ── Bulk Update Room Statuses (for drag-to-column) ──────────────────

export async function bulkUpdateHousekeepingStatus(
  updates: { roomId: string; status: string }[]
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();

    const validStatuses = [
      "available", "occupied", "checkout_pending",
      "cleaning", "maintenance", "out_of_service",
    ];

    // Validate ALL updates before applying any (atomicity)
    for (const update of updates) {
      if (!validStatuses.includes(update.status)) {
        return { success: false, error: `Invalid status: ${update.status}` };
      }
    }

    // Batch same-status updates into a single query when possible
    const byStatus = new Map<string, string[]>();
    for (const update of updates) {
      const existing = byStatus.get(update.status) || [];
      existing.push(update.roomId);
      byStatus.set(update.status, existing);
    }

    for (const [status, roomIds] of byStatus) {
      const { error } = await supabase
        .from("rooms")
        .update({ status })
        .in("id", roomIds)
        .eq("hotel_id", hotelId);

      if (error) return { success: false, error: error.message };
    }

    revalidatePath("/dashboard/housekeeping");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update room statuses",
    };
  }
}
