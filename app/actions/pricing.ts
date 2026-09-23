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
import type { Database } from "@/types/database.types";

type GeneratedSeasonalOverrideInsert =
  Database["public"]["Tables"]["seasonal_rate_overrides"]["Insert"];
type PendingSeasonalOverrideInsert = GeneratedSeasonalOverrideInsert & {
  hotel_id: string;
};

// Remove after db:types includes migration 20260830163000.
function forGeneratedSchema(
  row: PendingSeasonalOverrideInsert
): GeneratedSeasonalOverrideInsert {
  return row;
}

// Schemas for input validation
const SeasonalRateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
  // Higher wins where seasons overlap. Two seasons may cover the same night as
  // long as their priorities differ — that is how a conference week sits inside
  // a summer season. Capped well below integer range so a UI stepper cannot
  // produce a value the DB would have to widen a column to store.
  priority: z.coerce.number().int().min(0).max(1000).default(0),
});

const SeasonalOverrideSchema = z.object({
  seasonalRateId: z.string().uuid("Invalid season ID"),
  roomTypeId: z.string().uuid("Invalid room type ID"),
  basePrice: z.coerce.number().min(0.01, "Base price must be greater than 0"),
  weekendPrice: z.coerce.number().min(0.01).optional().nullable(),
});

const DailyOverrideSchema = z.object({
  roomTypeId: z.string().uuid("Invalid room type ID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
});

const BulkDailyOverrideSchema = z.array(DailyOverrideSchema).min(1).max(500);

const DailyOverrideDeleteSchema = z.object({
  roomTypeId: z.string().uuid("Invalid room type ID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
});
// min(1) is enforced here — callers must NOT early-return before this parse
const BulkDailyOverrideDeleteSchema = z.array(DailyOverrideDeleteSchema).min(1).max(500);

// ── Seasonal Rates CRUD ──────────────────────────────────────────────

export async function createSeasonalRate(
  name: string,
  startDate: string,
  endDate: string,
  priority: number = 0
) {
  try {
    const ctx = await requireMinRole("manager", "create seasonal rates");
    const hotelId = ctx.hotelId;

    const parsed = SeasonalRateSchema.parse({ name, startDate, endDate, priority });

    if (startDate > endDate) {
      return { success: false, error: "Start date must be before or equal to end date" };
    }

    const supabase = await createClient();

    // Overlap at a DIFFERENT priority is legal and intended — that is how a
    // conference week is priced inside a summer season. Only overlap at the SAME
    // priority is ambiguous, and `seasonal_rates_no_same_priority_overlap`
    // rejects it. This pre-check exists purely to name the offending season in
    // the error instead of surfacing a raw 23P01.
    const { data: overlaps, error: overlapErr } = await supabase
      .from("seasonal_rates")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .eq("priority", parsed.priority)
      .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

    if (overlapErr) throw overlapErr;

    if (overlaps && overlaps.length > 0) {
      return {
        success: false,
        error: `Overlaps "${overlaps[0].name}", which has the same priority (${parsed.priority}). Give one of them a higher priority to layer them, or change the dates.`,
      };
    }

    const { data, error } = await supabase
      .from("seasonal_rates")
      .insert({
        hotel_id: hotelId,
        name,
        start_date: startDate,
        end_date: endDate,
        priority: parsed.priority,
      })
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "rate.season_created",
      entityType: "seasonal_rate",
      entityId: data.id,
      afterState: {
        name,
        start_date: startDate,
        end_date: endDate,
        priority: parsed.priority,
      },
    });

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err, { action: "pricing.createSeasonalRate" });
  }
}

