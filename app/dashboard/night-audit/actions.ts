"use server";

import { getHotelScope, requireMinRole, toActionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { format, startOfDay, endOfDay } from "date-fns";
import { writeAuditLog } from "@/lib/audit";
import {
  computeNightAuditSummary,
  type NightAuditSummary,
} from "@/lib/metrics/night-audit-math";

export type { NightAuditSummary };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve + sanitize the requested audit date. Future dates clamp to today. */
function resolveDate(dateStr?: string): Date {
  const today = new Date();
  if (dateStr && DATE_RE.test(dateStr)) {
    const parsed = new Date(dateStr + "T00:00:00");
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= startOfDay(today).getTime()) {
      return parsed;
    }
  }
  return today;
}

export async function getNightAuditData(dateStr?: string): Promise<NightAuditSummary> {
  const { supabase, hotelId, hotel } = await getHotelScope();
  const targetDate = resolveDate(dateStr);
  const dayStr = format(targetDate, "yyyy-MM-dd");
  const dayStart = startOfDay(targetDate).toISOString();
  const dayEnd = endOfDay(targetDate).toISOString();

  const [
    roomsRes,
    pendingArrivalsRes,
    pendingDeparturesRes,
    inHouseRes,
    todayPaymentsRes,
    occupiedBookingsRes,
    auditLogRes,
  ] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, status")
      .eq("hotel_id", hotelId)
      .eq("is_active", true),
    supabase
      .from("bookings")
      .select("id, reference, guests(full_name), rooms(room_number)")
      .eq("hotel_id", hotelId)
      .eq("check_in", dayStr)
      .eq("status", "confirmed")
      .order("reference", { ascending: true }),
    supabase
      .from("bookings")
      .select("id, reference, guests(full_name), rooms(room_number)")
      .eq("hotel_id", hotelId)
      .eq("check_out", dayStr)
      .eq("status", "checked_in")
      .order("reference", { ascending: true }),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("status", "checked_in")
      .lte("check_in", dayStr)
      .gte("check_out", dayStr),
    supabase
      .from("payments")
      .select("amount, method")
      .eq("hotel_id", hotelId)
      .eq("status", "success")
      .gte("paid_at", dayStart)
      .lte("paid_at", dayEnd),
    supabase
      .from("bookings")
      .select("total_amount, nights")
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", dayStr)
      .gte("check_out", dayStr),
    // First close-of-day entry for this date — proves the day is closed and by whom
    supabase
      .from("audit_logs")
      .select("staff_name, after_state, created_at")
      .eq("hotel_id", hotelId)
      .eq("action", "night_audit.completed")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  const rooms = roomsRes.data || [];

  return computeNightAuditSummary({
    auditDate: dayStr,
    currency: hotel.currency || "GHS",
    rooms,
    pendingArrivals: pendingArrivalsRes.data || [],
    pendingDepartures: pendingDeparturesRes.data || [],
    inHouseCount: inHouseRes.count || 0,
    payments: todayPaymentsRes.data || [],
    occupiedBookings: occupiedBookingsRes.data || [],
    lastAuditLog: auditLogRes.data?.[0] ?? null,
  });
}

export async function executeNightAudit(
  dateStr: string,
  notes?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const ctx = await requireMinRole("manager", "run the night audit");
    const supabase = await createClient();
    const { hotelId } = ctx;

    if (!DATE_RE.test(dateStr)) {
      return { success: false, error: "Invalid date format." };
    }

    const targetDate = resolveDate(dateStr);
    const dayStr = format(targetDate, "yyyy-MM-dd");

    // Idempotency — never close the same day twice
    const { data: existing } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("hotel_id", hotelId)
      .eq("action", "night_audit.completed")
      .gte("created_at", startOfDay(targetDate).toISOString())
      .lte("created_at", endOfDay(targetDate).toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: false, error: `${dayStr} is already closed.` };
    }

    const auditSummary = await getNightAuditData(dayStr);

    // NOTE: entity_id is a uuid column — the date lives in after_state only.
    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "night_audit.completed",
      entityType: "night_audit",
      // entity_id is a uuid column — the date lives in after_state only
      afterState: {
        date: dayStr,
        notes: notes?.trim() || null,
        occupancyRate: auditSummary.occupancyRate,
        roomRevenue: auditSummary.estimatedRoomRevenue,
        totalPayments: auditSummary.totalPaymentsToday,
        unresolvedCount: auditSummary.unresolvedBookings.length,
      },
    });

    revalidatePath("/dashboard/night-audit");
    revalidatePath("/dashboard");

    return { success: true, message: `Day ${dayStr} closed` };
  } catch (err) {
    return toActionError(err);
  }
}
