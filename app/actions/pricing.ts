"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireMinRole, requireAuth, toActionError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { fromMinor } from "@/lib/money";
import { fetchNightlyRates, nextDay } from "@/lib/pricing/nightly-rates";
import {
  fetchRestrictionFlags,
  type RestrictionFlags,
} from "@/lib/pricing/rate-restrictions";
import { captureError } from "@/lib/observability/sentry";
import {
  computeRoomsLeft,
  ROOMS_LEFT_BOOKING_STATUSES,
  type RoomsLeftResult,
} from "@/lib/availability/rooms-left";
import { toDailyOverrideInsert } from "@/lib/supabase/trigger-derived";
import { overridePriceProblem } from "@/lib/pricing/override-price";
import { format, isValid, parseISO } from "date-fns";

// Schemas for input validation
const DailyOverrideSchema = z.object({
  roomTypeId: z.string().uuid("Invalid room type ID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  price: z.coerce.number({ error: "Enter a price above 0" }).superRefine((price, issue) => {
    const problem = overridePriceProblem(price);
    if (problem) issue.addIssue({ code: "custom", message: problem });
  }),
});

// ── Daily Rate Overrides ─────────────────────────────────────────────

export async function upsertDailyRateOverride(roomTypeId: string, date: string, price: number) {
  try {
    const ctx = await requireMinRole("manager", "set daily overrides");
    const hotelId = ctx.hotelId;

    // Bad input is the caller's mistake, not an incident: answer in words, no Sentry.
    const parsed = DailyOverrideSchema.safeParse({ roomTypeId, date, price });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Enter a valid price" };
    }

    const supabase = await createClient();

    // Verify room type ownership, and read the current price in the same round
    // trip — it is the audit trail's before_state.
    const [rtCheck, existingOverride] = await Promise.all([
      supabase
        .from("room_types")
        .select("id")
        .eq("id", roomTypeId)
        .eq("hotel_id", hotelId)
        .single(),
      supabase
        .from("daily_rate_overrides")
        .select("price")
        .eq("hotel_id", hotelId)
        .eq("room_type_id", roomTypeId)
        .eq("date", date)
        .maybeSingle(),
    ]);

    if (rtCheck.error) {
      return { success: false, error: "Access denied or invalid room type" };
    }

    const { data, error } = await supabase
      .from("daily_rate_overrides")
      .upsert(
        toDailyOverrideInsert({
          hotel_id: hotelId,
          room_type_id: roomTypeId,
          date,
          price,
        }),
        { onConflict: "room_type_id,date" }
      )
      .select()
      .single();

    if (error) {
      // Still reported, but the toast never shows database text.
      await toActionError(error, { action: "pricing.upsertDailyRateOverride", hotelId });
      return { success: false, error: "Couldn't save this price. Try again." };
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "rate.daily_override_upserted",
      entityType: "daily_rate_override",
      entityId: data.id,
      beforeState: existingOverride.data
        ? { price: Number(existingOverride.data.price) }
        : null,
      afterState: { room_type_id: roomTypeId, date, price },
    });

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err, { action: "pricing.upsertDailyRateOverride" });
  }
}

export async function deleteDailyRateOverride(roomTypeId: string, date: string) {
  try {
    const ctx = await requireMinRole("manager", "delete daily overrides");
    const hotelId = ctx.hotelId;

    const supabase = await createClient();

    // Verify ownership and delete. `.select()` on a delete returns the removed
    // rows, so the audit trail gets a before_state without an extra round trip.
    const { data: deleted, error } = await supabase
      .from("daily_rate_overrides")
      .delete()
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("date", date)
      .select("id, price");

    if (error) throw error;

    // A no-op delete (already cleared) is not an audit event.
    if (deleted && deleted.length > 0) {
      await writeAuditLog(supabase, {
        hotelId,
        staffId: ctx.staffId,
        staffName: ctx.staffName,
        action: "rate.daily_override_deleted",
        entityType: "daily_rate_override",
        entityId: deleted[0].id,
        beforeState: {
          room_type_id: roomTypeId,
          date,
          price: Number(deleted[0].price),
        },
      });
    }

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true as const };
  } catch (err) {
    return toActionError(err, { action: "pricing.deleteDailyRateOverride" });
  }
}

// ── Staff: Resolve rates for a booking (authenticated) ──────────

export interface StaffResolvedPricing {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Per-night breakdown with override source */
  nightlyRates: { date: string; price: number; source: "daily" | "seasonal" | "base"; seasonName?: string }[];
  /** Sum of all nightly rates */
  subtotal: number;
  /** Average nightly rate (subtotal / nights) — use as room_rate in bookings */
  avgNightlyRate: number;
  /** Tax amount based on hotel's configured tax rate */
  taxAmount: number;
  /** Tax rate (0–100) from hotel settings */
  taxRate: number;
  /** subtotal + taxAmount */
  totalAmount: number;
}

