"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";

// ── Schemas ──────────────────────────────────────────────────────────

const NewBookingSchema = z.object({
  // Guest
  guestId: z.string().uuid().optional(),
  guestName: z.string().min(1, "Guest name is required"),
  guestEmail: z.string().email().optional().or(z.literal("")),
  guestPhone: z.string().optional().or(z.literal("")),

  // Booking
  roomTypeId: z.string().uuid("Room type is required"),
  roomId: z.string().uuid().optional(), // optional: direct room assignment (calendar)
  checkIn: z.string().min(1, "Check-in date is required"),
  checkOut: z.string().min(1, "Check-out date is required"),
  adults: z.coerce.number().int().min(1).default(1),
  children: z.coerce.number().int().min(0).default(0),
  roomRate: z.coerce.number().min(0),
  subtotal: z.coerce.number().min(0),
  taxAmount: z.coerce.number().min(0).default(0),
  totalAmount: z.coerce.number().min(0),
  estimatedArrival: z.string().optional().or(z.literal("")),
  specialRequests: z.string().optional().or(z.literal("")),
  source: z.enum(["direct", "manual", "phone", "walk_in"]),
  paymentPreference: z.enum(["pay_now", "pay_at_checkin"]),
  internalNotes: z.string().optional().or(z.literal("")),
});

export type NewBookingInput = z.infer<typeof NewBookingSchema>;

// ── Reference Generation ─────────────────────────────────────────────

async function generateReference(supabase: Awaited<ReturnType<typeof createClient>>, hotelId: string): Promise<string> {
  const year = format(new Date(), "yyyy");

  // Get the latest reference for this hotel this year
  const { data: lastBooking } = await supabase
    .from("bookings")
    .select("reference")
    .eq("hotel_id", hotelId)
    .like("reference", `HOP-${year}-%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let nextNum = 1;
  if (lastBooking?.reference) {
    const parts = lastBooking.reference.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  return `HOP-${year}-${String(nextNum).padStart(5, "0")}`;
}

// ── Create Booking ───────────────────────────────────────────────────

export type CreateBookingResult =
  | { success: true; bookingId: string; reference: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createBooking(
  formData: NewBookingInput
): Promise<CreateBookingResult> {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return { success: false, error: "Not authenticated" };
    }

    const parsed = NewBookingSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      return {
        success: false,
        error: "Validation failed",
        fieldErrors,
      };
    }

    const data = parsed.data;
    const supabase = await createClient();

    // Get hotel ID
    const { data: hotel } = await supabase
      .from("hotels")
      .select("id, currency")
      .eq("clerk_org_id", orgId)
      .single();

    if (!hotel) {
      return { success: false, error: "Hotel not found" };
    }

    const hotelId = hotel.id;

    // Check room type exists
    const { data: roomType } = await supabase
      .from("room_types")
      .select("id, name, base_price")
      .eq("id", data.roomTypeId)
      .eq("hotel_id", hotelId)
      .single();

    if (!roomType) {
      return { success: false, error: "Room type not found" };
    }

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
      // Try to find existing guest by email or phone
      if (data.guestEmail) {
        const { data: existingGuest } = await supabase
          .from("guests")
          .select("id")
          .eq("hotel_id", hotelId)
          .eq("email", data.guestEmail)
          .maybeSingle();

        if (existingGuest) {
          guestId = existingGuest.id;
        }
      }

      if (!guestId && data.guestPhone) {
        const { data: existingGuest } = await supabase
          .from("guests")
          .select("id")
          .eq("hotel_id", hotelId)
          .eq("phone", data.guestPhone)
          .maybeSingle();

        if (existingGuest) {
          guestId = existingGuest.id;
        }
      }

      // Create new guest if not found
      if (!guestId) {
        const { data: newGuest, error: guestError } = await supabase
          .from("guests")
          .insert({
            hotel_id: hotelId,
            full_name: data.guestName,
            email: data.guestEmail || null,
            phone: data.guestPhone || null,
          })
          .select("id")
          .single();

        if (guestError || !newGuest) {
          return { success: false, error: "Failed to create guest" };
        }

        guestId = newGuest.id;
      }
    }

    // Generate reference
    const reference = await generateReference(supabase, hotelId);

    const checkInStr = format(checkIn, "yyyy-MM-dd");
    const checkOutStr = format(checkOut, "yyyy-MM-dd");

    // ── Room availability check ─────────────────────────────────────
    // If a specific room is requested, verify type compatibility and availability
    if (data.roomId) {
      const { data: room } = await supabase
        .from("rooms")
        .select("id, room_type_id, status")
        .eq("id", data.roomId)
        .eq("hotel_id", hotelId)
        .single();

      if (!room) {
        return { success: false, error: "Room not found" };
      }
      if (room.status === "maintenance" || room.status === "out_of_service") {
        return { success: false, error: `Room is ${room.status.replace("_", " ")}` };
      }
      if (room.room_type_id !== data.roomTypeId) {
        return { success: false, error: "Room type mismatch" };
      }

      // Check for overlapping bookings on this room
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
        return {
          success: false,
          error: `Room already booked by ${conflict.guests?.full_name || conflict.reference} (${conflict.check_in} → ${conflict.check_out})`,
        };
      }
    }

    // Create booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        hotel_id: hotelId,
        reference,
        guest_id: guestId,
        room_type_id: data.roomTypeId,
        room_id: data.roomId || null,
        check_in: checkInStr,
        check_out: checkOutStr,
        adults: data.adults,
        children: data.children,
        room_rate: data.roomRate,
        subtotal: data.subtotal,
        tax_amount: data.taxAmount,
        total_amount: data.totalAmount,
        estimated_arrival: data.estimatedArrival || null,
        special_requests: data.specialRequests || null,
        source: data.source,
        payment_preference: data.paymentPreference,
        status: "confirmed",
        payment_status: data.paymentPreference === "pay_at_checkin" ? "unpaid" : "unpaid",
        internal_notes: data.internalNotes || null,
      })
      .select("id, reference")
      .single();

    if (bookingError || !booking) {
      return {
        success: false,
        error: `Failed to create booking: ${bookingError?.message || "Unknown error"}`,
      };
    }

    // If a room was assigned, update room status
    // (room assignment handled separately)

    return {
      success: true,
      bookingId: booking.id,
      reference: booking.reference,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

// ── Update Booking Status ────────────────────────────────────────────

export async function updateBookingStatus(
  bookingId: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { orgId } = await auth();
    if (!orgId) return { success: false, error: "Not authenticated" };

    const supabase = await createClient();

    // Resolve hotel_id for defense-in-depth scoping
    const { data: hotel } = await supabase
      .from("hotels")
      .select("id")
      .eq("clerk_org_id", orgId)
      .single();

    if (!hotel) return { success: false, error: "Hotel not found" };

    const { error } = await supabase
      .from("bookings")
      .update({
        status,
        ...(status === "checked_in" ? { check_in_at: new Date().toISOString() } : {}),
        ...(status === "checked_out" ? { check_out_at: new Date().toISOString() } : {}),
        ...(status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
      })
      .eq("id", bookingId)
      .eq("hotel_id", hotel.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}
