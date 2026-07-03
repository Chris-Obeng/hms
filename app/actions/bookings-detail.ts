"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { notifyBookingCancelled, notifyPaymentReceived } from "@/lib/arkesel";
import { requireAuth, requireMinRole, toActionError } from "@/lib/auth";

// ── Get Hotel ID Helper ──────────────────────────────────────────

async function getHotelScopedClient() {
  const ctx = await requireAuth();
  const supabase = await createClient();
  return {
    supabase,
    hotelId: ctx.hotelId,
    hotel: ctx.hotel,
    orgId: ctx.orgId,
    userId: ctx.userId,
    staffId: ctx.staffId,
    staffName: ctx.staffName,
  };
}

// ── Types ────────────────────────────────────────────────────────

export interface PaymentRecord {
  id: string;
  bookingId: string;
  amount: number;
  method: string | null;
  status: string | null;
  notes: string | null;
  paidAt: string | null;
  createdAt: string | null;
  recordedByName?: string | null;
}

export interface FullBookingDetail {
  id: string;
  reference: string;
  status: string | null;
  paymentStatus: string | null;
  paymentPreference: string | null;
  source: string | null;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  adults: number | null;
  children: number | null;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number | null;
  roomRate: number | null;
  subtotal: number;
  taxAmount: number | null;
  currency: string | null;
  estimatedArrival: string | null;
  specialRequests: string | null;
  internalNotes: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  guest: {
    id: string | null;
    fullName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  room: {
    id: string | null;
    roomNumber: string | null;
    floor: string | null;
  } | null;
  roomType: {
    id: string | null;
    name: string | null;
  } | null;
  payments: PaymentRecord[];
  createdBy: {
    id: string | null;
    fullName: string | null;
  } | null;
}

// ── Get Full Booking Detail ──────────────────────────────────────

export async function getFullBookingDetail(
  bookingId: string
): Promise<{ success: true; booking: FullBookingDetail } | { success: false; error: string }> {
  try {
    const { supabase, hotelId } = await getHotelScopedClient();

    // Fetch booking with all relations
    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        `
        id, reference, status, payment_status, payment_preference, source,
        check_in, check_out, nights, adults, children,
        total_amount, amount_paid, outstanding_balance, room_rate,
        subtotal, tax_amount, currency,
        estimated_arrival, special_requests, internal_notes,
        check_in_at, check_out_at, cancelled_at, cancellation_reason,
        created_at, updated_at,
        created_by,
        guests(id, full_name, email, phone),
        rooms(id, room_number, floor),
        room_types(id, name)
      `
      )
      .eq("id", bookingId)
      .eq("hotel_id", hotelId)
      .single();

    if (error || !booking) {
      return { success: false, error: error?.message || "Booking not found" };
    }

    // Fetch payments for this booking
    const { data: payments } = await supabase
      .from("payments")
      .select(
        `
        id, booking_id, amount, method, status, notes,
        paid_at, created_at,
        recorded_by
      `
      )
      .eq("booking_id", bookingId)
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false });

    // Resolve staff names for payments
    const recordedByIds = (payments || [])
      .map((p) => p.recorded_by)
      .filter(Boolean) as string[];

    let staffMap = new Map<string, string>();
    if (recordedByIds.length > 0) {
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .in("id", recordedByIds);

      for (const s of staff || []) {
        if (s.full_name) staffMap.set(s.id, s.full_name);
      }
    }

    // Resolve created_by name
    let createdByName: string | null = null;
    if (booking.created_by) {
      const { data: creator } = await supabase
        .from("staff_profiles")
        .select("full_name")
        .eq("id", booking.created_by)
        .single();
      createdByName = creator?.full_name || null;
    }

    const mappedPayments: PaymentRecord[] = (payments || []).map((p) => ({
      id: p.id,
      bookingId: p.booking_id,
      amount: p.amount,
      method: p.method,
      status: p.status,
      notes: p.notes,
      paidAt: p.paid_at,
      createdAt: p.created_at,
      recordedByName: p.recorded_by ? staffMap.get(p.recorded_by) || null : null,
    }));

    const result: FullBookingDetail = {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      paymentStatus: booking.payment_status,
      paymentPreference: booking.payment_preference,
      source: booking.source,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      nights: booking.nights,
      adults: booking.adults,
      children: booking.children,
      totalAmount: booking.total_amount,
      amountPaid: booking.amount_paid || 0,
      outstandingBalance: booking.outstanding_balance,
      roomRate: booking.room_rate,
      subtotal: booking.subtotal,
      taxAmount: booking.tax_amount,
      currency: booking.currency,
      estimatedArrival: booking.estimated_arrival,
      specialRequests: booking.special_requests,
      internalNotes: booking.internal_notes,
      checkInAt: booking.check_in_at,
      checkOutAt: booking.check_out_at,
      cancelledAt: booking.cancelled_at,
      cancellationReason: booking.cancellation_reason,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      guest: booking.guests
        ? {
            id: (booking.guests as { id?: string | null }).id ?? null,
            fullName: (booking.guests as { full_name?: string | null }).full_name ?? null,
            email: (booking.guests as { email?: string | null }).email ?? null,
            phone: (booking.guests as { phone?: string | null }).phone ?? null,
          }
        : null,
      room: booking.rooms
        ? {
            id: (booking.rooms as { id?: string | null }).id ?? null,
            roomNumber: (booking.rooms as { room_number?: string | null }).room_number ?? null,
            floor: (booking.rooms as { floor?: string | null }).floor ?? null,
          }
        : null,
      roomType: booking.room_types
        ? {
            id: (booking.room_types as { id?: string | null }).id ?? null,
            name: (booking.room_types as { name?: string | null }).name ?? null,
          }
        : null,
      payments: mappedPayments,
      createdBy: {
        id: booking.created_by,
        fullName: createdByName,
      },
    };

    return { success: true, booking: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch booking details",
    };
  }
}

