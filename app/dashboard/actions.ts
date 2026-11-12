"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { requireMinRole, toActionError } from "@/lib/auth";

const uuidSchema = z.string().uuid();

// ── Check In ───────────────────────────────────────────────────

export async function checkInBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  if (!uuidSchema.safeParse(bookingId).success) {
    return { success: false, error: "Invalid booking ID" };
  }
  try {
    const ctx = await requireMinRole("front_desk", "check guests in");
    const supabase = await createClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, reference, status, room_id")
      .eq("id", bookingId)
      .eq("hotel_id", ctx.hotelId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "confirmed") return { success: false, error: "Booking cannot be checked in" };

    const { error } = await supabase
      .from("bookings")
      .update({ status: "checked_in", check_in_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("hotel_id", ctx.hotelId);

    if (error) return { success: false, error: error.message };

    if (booking.room_id) {
      const { error: roomError } = await supabase
        .from("rooms")
        .update({ status: "occupied" })
        .eq("id", booking.room_id)
        .eq("hotel_id", ctx.hotelId)
        .in("status", ["available", "occupied"]);
      if (roomError) return { success: false, error: roomError.message };
    }

    await writeAuditLog(supabase, {
      hotelId: ctx.hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "booking.checked_in",
      entityType: "booking",
      entityId: bookingId,
      afterState: { reference: booking.reference, status: "checked_in" },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/rooms");
    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "dashboard.checkInBooking", bookingId });
  }
}

// ── Check Out ──────────────────────────────────────────────────

export async function checkOutBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  if (!uuidSchema.safeParse(bookingId).success) {
    return { success: false, error: "Invalid booking ID" };
  }
  try {
    const ctx = await requireMinRole("front_desk", "check guests out");
    const supabase = await createClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, reference, status, room_id")
      .eq("id", bookingId)
      .eq("hotel_id", ctx.hotelId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "checked_in") return { success: false, error: "Booking is not checked in" };

    const { error } = await supabase
      .from("bookings")
      .update({ status: "checked_out", check_out_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("hotel_id", ctx.hotelId);

    if (error) return { success: false, error: error.message };

    if (booking.room_id) {
      const { count: otherActiveCount, error: countError } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", ctx.hotelId)
        .eq("room_id", booking.room_id)
        .eq("status", "checked_in")
        .neq("id", bookingId);
      if (countError) return { success: false, error: countError.message };

      if ((otherActiveCount ?? 0) === 0) {
        const { error: roomError } = await supabase
          .from("rooms")
          .update({ status: "available" })
          .eq("id", booking.room_id)
          .eq("hotel_id", ctx.hotelId)
          .eq("status", "occupied");
        if (roomError) return { success: false, error: roomError.message };
      }
    }

    await writeAuditLog(supabase, {
      hotelId: ctx.hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "booking.checked_out",
      entityType: "booking",
      entityId: bookingId,
      afterState: { reference: booking.reference, status: "checked_out" },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/rooms");
    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "dashboard.checkOutBooking", bookingId });
  }
}