/**
 * Resolve override-aware pricing for a staff booking.
 * Authenticated — uses createClient (respects RLS) + requireAuth to confirm
 * the room type belongs to the staff member's hotel.
 */
export async function getResolvedRatesForBooking(
  roomTypeId: string,
  checkIn: string,
  checkOut: string
): Promise<{ success: true; data: StaffResolvedPricing } | { success: false; error: string }> {
  try {
    const ctx = await requireAuth();
    const hotelId = ctx.hotelId;
    const supabase = await createClient();

    // Verify room type belongs to this hotel
    const { data: roomType, error: rtErr } = await supabase
      .from("room_types")
      .select("id")
      .eq("id", roomTypeId)
      .eq("hotel_id", hotelId)
      .single();

    if (rtErr || !roomType) {
      return { success: false, error: "Room type not found" };
    }

    // Validate dates
    const ciDate = new Date(checkIn);
    const coDate = new Date(checkOut);
    if (isNaN(ciDate.getTime()) || isNaN(coDate.getTime()) || coDate <= ciDate) {
      return { success: false, error: "Invalid date range" };
    }

    const nights = Math.ceil((coDate.getTime() - ciDate.getTime()) / 86400000);

    // Use the public resolver (supabaseAdmin) — same logic, consistent results
    const { resolvePublicNightlyTotal } = await import("@/lib/pricing/resolve-public-price");
    const resolved = await resolvePublicNightlyTotal(hotelId, roomTypeId, checkIn, checkOut);

    // Read tax settings from hotel configuration
    const taxEnabled = ctx.hotel.settings.tax_enabled === true;
    const taxRate = taxEnabled
      ? typeof ctx.hotel.settings.tax_percentage === "number"
        ? ctx.hotel.settings.tax_percentage
        : 0
      : 0;

    const taxAmount = taxRate > 0
      ? Math.round(resolved.subtotal * (taxRate / 100) * 100) / 100
      : 0;

    const totalAmount = Math.round((resolved.subtotal + taxAmount) * 100) / 100;

    return {
      success: true,
      data: {
        roomTypeId,
        checkIn,
        checkOut,
        nights,
        nightlyRates: resolved.nights.map((n) => ({
          date: n.date,
          price: n.price,
          source: n.source,
          seasonName: n.seasonName,
        })),
        subtotal: resolved.subtotal,
        avgNightlyRate: resolved.avgNightlyRate,
        taxAmount,
        taxRate,
        totalAmount,
      },
    };
  } catch (err) {
    return toActionError(err, { action: "pricing.getResolvedRatesForBooking" });
  }
}

// ── Rate Resolution Engine ───────────────────────────────────────────

export interface ResolvedPriceCell {
  roomTypeId: string;
  date: string;
  price: number;
  source: "daily" | "seasonal" | "base";
  seasonName?: string;
  isWeekend: boolean;
  /**
   * The rate plan's controls for this date, or null when the date restricts
   * nothing — which is most of them, so the field is absent far more often than
   * it is set. It rides along with the rate because it is read on the plan that
   * priced the cell: a badge resolved separately could end up describing a
   * different plan than the number beside it.
   */
  restrictions?: RestrictionFlags | null;
}