// ── Record Payment ───────────────────────────────────────────────

const RecordPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.coerce.number().positive("Amount must be positive"),
  method: z.enum(["cash", "pos", "bank_transfer", "mobile_money", "card", "other"]),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

export async function recordPayment(
  input: RecordPaymentInput
): Promise<{ success: true; paymentId: string } | { success: false; error: string }> {
  try {
    // front_desk and above can record payments
    await requireMinRole("front_desk", "record payments");

    const parsed = RecordPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid input" };
    }

    const { supabase, hotelId, hotel, orgId, userId, staffId, staffName } = await getHotelScopedClient();
    const data = parsed.data;

    // Verify booking exists and belongs to this hotel
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, total_amount, amount_paid, status")
      .eq("id", data.bookingId)
      .eq("hotel_id", hotelId)
      .single();

    if (!booking) return { success: false, error: "Booking not found" };

    // Reject payments for cancelled or checked-out bookings
    if (booking.status === "cancelled" || booking.status === "checked_out") {
      return { success: false, error: "Cannot record payment for a cancelled or checked-out booking" };
    }

    // Resolve staff profile ID for recorded_by
    const { data: staffProfile } = await supabase
      .from("staff_profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single();

    if (!staffProfile) {
      return { success: false, error: "Staff profile not found — cannot record payment" };
    }

    // Insert payment and atomically increment amount_paid in one DB transaction,
    // eliminating the read-modify-write race that could drop concurrent payments.
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc("record_payment_atomic", {
        p_hotel_id:    hotelId,
        p_booking_id:  data.bookingId,
        p_amount:      data.amount,
        p_method:      data.method,
        p_notes:       data.notes || "",
        p_currency:    hotel.currency || "GHS",
        p_recorded_by: staffProfile.id,
      });

    if (rpcError || !rpcResult?.[0]?.payment_id) {
      return { success: false, error: rpcError?.message || "Failed to record payment" };
    }

    const payment = { id: rpcResult[0].payment_id as string };

    // Audit log
    await writeAuditLog(supabase, {
      hotelId,
      staffId,
      staffName,
      action: "payment.recorded",
      entityType: "booking",
      entityId: data.bookingId,
      afterState: { amount: data.amount, method: data.method, payment_id: payment.id },
    });

    // Arkesel email receipt to guest
    const { data: fullBooking } = await supabase
      .from("bookings")
      .select("reference, total_amount, amount_paid, outstanding_balance, guests(full_name, email)")
      .eq("id", data.bookingId)
      .single();

    if (fullBooking) {
      await notifyPaymentReceived(
        {
          hotelName: hotel.name,
          currency: hotel.currency,
          notificationsEnabled: hotel.settings.sms_notifications_enabled !== false,
        },
        {
          guestName: (fullBooking.guests as { full_name?: string | null } | null)?.full_name ?? "Guest",
          guestEmail: (fullBooking.guests as { email?: string | null } | null)?.email,
          reference: fullBooking.reference,
          amountPaid: data.amount,
          outstandingBalance: Number(fullBooking.outstanding_balance ?? 0),
        }
      );
    }

    revalidatePath("/dashboard");
    return { success: true, paymentId: payment.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record payment",
    };
  }
}

// ── Update Booking Internal Notes ────────────────────────────────

const UpdateNotesSchema = z.object({
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export async function updateBookingNotes(
  bookingId: string,
  input: z.infer<typeof UpdateNotesSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = UpdateNotesSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid input" };
    }

    const { supabase, hotelId } = await getHotelScopedClient();

    const { error } = await supabase
      .from("bookings")
      .update({ internal_notes: parsed.data.notes || null })
      .eq("id", bookingId)
      .eq("hotel_id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update notes",
    };
  }
}

// ── Get Staff Role for Permission Gating ─────────────────────────

export type StaffRoleInfo = {
  role: string;
  canEdit: boolean;
  canManageStaff: boolean;
  canManageSettings: boolean;
};

export async function getCurrentUserRole(): Promise<StaffRoleInfo> {
  try {
    const { orgId, userId } = await auth();
    if (!orgId || !userId) {
      return { role: "pending", canEdit: false, canManageStaff: false, canManageSettings: false };
    }

    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("role, is_active")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single();

    if (!profile || !profile.is_active) {
      return { role: "pending", canEdit: false, canManageStaff: false, canManageSettings: false };
    }

    const role = profile.role || "pending";
    const canEdit = role === "super_admin" || role === "manager" || role === "front_desk";
    const canManageStaff = role === "super_admin";
    const canManageSettings = role === "super_admin";

    return { role, canEdit, canManageStaff, canManageSettings };
  } catch {
    return { role: "pending", canEdit: false, canManageStaff: false, canManageSettings: false };
  }
}
