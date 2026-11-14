"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { requireMinRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { notifyHotelStaff } from "@/lib/notifications/notify-hotel-staff";
import { buildPaymentReceivedNotification } from "@/lib/notifications/staff-notifications";

// ── Get Hotel ID Helper ──────────────────────────────────────────

async function getHotelScopedClient(
  minRole: "read_only" | "front_desk" | "manager" | "super_admin" = "read_only",
  action = "view booking details"
) {
  const ctx = await requireMinRole(minRole, action);
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
  // Set only on grouped reservations, so N split rows aren't opaque duplicates.
  lineReference?: string | null;
  roomLabel?: string | null;
}

/** One sibling room-line of a reservation group. */
export interface GroupLineItem {
  id: string;
  reference: string;
  roomTypeName: string | null;
  roomNumber: string | null;
  roomsCount: number | null;
  adults: number | null;
  children: number | null;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  roomRate: number | null;
  subtotal: number;
  taxAmount: number | null;
  /** Kept for nights not used after an early check-out (part of totalAmount). */
  earlyDepartureFee: number;
  totalAmount: number;
  amountPaid: number;
  outstanding: number;
  paymentStatus: string | null;
  status: string | null;
}

/** Group-level aggregate: the reservation total is the SUM across sibling rows. */
export interface BookingGroupSummary {
  total: number;
  amountPaid: number;
  outstanding: number;
  subtotal: number;
  taxAmount: number;
  earlyDepartureFee: number;
  totalRooms: number;
  lines: GroupLineItem[];
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
  /** Kept for nights not used after an early check-out (part of totalAmount). */
  earlyDepartureFee: number;
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
  // Reservation-group awareness. groupId NULL = ordinary single-room booking,
  // group stays null, and every field below behaves exactly as before.
  groupId: string | null;
  roomsCount: number | null;
  group: BookingGroupSummary | null;
}

// ── Get Full Booking Detail ──────────────────────────────────────