export async function updateSeasonalRate(
  id: string,
  name: string,
  startDate: string,
  endDate: string,
  priority: number = 0
) {
  try {
    const ctx = await requireMinRole("manager", "update seasonal rates");
    const hotelId = ctx.hotelId;

    const parsed = SeasonalRateSchema.parse({ name, startDate, endDate, priority });

    if (startDate > endDate) {
      return { success: false, error: "Start date must be before or equal to end date" };
    }

    const supabase = await createClient();

    // Ensure the seasonal rate belongs to this hotel.
    // Selects the mutable columns too — they are the audit trail's before_state.
    const { data: existingRate, error: findErr } = await supabase
      .from("seasonal_rates")
      .select("id, name, start_date, end_date, priority")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .single();

    if (findErr || !existingRate) {
      return { success: false, error: "Seasonal rate not found or access denied" };
    }

    // Same-priority overlap only — see createSeasonalRate. Excludes this season,
    // which of course overlaps itself.
    const { data: overlaps, error: overlapErr } = await supabase
      .from("seasonal_rates")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .eq("priority", parsed.priority)
      .neq("id", id)
      .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

    if (overlapErr) throw overlapErr;

    if (overlaps && overlaps.length > 0) {
      return {
        success: false,
        error: `Overlaps "${overlaps[0].name}", which has the same priority (${parsed.priority}). Give one of them a higher priority to layer them, or change the dates.`,
      };
    }

    const { data, error } = await supabase
      .from("seasonal_rates")
      .update({
        name,
        start_date: startDate,
        end_date: endDate,
        priority: parsed.priority,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "rate.season_updated",
      entityType: "seasonal_rate",
      entityId: id,
      beforeState: {
        name: existingRate.name,
        start_date: existingRate.start_date,
        end_date: existingRate.end_date,
        priority: existingRate.priority,
      },
      afterState: {
        name,
        start_date: startDate,
        end_date: endDate,
        priority: parsed.priority,
      },
    });

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err, { action: "pricing.updateSeasonalRate" });
  }
}

export async function duplicateSeasonalRate(id: string) {
  try {
    const ctx = await requireMinRole("manager", "duplicate seasonal rates");
    const hotelId = ctx.hotelId;

    const supabase = await createClient();

    // Fetch source season + its overrides
    const { data: source, error: fetchErr } = await supabase
      .from("seasonal_rates")
      .select(`
        name, start_date, end_date, priority,
        overrides:seasonal_rate_overrides (
          room_type_id, base_price, weekend_price
        )
      `)
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .single();

    if (fetchErr || !source) {
      return { success: false, error: "Season not found or access denied" };
    }

    // Auto-shift the copied range to start the day after the source end_date,
    // preserving the same duration. This is a product choice, not a constraint
    // workaround: "duplicate Summer" almost always means "price the next window
    // the same way", and a copy left on the source dates at the source priority
    // would simply be a duplicate the resolver could not order.
    const sourceStart = new Date(source.start_date + "T12:00:00");
    const sourceEnd   = new Date(source.end_date   + "T12:00:00");
    const durationMs  = sourceEnd.getTime() - sourceStart.getTime();

    const newStart = new Date(sourceEnd);
    newStart.setDate(newStart.getDate() + 1); // day after source ends
    const newEnd = new Date(newStart.getTime() + durationMs);

    const newStartStr = newStart.toISOString().split("T")[0];
    const newEndStr   = newEnd.toISOString().split("T")[0];

    // Insert new season with "Copy of" prefix and shifted dates
    const { data: newSeason, error: insertErr } = await supabase
      .from("seasonal_rates")
      .insert({
        hotel_id: hotelId,
        name: `Copy of ${source.name}`,
        start_date: newStartStr,
        end_date: newEndStr,
        // Same layer as the source: a copy that outranked its original would
        // silently reprice any season it overlaps.
        priority: source.priority,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === "23P01" || insertErr.message?.includes("overlap")) {
        return {
          success: false,
          error: `Cannot duplicate: the copied range (${newStartStr} – ${newEndStr}) overlaps another season at the same priority (${source.priority}). Change that season's priority or dates, then duplicate again.`,
        };
      }
      throw insertErr;
    }

    // Copy overrides if any
    if (source.overrides && source.overrides.length > 0) {
      const overrideRows = source.overrides.map((ov) =>
        forGeneratedSchema({
          hotel_id: hotelId,
          seasonal_rate_id: newSeason.id,
          room_type_id: ov.room_type_id as string,
          base_price: Number(ov.base_price),
          weekend_price: ov.weekend_price != null ? Number(ov.weekend_price) : null,
        })
      );

      const { error: ovErr } = await supabase
        .from("seasonal_rate_overrides")
        .insert(overrideRows);

      if (ovErr) throw ovErr;
    }

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "rate.season_duplicated",
      entityType: "seasonal_rate",
      entityId: newSeason.id,
      beforeState: {
        source_season_id: id,
        name: source.name,
        start_date: source.start_date,
        end_date: source.end_date,
        priority: source.priority,
      },
      afterState: {
        name: newSeason.name,
        start_date: newStartStr,
        end_date: newEndStr,
        priority: newSeason.priority,
        overrides_copied: source.overrides?.length ?? 0,
      },
    });

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data: newSeason };
  } catch (err) {
    return toActionError(err, { action: "pricing.duplicateSeasonalRate" });
  }
}

