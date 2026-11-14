"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requireMinRole, toActionError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { businessToday } from "@/lib/business-date";
import {
  isEarlyDeparture,
  parseEarlyDeparturePreview,
  parseEarlyDepartureResult,
  type EarlyDeparturePolicy,
  type EarlyDeparturePreview,
  type EarlyDepartureResult,
} from "@/lib/bookings/early-departure";

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

const unusedNightsSchema = z.enum(["charge", "release"]);

export type CheckOutResult = {
  success: boolean;
  error?: string;
  /** Present when the guest left before their booked departure. */
  early?: EarlyDepartureResult;
};

/**
 * Checks a guest out. Before the booked departure, the stay is shortened to
 * today (see lib/bookings/early-departure.ts) and `unusedNights` overrides the
 * hotel's early-departure policy for this stay.
 */
export async function checkOutBooking(
  bookingId: string,
  options: { unusedNights?: EarlyDeparturePolicy } = {}
): Promise<CheckOutResult> {
  if (!uuidSchema.safeParse(bookingId).success) {
    return { success: false, error: "Invalid booking ID" };
  }
  if (options.unusedNights !== undefined && !unusedNightsSchema.safeParse(options.unusedNights).success) {
    return { success: false, error: "Choose what happens to the unused nights" };
  }
  try {
    const ctx = await requireMinRole("front_desk", "check guests out");
    const supabase = await createClient();

    const [{ data: booking }, { data: hotel }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, reference, status, room_id, check_in, check_out, amount_paid, currency")
        .eq("id", bookingId)
        .eq("hotel_id", ctx.hotelId)
        .single(),
      supabase.from("hotels").select("timezone").eq("id", ctx.hotelId).single(),
    ]);

    if (!booking) return { success: false, error: "Booking not found" };
    if (booking.status !== "checked_in") return { success: false, error: "Booking is not checked in" };

    const today = businessToday(hotel?.timezone || "UTC");

    // Shortens the stay and checks out in one transaction. Service role: the
    // function writes nights and money, which staff cannot write directly.
    // "not_early" means the business day turned over since the read.
    const state: { early?: EarlyDepartureResult; shortened: boolean } = { shortened: false };
    const checkOutEarly = async (): Promise<"done" | "not_early" | "failed"> => {
      const { data, error } = await supabaseAdmin.rpc("check_out_early", {
        p_booking_id: bookingId,
        p_hotel_id: ctx.hotelId,
        ...(options.unusedNights ? { p_unused_nights: options.unusedNights } : {}),
      });
      if (error) {
        if (error.details === "not_early") return "not_early";
        console.error("[checkOutBooking:check_out_early]", error);
        return "failed";
      }
      state.shortened = true;
      // The check-out is committed: never fail the action on an unexpected
      // result shape, or the room and audit steps below would be skipped.
      try {
        state.early = parseEarlyDepartureResult(data);
      } catch (parseError) {
        console.error("[checkOutBooking:parse]", parseError, data);
      }
      return "done";
    };

    let outcome: "done" | "not_early" | "failed" = "not_early";

    if (isEarlyDeparture(booking.check_in, booking.check_out, today)) {
      outcome = await checkOutEarly();
      if (outcome === "failed") {
        return { success: false, error: "Could not check out early. Refresh and try again." };
      }
    }

    if (outcome === "not_early") {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "checked_out", check_out_at: new Date().toISOString() })
        .eq("id", bookingId)
        .eq("hotel_id", ctx.hotelId);

      if (error) {
        // The database decides what "early" means; if it says this guest is
        // leaving early after all (time zone or midnight), shorten the stay.
        if (error.details !== "early_departure") return { success: false, error: error.message };
        if ((await checkOutEarly()) !== "done") {
          return { success: false, error: "Could not check out early. Refresh and try again." };
        }
      }
    }

    const { early, shortened } = state;

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
      action: shortened ? "booking.early_checkout" : "booking.checked_out",
      entityType: "booking",
      entityId: bookingId,
      beforeState: early ? { reference: booking.reference, check_out: early.checkOutBefore } : undefined,
      afterState: early
        ? {
            reference: booking.reference,
            status: "checked_out",
            check_out: early.checkOutAfter,
            nights_released: early.nightsReleased,
            unused_nights: early.policy === "charge" ? "charged as early departure fee" : "released from the bill",
            ...(early.earlyDepartureFee > 0 ? { early_departure_fee: early.earlyDepartureFee } : {}),
          }
        : { reference: booking.reference, status: "checked_out", ...(shortened ? { stay_shortened: true } : {}) },
    });

    if (early && early.overpaid > 0) {
      // The hotel hands the money back in person; Oriel never starts a
      // Paystack refund. Staff then record it on the booking (recordRefund).
      const amount = `${early.currency} ${early.overpaid.toFixed(2)}`;
      const why =
        early.policy === "release"
          ? "checked out early and the unused nights were taken off the bill"
          : "checked out early";
      const reference = booking.reference;
      after(async () => {
        try {
          const { alertOncePerBooking } = await import("@/lib/bookings/confirm-online-payment");
          await alertOncePerBooking(
            ctx.hotelId,
            bookingId,
            "payment_failed",
            `early-checkout-refund:${bookingId}`,
            `Refund due (${reference})`,
            `The guest on ${reference} ${why}. They have paid ${amount} more than the new total. Give it back to them, then record the refund on the booking.`
          );
        } catch (e) {
          console.error("[checkOutBooking:refund-review]", e);
        }
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/rooms");
    return { success: true, ...(early ? { early } : {}) };
  } catch (err) {
    return toActionError(err, { action: "dashboard.checkOutBooking", bookingId });
  }
}

/**
 * What checking this guest out now would do to their stay and bill, both
 * ways. `null` when they are not leaving early.
 */
export async function previewEarlyCheckout(
  bookingId: string
): Promise<{ success: true; preview: EarlyDeparturePreview | null } | { success: false; error: string }> {
  if (!uuidSchema.safeParse(bookingId).success) {
    return { success: false, error: "Invalid booking ID" };
  }
  try {
    const ctx = await requireMinRole("front_desk", "check guests out");
    const { data, error } = await supabaseAdmin.rpc("preview_early_check_out", {
      p_booking_id: bookingId,
      p_hotel_id: ctx.hotelId,
    });
    if (error) {
      console.error("[previewEarlyCheckout]", error);
      return { success: false, error: "Could not work out the early check-out. Refresh and try again." };
    }
    return { success: true, preview: parseEarlyDeparturePreview(data) };
  } catch (err) {
    return toActionError(err, { action: "dashboard.previewEarlyCheckout", bookingId });
  }
}
