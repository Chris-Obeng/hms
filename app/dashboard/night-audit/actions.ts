"use server";

import { getHotelScope, requireMinRole, toActionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { format, startOfDay, endOfDay } from "date-fns";
import { writeAuditLog } from "@/lib/audit";
import { captureError, captureSupabaseError } from "@/lib/observability/sentry";
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
    return toActionError(err, { action: "night-audit.executeNightAudit" });
  }
}

// ── Rate drift ─────────────────────────────────────────────────────

/**
 * One booking whose per-night rates do not add up to the room revenue stored on
 * the booking, or whose recorded night count is wrong.
 *
 * The field names are the column names `public.booking_nights_drift(uuid)`
 * returns, so this type reads as the report's contract rather than as a view of
 * it. Money is integer minor units throughout — see lib/money.ts.
 */
export interface RateDriftRow {
  booking_id: string;
  reference: string;
  check_in: string;
  check_out: string;
  status: string | null;
  currency: string;
  nights_expected: number;
  nights_recorded: number;
  room_revenue_minor: number;
  nights_total_minor: number;
  difference_minor: number;
}

export interface RateDriftReport {
  /** Rows to show, most recent stay first, capped at DRIFT_DISPLAY_LIMIT. */
  rows: RateDriftRow[];
  /** Bookings drifting in total, which can exceed `rows.length`. */
  total: number;
  /**
   * True when the report could not be read at all. The UI hides the section
   * instead of rendering it empty, so "nothing to reconcile" can never be
   * confused with "never checked".
   */
  unavailable: boolean;
}

/**
 * A drift row is an exception, not a listing: a hotel with hundreds of them has
 * a systemic problem that a longer list would not help anyone fix. The count is
 * reported in full so the cap is never mistaken for the whole picture.
 */
const DRIFT_DISPLAY_LIMIT = 25;

/** PostgREST and Postgres codes for "this function is not in this database". */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

/**
 * Bookings whose recorded nights do not reconcile with their room revenue.
 *
 * Deliberately not a constraint: a manual discount, a comped night or a tax
 * adjustment are all legitimate reasons for the two figures to differ, and a
 * CHECK would start rejecting valid front-desk edits. Night Audit already has a
 * human reviewing the day's figures, so this is the list that gets put in front
 * of them.
 *
 * Degrades to `unavailable` rather than throwing. Close-of-day must not be
 * blocked by a reconciliation aid, and until the migration carrying
 * booking_nights reaches a given database the function genuinely is not there.
 */
export async function getRateDrift(): Promise<RateDriftReport> {
  const empty: RateDriftReport = { rows: [], total: 0, unavailable: true };

  try {
    const { supabase, hotelId } = await getHotelScope();

    // types/database.types.ts is generated against the remote project, which has
    // not been migrated yet, so its Functions map does not know this function.
    // Drop the cast once db:types has been regenerated from a project carrying
    // migration 20260831160000 — same gap as lib/pricing/nightly-rates.ts.
    const rpc = supabase.rpc as unknown as (
      fn: "booking_nights_drift",
      params: { p_hotel_id: string }
    ) => Promise<{
      data: RateDriftRow[] | null;
      error: { message: string; code?: string | null } | null;
    }>;

    const { data, error } = await rpc("booking_nights_drift", { p_hotel_id: hotelId });

    if (error) {
      // A database without the migration is an expected state, not an incident.
      if (!MISSING_FUNCTION_CODES.has(error.code ?? "")) {
        captureSupabaseError(error, "booking_nights_drift", {
          hotelId,
          tags: { "action.name": "night-audit.getRateDrift" },
          level: "warning",
        });
      }
      return empty;
    }

    const rows = (data ?? []).map((row) => ({
      ...row,
      // int8 arrives as a JSON number from PostgREST, but a string from some
      // versions. Coerce once here so no caller has to think about it.
      room_revenue_minor: Number(row.room_revenue_minor),
      nights_total_minor: Number(row.nights_total_minor),
      difference_minor: Number(row.difference_minor),
    }));

    return {
      rows: rows.slice(0, DRIFT_DISPLAY_LIMIT),
      total: rows.length,
      unavailable: false,
    };
  } catch (err) {
    captureError(err, {
      scope: "server-action",
      level: "warning",
      tags: { "action.name": "night-audit.getRateDrift" },
      fingerprint: ["server-action", "night-audit.getRateDrift"],
    });
    return empty;
  }
}