export async function deleteSeasonalRate(id: string) {
  try {
    const ctx = await requireMinRole("manager", "delete seasonal rates");
    const hotelId = ctx.hotelId;

    const supabase = await createClient();

    // Ensure it belongs to this hotel, and capture what is about to be lost.
    // seasonal_rate_overrides cascades on delete, so the child rows only exist
    // in the audit trail once this returns.
    const { data: existingRate, error: checkError } = await supabase
      .from("seasonal_rates")
      .select(`
        id, name, start_date, end_date,
        overrides:seasonal_rate_overrides (
          room_type_id, base_price, weekend_price
        )
      `)
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .single();

    if (checkError || !existingRate) {
      return { success: false, error: "Seasonal rate not found or access denied" };
    }

    const { error } = await supabase
      .from("seasonal_rates")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "rate.season_deleted",
      entityType: "seasonal_rate",
      entityId: id,
      beforeState: {
        name: existingRate.name,
        start_date: existingRate.start_date,
        end_date: existingRate.end_date,
        overrides: existingRate.overrides ?? [],
      },
    });

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "pricing.deleteSeasonalRate" });
  }
}

// ── Seasonal Rate Overrides ──────────────────────────────────────────

export async function upsertSeasonalRateOverride(
  seasonalRateId: string,
  roomTypeId: string,
  basePrice: number,
  weekendPrice?: number | null
) {
  try {
    const ctx = await requireMinRole("manager", "set seasonal prices");
    const hotelId = ctx.hotelId;

    SeasonalOverrideSchema.parse({ seasonalRateId, roomTypeId, basePrice, weekendPrice });

    const supabase = await createClient();

    // Double check seasonal rate and room type ownership.
    // The third read is the audit trail's before_state: a rate change is only
    // meaningful in the log if the previous price is recorded next to the new one.
    const [seasonCheck, roomTypeCheck, existingOverride] = await Promise.all([
      supabase
        .from("seasonal_rates")
        .select("id")
        .eq("id", seasonalRateId)
        .eq("hotel_id", hotelId)
        .single(),
      supabase
        .from("room_types")
        .select("id")
        .eq("id", roomTypeId)
        .eq("hotel_id", hotelId)
        .single(),
      supabase
        .from("seasonal_rate_overrides")
        .select("base_price, weekend_price")
        .eq("seasonal_rate_id", seasonalRateId)
        .eq("room_type_id", roomTypeId)
        .maybeSingle(),
    ]);

    if (seasonCheck.error || !seasonCheck.data || roomTypeCheck.error || !roomTypeCheck.data) {
      return { success: false, error: "Access denied or invalid season/room type" };
    }

    // Upsert the override
    const { data, error } = await supabase
      .from("seasonal_rate_overrides")
      .upsert(
        forGeneratedSchema({
          hotel_id: hotelId,
          seasonal_rate_id: seasonalRateId,
          room_type_id: roomTypeId,
          base_price: basePrice,
          weekend_price: weekendPrice || null,
        }),
        { onConflict: "seasonal_rate_id,room_type_id" }
      )
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "rate.season_override_upserted",
      entityType: "seasonal_rate_override",
      entityId: data.id,
      beforeState: existingOverride.data
        ? {
            base_price: Number(existingOverride.data.base_price),
            weekend_price:
              existingOverride.data.weekend_price != null
                ? Number(existingOverride.data.weekend_price)
                : null,
          }
        : null,
      afterState: {
        seasonal_rate_id: seasonalRateId,
        room_type_id: roomTypeId,
        base_price: basePrice,
        weekend_price: weekendPrice || null,
      },
    });

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err, { action: "pricing.upsertSeasonalRateOverride" });
  }
}