export async function getResolvedRates(
  roomTypeIds: string[],
  startDate: string,
  endDate: string
) {
  try {
    const ctx = await requireAuth();

    if (!roomTypeIds.length) return { success: true as const, data: [] };

    // The rate matrix is an inclusive grid — every column through endDate gets a
    // cell — while the resolver speaks in stay nights, where the last date is a
    // check-out. nextDay bridges the two.
    const rows = await fetchNightlyRates({
      p_hotel_id: ctx.hotelId,
      p_room_type_ids: roomTypeIds,
      p_from: startDate,
      p_to: nextDay(endDate),
      // The matrix shows the rates a guest booking the default plan at default
      // occupancy would be quoted. Plan- or occupancy-specific overrides belong
      // to the rate plan screens, not to this grid.
      p_rate_plan_id: null,
      p_occupancy: 0,
    });

    // Restrictions hang off the rate plan, and the resolver has already told us
    // which plan priced each night, so the whole window is one range scan with no
    // second plan lookup — and the badge is guaranteed to describe the plan whose
    // number it sits beside.
    //
    // Fail-soft. A grid that renders without badges is a far smaller failure than
    // one that does not render at all, and nothing here is a gate: the guest
    // funnel is refused by `bookings_restrictions_guard` whatever this read did.
    const restrictions = await fetchRestrictionFlags(
      ctx.hotelId,
      rows.flatMap((row) => (row.rate_plan_id ? [row.rate_plan_id] : [])),
      startDate,
      endDate
    ).catch((error: unknown) => {
      captureError(error, {
        scope: "server-action",
        level: "warning",
        hotelId: ctx.hotelId,
        tags: { action: "pricing.getResolvedRates", read: "rate_restrictions" },
        contexts: { window: { from: startDate, to: endDate } },
      });
      return new Map<string, RestrictionFlags>();
    });

    const byRoomType = new Map<string, ResolvedPriceCell[]>();
    for (const row of rows) {
      const cell: ResolvedPriceCell = {
        roomTypeId: row.room_type_id,
        date: row.stay_date,
        price: fromMinor(Number(row.rate_minor), row.currency),
        source: row.source,
        // A season name on a cell the season did not price is the UI's cue to
        // render "season active, no rate configured". A daily override outranks
        // the season outright, so it reports no season at all — same as before
        // the resolver moved into SQL.
        seasonName:
          row.source === "daily" ? undefined : (row.active_season_name ?? undefined),
        isWeekend: row.is_weekend,
        restrictions: row.rate_plan_id
          ? (restrictions.get(`${row.rate_plan_id}_${row.stay_date}`) ?? null)
          : null,
      };
      const bucket = byRoomType.get(cell.roomTypeId);
      if (bucket) bucket.push(cell);
      else byRoomType.set(cell.roomTypeId, [cell]);
    }

    // Callers key off roomTypeId, but keeping the requested order means a caller
    // that iterates instead of looking up still renders its rows the way it
    // asked for them.
    const resolvedCells = roomTypeIds.flatMap((id) => byRoomType.get(id) ?? []);

    return { success: true as const, data: resolvedCells };
  } catch (err) {
    return toActionError(err, { action: "pricing.getResolvedRates" });
  }
}

// ── Rooms left by date ───────────────────────────────────────────────────────

/**
 * Rooms left to sell per room type per night (inclusive range), plus the
 * property total. Read-only; feeds the rates grid. The counting rules live in
 * lib/availability/rooms-left.ts.
 */
export async function getRoomsLeft(
  startDate: string,
  endDate: string
): Promise<{ success: true; data: RoomsLeftResult } | { success: false; error: string }> {
  try {
    // A real calendar date only: 2026-02-30 would roll over and 2026-99-99
    // would throw later. Bad input is not an incident, so nothing goes to Sentry.
    if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
      return { success: false, error: "Invalid date" };
    }
    if (startDate > endDate) {
      return { success: false, error: "startDate must be <= endDate" };
    }
    // Inclusive night list; capped so a bad range cannot fan out unbounded work.
    const dates: string[] = [];
    for (let d = startDate; d <= endDate && dates.length <= 366; d = nextDay(d)) dates.push(d);
    if (dates.length > 366) {
      return { success: false, error: "Date range is too long" };
    }
    const endExclusive = nextDay(endDate);

    const ctx = await requireAuth();
    const hotelId = ctx.hotelId;
    const supabase = await createClient();

    const [roomTypesResult, roomsResult, bookingsResult, blocksResult] = await Promise.all([
      supabase.from("room_types").select("id").eq("hotel_id", hotelId).eq("is_active", true),
      supabase.from("rooms").select("id, room_type_id, status").eq("hotel_id", hotelId).eq("is_active", true),
      supabase
        .from("bookings")
        .select("room_id, room_type_id, check_in, check_out")
        .eq("hotel_id", hotelId)
        .in("status", [...ROOMS_LEFT_BOOKING_STATUSES])
        .lt("check_in", endExclusive)
        .gt("check_out", startDate),
      supabase
        .from("availability_blocks")
        .select("room_id, start_date, end_date")
        .eq("hotel_id", hotelId)
        .lt("start_date", endExclusive)
        .gt("end_date", startDate),
    ]);
    if (roomTypesResult.error) throw roomTypesResult.error;
    if (roomsResult.error) throw roomsResult.error;
    if (bookingsResult.error) throw bookingsResult.error;
    if (blocksResult.error) throw blocksResult.error;

    const data = computeRoomsLeft({
      roomTypeIds: (roomTypesResult.data ?? []).map((t) => t.id),
      rooms: (roomsResult.data ?? []).map((r) => ({ id: r.id, roomTypeId: r.room_type_id, status: r.status })),
      bookings: (bookingsResult.data ?? []).map((b) => ({
        roomId: b.room_id,
        roomTypeId: b.room_type_id ?? "",
        checkIn: b.check_in,
        checkOut: b.check_out,
      })),
      blocks: (blocksResult.data ?? []).map((b) => ({ roomId: b.room_id, startDate: b.start_date, endDate: b.end_date })),
      dates,
    });

    return { success: true, data };
  } catch (err) {
    return toActionError(err, { action: "pricing.getRoomsLeft" });
  }
}

function isCalendarDate(value: string): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseISO(value);
  return isValid(date) && format(date, "yyyy-MM-dd") === value;
}