export async function getFullBookingDetail(
  bookingId: string
): Promise<{ success: true; booking: FullBookingDetail } | { success: false; error: string }> {
  const parsed = z.string().uuid().safeParse(bookingId);
  if (!parsed.success) return { success: false, error: "Invalid booking id" };
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
        subtotal, tax_amount, early_departure_fee, currency,
        estimated_arrival, special_requests, internal_notes,
        check_in_at, check_out_at, cancelled_at, cancellation_reason,
        created_at, updated_at,
        created_by, group_id, rooms_count,
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

    // ── Reservation group ────────────────────────────────────────
    // A multi-room reservation is N sibling `bookings` rows sharing one group_id.
    // Group money is the SUM across siblings; a single-room booking (group_id NULL)
    // skips this entirely and payments below read exactly its own row.
    const groupId = (booking.group_id as string | null) ?? null;
    let group: BookingGroupSummary | null = null;
    let siblingIds: string[] = [bookingId];
    if (groupId) {
      const { data: siblings } = await supabase
        .from("bookings")
        .select(
          `
          id, reference, rooms_count, adults, children,
          check_in, check_out, nights, room_rate, subtotal, tax_amount, early_departure_fee,
          total_amount, amount_paid, outstanding_balance, payment_status, status,
          room_types(name), rooms(room_number)
        `
        )
        .eq("group_id", groupId)
        .eq("hotel_id", hotelId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      const rows = siblings ?? [];
      if (rows.length > 0) {
        siblingIds = rows.map((r) => r.id);
        const lines: GroupLineItem[] = rows.map((r) => {
          const total = r.total_amount ?? 0;
          const paid = r.amount_paid ?? 0;
          return {
            id: r.id,
            reference: r.reference,
            roomTypeName: (r.room_types as { name?: string | null } | null)?.name ?? null,
            roomNumber: (r.rooms as { room_number?: string | null } | null)?.room_number ?? null,
            roomsCount: r.rooms_count,
            adults: r.adults,
            children: r.children,
            checkIn: r.check_in,
            checkOut: r.check_out,
            nights: r.nights,
            roomRate: r.room_rate,
            subtotal: r.subtotal ?? 0,
            taxAmount: r.tax_amount,
            earlyDepartureFee: Number(r.early_departure_fee ?? 0),
            totalAmount: total,
            amountPaid: paid,
            outstanding: r.outstanding_balance ?? Math.max(0, total - paid),
            paymentStatus: r.payment_status,
            status: r.status,
          };
        });
        // A cancelled line is void revenue; a checked-out line is settled and
        // uncollectable here. Charge totals exclude cancelled; "due" excludes
        // both, so it matches exactly what this panel can still collect.
        const isCancelled = (l: GroupLineItem) => l.status === "cancelled";
        const isTerminal = (l: GroupLineItem) =>
          l.status === "cancelled" || l.status === "checked_out";
        group = {
          total: lines.reduce((s, l) => s + (isCancelled(l) ? 0 : l.totalAmount), 0),
          amountPaid: lines.reduce((s, l) => s + (isCancelled(l) ? 0 : l.amountPaid), 0),
          outstanding: lines.reduce((s, l) => s + (isTerminal(l) ? 0 : l.outstanding), 0),
          subtotal: lines.reduce((s, l) => s + (isCancelled(l) ? 0 : l.subtotal), 0),
          taxAmount: lines.reduce((s, l) => s + (isCancelled(l) ? 0 : l.taxAmount ?? 0), 0),
          earlyDepartureFee: lines.reduce((s, l) => s + (isCancelled(l) ? 0 : l.earlyDepartureFee), 0),
          totalRooms: lines.reduce((s, l) => s + Math.max(1, l.roomsCount ?? 1), 0),
          lines,
        };
      }
    }

    // Fetch payments across every line of the group (single row when ungrouped).
    const { data: payments } = await supabase
      .from("payments")
      .select(
        `
        id, booking_id, amount, method, status, notes,
        paid_at, created_at,
        recorded_by
      `
      )
      .in("booking_id", siblingIds)
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false });

    // Resolve staff names for payments
    const recordedByIds = (payments || [])
      .map((p) => p.recorded_by)
      .filter(Boolean) as string[];

    // One lookup for both roles: payment "recorded_by" and the booking creator
    // share staff_profiles, so a single .in() replaces two round-trips.
    const staffIds = new Set(recordedByIds);
    if (booking.created_by) staffIds.add(booking.created_by);

    const staffMap = new Map<string, string>();
    if (staffIds.size > 0) {
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .in("id", [...staffIds]);

      for (const s of staff || []) {
        if (s.full_name) staffMap.set(s.id, s.full_name);
      }
    }

    const createdByName = booking.created_by
      ? staffMap.get(booking.created_by) ?? null
      : null;

    // Per-line attribution so a group's split payment rows aren't opaque dupes.
    const lineMeta = new Map<string, { reference: string; roomLabel: string | null }>();
    if (group) {
      for (const l of group.lines) {
        lineMeta.set(l.id, { reference: l.reference, roomLabel: l.roomTypeName });
      }
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
      lineReference: group ? lineMeta.get(p.booking_id)?.reference ?? null : null,
      roomLabel: group ? lineMeta.get(p.booking_id)?.roomLabel ?? null : null,
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
      earlyDepartureFee: Number(booking.early_departure_fee ?? 0),
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
      groupId,
      roomsCount: booking.rooms_count,
      group,
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

    const { supabase, hotelId, hotel, orgId, userId, staffId, staffName } =
      await getHotelScopedClient("front_desk", "record payment");
    const data = parsed.data;

    // Verify booking exists and belongs to this hotel
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, total_amount, amount_paid, status, guests(full_name), room_types(name)")
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

    const guestRel = booking.guests as { full_name?: string | null } | { full_name?: string | null }[] | null;
    const roomRel = booking.room_types as { name?: string | null } | { name?: string | null }[] | null;
    const guestName = (Array.isArray(guestRel) ? guestRel[0] : guestRel)?.full_name ?? null;
    const roomName = (Array.isArray(roomRel) ? roomRel[0] : roomRel)?.name ?? null;
    const nextPaid = Number(booking.amount_paid ?? 0) + data.amount;
    const remainingBalance = Math.max(0, Number(booking.total_amount ?? 0) - nextPaid);
    const payCopy = buildPaymentReceivedNotification({
      amount: data.amount,
      currency: hotel.currency || "GHS",
      guestName,
      roomLabel: roomName,
      remainingBalance,
      method: data.method,
      actorName: staffName,
    });

    void notifyHotelStaff({
      hotelId,
      clerkOrgId: orgId,
      type: "payment_received",
      prefKey: "payment_received",
      title: payCopy.title,
      message: payCopy.message,
      bookingId: data.bookingId,
      excludeStaffId: staffProfile.id,
    });

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

    const { supabase, hotelId } = await getHotelScopedClient(
      "front_desk",
      "update booking internal notes"
    );

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
    const canEdit = can(role, "booking:edit");
    const canManageStaff = can(role, "staff:manage");
    const canManageSettings = can(role, "settings:manage");

    return { role, canEdit, canManageStaff, canManageSettings };
  } catch {
    return { role: "pending", canEdit: false, canManageStaff: false, canManageSettings: false };
  }
}