// ── Daily Rate Overrides ─────────────────────────────────────────────

export async function upsertDailyRateOverride(roomTypeId: string, date: string, price: number) {
  try {
    const ctx = await requireMinRole("manager", "set daily overrides");
    const hotelId = ctx.hotelId;

    DailyOverrideSchema.parse({ roomTypeId, date, price });

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
        {
          hotel_id: hotelId,
          room_type_id: roomTypeId,
          date,
          price,
        },
        { onConflict: "room_type_id,date" }
      )
      .select()
      .single();

    if (error) throw error;

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

export async function bulkUpsertDailyRateOverrides(
  overrides: { roomTypeId: string; date: string; price: number }[]
) {
  try {
    const ctx = await requireMinRole("manager", "set bulk daily overrides");
    const hotelId = ctx.hotelId;

    BulkDailyOverrideSchema.parse(overrides);

    const supabase = await createClient();

    // Ensure all unique room type IDs involved belong to this hotel
    const uniqueRoomTypeIds = Array.from(new Set(overrides.map((o) => o.roomTypeId)));
    const { data: validRoomTypes, error: rtCheckErr } = await supabase
      .from("room_types")
      .select("id")
      .eq("hotel_id", hotelId)
      .in("id", uniqueRoomTypeIds);

    if (rtCheckErr || !validRoomTypes || validRoomTypes.length !== uniqueRoomTypeIds.length) {
      return { success: false, error: "Access denied: One or more room types are invalid" };
    }

    const rowsToUpsert = overrides.map((o) => ({
      hotel_id: hotelId,
      room_type_id: o.roomTypeId,
      date: o.date,
      price: o.price,
    }));

    const { data, error } = await supabase
      .from("daily_rate_overrides")
      .upsert(rowsToUpsert, { onConflict: "room_type_id,date" })
      .select();

    if (error) throw error;

    // One summary row, never one per date: before_state/after_state are
    // GIN-indexed, so logging a 500-date bulk edit row-by-row would write 500
    // index entries for a single staff action.
    const sortedDates = overrides.map((o) => o.date).sort();
    const prices = overrides.map((o) => o.price);

    await writeAuditLog(supabase, {
      hotelId,
      staffId: ctx.staffId,
      staffName: ctx.staffName,
      action: "rate.daily_override_bulk_upserted",
      entityType: "daily_rate_override",
      afterState: {
        room_type_ids: uniqueRoomTypeIds,
        date_from: sortedDates[0],
        date_to: sortedDates[sortedDates.length - 1],
        row_count: data?.length ?? overrides.length,
        price_min: Math.min(...prices),
        price_max: Math.max(...prices),
      },
    });

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err, { action: "pricing.bulkUpsertDailyRateOverrides" });
  }
}

