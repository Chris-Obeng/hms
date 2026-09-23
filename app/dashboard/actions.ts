"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { requireMinRole } from "@/lib/auth";

// ── Get Hotel ID Helper ────────────────────────────────────────

async function getHotelScopedClient() {
  const { orgId, userId } = await auth();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel, error: hotelError } = await supabase
    .from("hotels")
    .select("id, name, currency, logo_url")
    .eq("clerk_org_id", orgId)
    .limit(1)
    .maybeSingle();

  if (hotelError) throw new Error(`DB error fetching hotel: ${hotelError.message}`);
  if (!hotel) throw new Error("Hotel not found");

  // Resolve current staff for audit logs
  const { data: staffProfile } = userId
    ? await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .eq("clerk_user_id", userId)
        .eq("clerk_org_id", orgId)
        .maybeSingle()
    : { data: null };

  return {
    supabase,
    hotelId: hotel.id,
    hotel,
    staffId: staffProfile?.id ?? null,
    staffName: staffProfile?.full_name ?? null,
  };
}

// ── Check In ───────────────────────────────────────────────────

export async function checkInBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireMinRole("front_desk", "check guests in");
    const { supabase, hotelId, staffId, staffName } = await getHotelScopedClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, reference, status, room_id")
      .eq("id", bookingId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "confirmed") return { success: false, error: "Booking cannot be checked in" };

    const { error } = await supabase
      .from("bookings")
      .update({ status: "checked_in", check_in_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (error) return { success: false, error: error.message };

    if (booking.room_id) {
      await supabase.from("rooms").update({ status: "occupied" }).eq("id", booking.room_id);
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId,
      staffName,
      action: "booking.checked_in",
      entityType: "booking",
      entityId: bookingId,
      afterState: { reference: booking.reference, status: "checked_in" },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Check-in failed" };
  }
}

// ── Check Out ──────────────────────────────────────────────────

export async function checkOutBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireMinRole("front_desk", "check guests out");
    const { supabase, hotelId, staffId, staffName } = await getHotelScopedClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, reference, status, room_id")
      .eq("id", bookingId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "checked_in") return { success: false, error: "Booking is not checked in" };

    const { error } = await supabase
      .from("bookings")
      .update({ status: "checked_out", check_out_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (error) return { success: false, error: error.message };

    if (booking.room_id) {
      await supabase.from("rooms").update({ status: "available" }).eq("id", booking.room_id);
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId,
      staffName,
      action: "booking.checked_out",
      entityType: "booking",
      entityId: bookingId,
      afterState: { reference: booking.reference, status: "checked_out" },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Check-out failed" };
  }
}
