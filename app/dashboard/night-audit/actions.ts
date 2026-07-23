"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { format, startOfDay, endOfDay } from "date-fns";
import { writeAuditLog } from "@/lib/audit";

async function getHotelScopedClient() {
  const { orgId, userId } = await auth();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) throw new Error("Hotel not found");

  const { data: staffProfile } = userId
    ? await supabase
        .from("staff_profiles")
        .select("id, full_name, role")
        .eq("clerk_user_id", userId)
        .eq("clerk_org_id", orgId)
        .single()
    : { data: null };

  return {
    supabase,
    hotelId: hotel.id,
    hotel,
    staffId: staffProfile?.id ?? null,
    staffName: staffProfile?.full_name ?? "System",
  };
}

export interface NightAuditSummary {
  auditDate: string;
  currency: string;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  outOfService: number;
  occupancyRate: number;
  pendingArrivals: number;
  pendingDepartures: number;
  inHouseCount: number;
  totalPaymentsToday: number;
  estimatedRoomRevenue: number;
  adrToday: number;
  revparToday: number;
  isClosed: boolean;
  unresolvedBookings: {
    id: string;
    reference: string;
    guestName: string;
    type: "pending_arrival" | "pending_departure";
    roomNumber: string | null;
  }[];
}

export async function getNightAuditData(dateStr?: string): Promise<NightAuditSummary> {
  const { supabase, hotelId, hotel } = await getHotelScopedClient();
  const targetDate = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const dayStr = format(targetDate, "yyyy-MM-dd");

  const [
    roomsRes,
    pendingArrivalsRes,
    pendingDeparturesRes,
    inHouseRes,
    todayPaymentsRes,
    occupiedBookingsRes,
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
      .eq("status", "confirmed"),
    supabase
      .from("bookings")
      .select("id, reference, guests(full_name), rooms(room_number)")
      .eq("hotel_id", hotelId)
      .eq("check_out", dayStr)
      .eq("status", "checked_in"),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("status", "checked_in")
      .lte("check_in", dayStr)
      .gte("check_out", dayStr),
    supabase
      .from("payments")
      .select("amount")
      .eq("hotel_id", hotelId)
      .eq("status", "success")
      .gte("paid_at", startOfDay(targetDate).toISOString())
      .lte("paid_at", endOfDay(targetDate).toISOString()),
    supabase
      .from("bookings")
      .select("total_amount, nights")
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", dayStr)
      .gte("check_out", dayStr),
  ]);

  const rooms = roomsRes.data || [];
  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === "occupied").length;
  const outOfService = rooms.filter((r) => r.status === "maintenance" || r.status === "out_of_service").length;
  const availableRooms = totalRooms - occupiedRooms - outOfService;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const pendingArr = pendingArrivalsRes.data || [];
  const pendingDep = pendingDeparturesRes.data || [];

  const unresolvedBookings = [
    ...pendingArr.map((b: any) => ({
      id: b.id,
      reference: b.reference,
      guestName: b.guests?.full_name || "Unknown Guest",
      type: "pending_arrival" as const,
      roomNumber: b.rooms?.room_number || null,
    })),
    ...pendingDep.map((b: any) => ({
      id: b.id,
      reference: b.reference,
      guestName: b.guests?.full_name || "Unknown Guest",
      type: "pending_departure" as const,
      roomNumber: b.rooms?.room_number || null,
    })),
  ];

  const totalPaymentsToday = (todayPaymentsRes.data || []).reduce(
    (sum: number, p: any) => sum + (p.amount || 0),
    0
  );

  const estimatedRoomRevenue = (occupiedBookingsRes.data || []).reduce((sum: number, b: any) => {
    const nightly = (b.total_amount || 0) / Math.max(1, b.nights || 1);
    return sum + nightly;
  }, 0);

  const adrToday = occupiedRooms > 0 ? Math.round(estimatedRoomRevenue / occupiedRooms) : 0;
  const revparToday = totalRooms > 0 ? Math.round(estimatedRoomRevenue / totalRooms) : 0;

  // Check audit log for close-of-day entry
  const { data: auditLog } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("action", "night_audit.completed")
    .gte("created_at", startOfDay(targetDate).toISOString())
    .lte("created_at", endOfDay(targetDate).toISOString())
    .limit(1);

  const isClosed = (auditLog && auditLog.length > 0) ?? false;

  return {
    auditDate: dayStr,
    currency: hotel.currency || "GHS",
    totalRooms,
    occupiedRooms,
    availableRooms,
    outOfService,
    occupancyRate,
    pendingArrivals: pendingArr.length,
    pendingDepartures: pendingDep.length,
    inHouseCount: inHouseRes.count || 0,
    totalPaymentsToday,
    estimatedRoomRevenue: Math.round(estimatedRoomRevenue),
    adrToday,
    revparToday,
    isClosed,
    unresolvedBookings,
  };
}

export async function executeNightAudit(dateStr: string, notes?: string) {
  const { supabase, hotelId, staffId, staffName } = await getHotelScopedClient();

  const auditSummary = await getNightAuditData(dateStr);

  // Record audit log entry for the Night Audit completion
  await writeAuditLog(supabase, {
    hotelId,
    staffId,
    staffName,
    action: "night_audit.completed",
    entityType: "night_audit",
    entityId: dateStr,
    afterState: {
      date: dateStr,
      notes: notes || "Daily night audit completed successfully.",
      occupancyRate: auditSummary.occupancyRate,
      roomRevenue: auditSummary.estimatedRoomRevenue,
      totalPayments: auditSummary.totalPaymentsToday,
      unresolvedCount: auditSummary.unresolvedBookings.length,
    },
  });

  revalidatePath("/dashboard/night-audit");
  revalidatePath("/dashboard");

  return { success: true, message: `Night Audit completed for ${dateStr}` };
}