export async function bulkDeleteDailyRateOverrides(
  overrides: { roomTypeId: string; date: string }[]
) {
  try {
    const ctx = await requireMinRole("manager", "clear bulk overrides");
    const hotelId = ctx.hotelId;

    const supabase = await createClient();

    // Parse first — Zod .min(1) will throw if array is empty
    const parsed = BulkDailyOverrideDeleteSchema.parse(overrides);

    let query = supabase.from("daily_rate_overrides").delete().eq("hotel_id", hotelId);

    const filterStrings = parsed.map(
      (o) => `and(room_type_id.eq.${o.roomTypeId},date.eq.${o.date})`
    );
    query = query.or(filterStrings.join(","));

    const { data: deleted, error } = await query.select("room_type_id, date, price");
    if (error) throw error;

    // One summary row for the whole clear, matching the bulk upsert above.
    if (deleted && deleted.length > 0) {
      const sortedDates = deleted.map((row) => row.date).sort();

      await writeAuditLog(supabase, {
        hotelId,
        staffId: ctx.staffId,
        staffName: ctx.staffName,
        action: "rate.daily_override_bulk_deleted",
        entityType: "daily_rate_override",
        beforeState: {
          room_type_ids: Array.from(new Set(deleted.map((row) => row.room_type_id))),
          date_from: sortedDates[0],
          date_to: sortedDates[sortedDates.length - 1],
          row_count: deleted.length,
        },
      });
    }

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true as const };
  } catch (err) {
    return toActionError(err, { action: "pricing.bulkDeleteDailyRateOverrides" });
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

// ── Occupancy by Date ────────────────────────────────────────────────────────
// Returns occupied room count and total rooms per date for the rate calendar.

export interface OccupancyCell {
  date: string;
  /** Number of rooms occupied (checked_in / confirmed bookings covering this night) */
  occupied: number;
  /** Total active rooms in the hotel */
  total: number;
  /** 0–100 */
  pct: number;
}

export async function getOccupancyByDate(
  startDate: string,
  endDate: string
): Promise<{ success: true; data: OccupancyCell[] } | { success: false; error: string }> {
  try {
    // Validate date format and ordering
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(startDate) || !dateRe.test(endDate)) {
      return { success: false, error: "Invalid date format — expected YYYY-MM-DD" };
    }
    if (startDate > endDate) {
      return { success: false, error: "startDate must be <= endDate" };
    }

    const ctx = await requireAuth();
    const hotelId = ctx.hotelId;
    const supabase = await createClient();

    // Total active rooms
    const { count: totalRooms, error: totalErr } = await supabase
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("is_active", true);

    if (totalErr) throw totalErr;
    const total = totalRooms ?? 0;

    if (total === 0) {
      return { success: true, data: [] };
    }

    // Fetch bookings that overlap the inclusive [startDate, endDate] range.
    // A booking overlaps when:  check_in <= endDate  AND  check_out > startDate
    // Using .lte for check_in so bookings whose check_in == endDate are included
    // (the last date in the calendar grid must count those guests as occupied).
    const { data: bookings, error: bookErr } = await supabase
      .from("bookings")
      .select("check_in, check_out")
      .eq("hotel_id", hotelId)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", endDate)   // starts on or before range end (inclusive)
      .gt("check_out", startDate); // checks out after range start

    if (bookErr) throw bookErr;

    // Build inclusive date list: startDate … endDate
    const dateList: string[] = [];
    const cur = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    while (cur <= end) {
      dateList.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }

    // Count overlapping bookings per night
    const occupancyMap = new Map<string, number>(dateList.map((d) => [d, 0]));

    for (const booking of bookings ?? []) {
      const ci = new Date(booking.check_in + "T12:00:00");
      const co = new Date(booking.check_out + "T12:00:00");
      const night = new Date(ci);
      while (night < co) {
        const dateStr = night.toISOString().split("T")[0];
        if (occupancyMap.has(dateStr)) {
          occupancyMap.set(dateStr, (occupancyMap.get(dateStr) ?? 0) + 1);
        }
        night.setDate(night.getDate() + 1);
      }
    }

    const data: OccupancyCell[] = dateList.map((date) => {
      const occupied = occupancyMap.get(date) ?? 0;
      // Cap at total (overbooking edge-case in data)
      const capped = Math.min(occupied, total);
      return {
        date,
        occupied: capped,
        total,
        pct: total > 0 ? Math.round((capped / total) * 100) : 0,
      };
    });

    return { success: true, data };
  } catch (err) {
    return toActionError(err, { action: "pricing.getOccupancyByDate" });
  }
}
