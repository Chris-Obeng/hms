"use server";

import { getHotelScope, requireMinRole, toActionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { format, startOfDay, endOfDay } from "date-fns";
import { writeAuditLog } from "@/lib/audit";

export interface NightAuditSummary {
  auditDate: string;
  currency: string;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  outOfService: number;
  occupancyRate: number;
  pendingArrivals: number;
  pendingDepartures: number;
  inHouseCount: number;
  totalPaymentsToday: number;
  paymentsByMethod: { method: string; count: number; amount: number }[];
  estimatedRoomRevenue: number;
  adrToday: number;
  revparToday: number;
  isClosed: boolean;
  lastAudit: { staffName: string | null; notes: string | null; at: string } | null;
  unresolvedBookings: {
    id: string;
    reference: string;
    guestName: string;
    type: "pending_arrival" | "pending_departure";
    roomNumber: string | null;
  }[];
}

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
  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === "occupied").length;
  const outOfService = rooms.filter(
    (r) => r.status === "maintenance" || r.status === "out_of_service"
  ).length;
  const vacantRooms = Math.max(0, totalRooms - occupiedRooms - outOfService);
  const occupancyRate =
    totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const pendingArr = pendingArrivalsRes.data || [];
  const pendingDep = pendingDeparturesRes.data || [];

  // Embedded joins may arrive as an object or a single-element array
  function joinName(value: unknown): string {
    const row = Array.isArray(value) ? value[0] : value;
    if (row && typeof row === "object" && "full_name" in row) {
      const n = (row as { full_name?: string | null }).full_name;
      if (n) return n;
    }
    return "Unknown Guest";
  }
  function joinRoomNumber(value: unknown): string | null {
    const row = Array.isArray(value) ? value[0] : value;
    if (row && typeof row === "object" && "room_number" in row) {
      return (row as { room_number?: string | null }).room_number ?? null;
    }
    return null;
  }

  const unresolvedBookings = [
    ...pendingArr.map((b) => ({
      id: b.id,
      reference: b.reference,
      guestName: joinName(b.guests),
      type: "pending_arrival" as const,
      roomNumber: joinRoomNumber(b.rooms),
    })),
    ...pendingDep.map((b) => ({
      id: b.id,
      reference: b.reference,
      guestName: joinName(b.guests),
      type: "pending_departure" as const,
      roomNumber: joinRoomNumber(b.rooms),
    })),
  ];

  const methodMap = new Map<string, { count: number; amount: number }>();
  let totalPaymentsToday = 0;
  for (const p of todayPaymentsRes.data || []) {
    const key = p.method || "other";
    const cur = methodMap.get(key) ?? { count: 0, amount: 0 };
    methodMap.set(key, { count: cur.count + 1, amount: cur.amount + Number(p.amount || 0) });
    totalPaymentsToday += Number(p.amount || 0);
  }
  const paymentsByMethod = Array.from(methodMap.entries())
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  const estimatedRoomRevenue = (occupiedBookingsRes.data || []).reduce((sum, b) => {
    const nightly = Number(b.total_amount || 0) / Math.max(1, b.nights || 1);
    return sum + nightly;
  }, 0);

  const adrToday =
    occupiedRooms > 0 ? Math.round(estimatedRoomRevenue / occupiedRooms) : 0;
  const revparToday =
    totalRooms > 0 ? Math.round(estimatedRoomRevenue / totalRooms) : 0;

  const logRow = auditLogRes.data?.[0] ?? null;
  const lastAudit = logRow
    ? {
        staffName: (logRow.staff_name as string | null) ?? null,
        notes:
          typeof logRow.after_state === "object" && logRow.after_state !== null
            ? ((logRow.after_state as Record<string, unknown>).notes as string | null) ?? null
            : null,
        at: logRow.created_at as string,
      }
    : null;

  return {
    auditDate: dayStr,
    currency: hotel.currency || "GHS",
    totalRooms,
    occupiedRooms,
    vacantRooms,
    outOfService,
    occupancyRate,
    pendingArrivals: pendingArr.length,
    pendingDepartures: pendingDep.length,
    inHouseCount: inHouseRes.count || 0,
    totalPaymentsToday: Math.round(totalPaymentsToday * 100) / 100,
    paymentsByMethod,
    estimatedRoomRevenue: Math.round(estimatedRoomRevenue),
    adrToday,
    revparToday,
    isClosed: Boolean(lastAudit),
    lastAudit,
    unresolvedBookings,
  };
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
