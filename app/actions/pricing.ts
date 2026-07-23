"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireMinRole, requireAuth, toActionError } from "@/lib/auth";

// Schemas for input validation
const SeasonalRateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
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

// Helper function to check if a date is a weekend (Friday or Saturday night)
function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDay();
  return day === 5 || day === 6; // 5 is Friday, 6 is Saturday
}

// ── Seasonal Rates CRUD ──────────────────────────────────────────────

export async function createSeasonalRate(name: string, startDate: string, endDate: string) {
  try {
    const ctx = await requireMinRole("manager", "create seasonal rates");
    const hotelId = ctx.hotelId;

    SeasonalRateSchema.parse({ name, startDate, endDate });

    if (startDate > endDate) {
      return { success: false, error: "Start date must be before or equal to end date" };
    }

    const supabase = await createClient();

    // Check for overlaps in app layer for user-friendly messaging
    const { data: overlaps, error: overlapErr } = await supabase
      .from("seasonal_rates")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

    if (overlapErr) throw overlapErr;

    if (overlaps && overlaps.length > 0) {
      return {
        success: false,
        error: `Date range overlaps with existing season: "${overlaps[0].name}"`,
      };
    }

    const { data, error } = await supabase
      .from("seasonal_rates")
      .insert({
        hotel_id: hotelId,
        name,
        start_date: startDate,
        end_date: endDate,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateSeasonalRate(id: string, name: string, startDate: string, endDate: string) {
  try {
    const ctx = await requireMinRole("manager", "update seasonal rates");
    const hotelId = ctx.hotelId;

    SeasonalRateSchema.parse({ name, startDate, endDate });

    if (startDate > endDate) {
      return { success: false, error: "Start date must be before or equal to end date" };
    }

    const supabase = await createClient();

    // Ensure the seasonal rate belongs to this hotel
    const { data: existingRate, error: findErr } = await supabase
      .from("seasonal_rates")
      .select("id")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .single();

    if (findErr || !existingRate) {
      return { success: false, error: "Seasonal rate not found or access denied" };
    }

    // Check overlaps excluding this specific season
    const { data: overlaps, error: overlapErr } = await supabase
      .from("seasonal_rates")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .neq("id", id)
      .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

    if (overlapErr) throw overlapErr;

    if (overlaps && overlaps.length > 0) {
      return {
        success: false,
        error: `Date range overlaps with existing season: "${overlaps[0].name}"`,
      };
    }

    const { data, error } = await supabase
      .from("seasonal_rates")
      .update({
        name,
        start_date: startDate,
        end_date: endDate,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err);
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
        name, start_date, end_date,
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
    // preserving the same duration. This avoids the no_overlapping_seasons
    // exclusion constraint (daterange '[]' — both endpoints inclusive).
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
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === "23P01" || insertErr.message?.includes("overlap")) {
        return {
          success: false,
          error: `Cannot duplicate: the auto-shifted range (${newStartStr} – ${newEndStr}) still overlaps an existing season. Please adjust your seasons to leave a gap first.`,
        };
      }
      throw insertErr;
    }

    // Copy overrides if any
    if (source.overrides && source.overrides.length > 0) {
      const overrideRows = source.overrides.map((ov: any) => ({
        seasonal_rate_id: newSeason.id,
        room_type_id: ov.room_type_id as string,
        base_price: Number(ov.base_price),
        weekend_price: ov.weekend_price != null ? Number(ov.weekend_price) : null,
      }));

      const { error: ovErr } = await supabase
        .from("seasonal_rate_overrides")
        .insert(overrideRows);

      if (ovErr) throw ovErr;
    }

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data: newSeason };
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteSeasonalRate(id: string) {
  try {
    const ctx = await requireMinRole("manager", "delete seasonal rates");
    const hotelId = ctx.hotelId;

    const supabase = await createClient();

    // Ensure it belongs to this hotel
    const { error: checkError } = await supabase
      .from("seasonal_rates")
      .select("id")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .single();

    if (checkError) {
      return { success: false, error: "Seasonal rate not found or access denied" };
    }

    const { error } = await supabase
      .from("seasonal_rates")
      .delete()
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true };
  } catch (err) {
    return toActionError(err);
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

    // Double check seasonal rate and room type ownership
    const [seasonCheck, roomTypeCheck] = await Promise.all([
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
    ]);

    if (seasonCheck.error || !seasonCheck.data || roomTypeCheck.error || !roomTypeCheck.data) {
      return { success: false, error: "Access denied or invalid season/room type" };
    }

    // Upsert the override
    const { data, error } = await supabase
      .from("seasonal_rate_overrides")
      .upsert(
        {
          seasonal_rate_id: seasonalRateId,
          room_type_id: roomTypeId,
          base_price: basePrice,
          weekend_price: weekendPrice || null,
        },
        { onConflict: "seasonal_rate_id,room_type_id" }
      )
      .select()
      .single();

    if (error) throw error;

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err);
  }
}

// ── Daily Rate Overrides ─────────────────────────────────────────────

export async function upsertDailyRateOverride(roomTypeId: string, date: string, price: number) {
  try {
    const ctx = await requireMinRole("manager", "set daily overrides");
    const hotelId = ctx.hotelId;

    DailyOverrideSchema.parse({ roomTypeId, date, price });

    const supabase = await createClient();

    // Verify room type ownership
    const { error: rtCheck } = await supabase
      .from("room_types")
      .select("id")
      .eq("id", roomTypeId)
      .eq("hotel_id", hotelId)
      .single();

    if (rtCheck) {
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

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteDailyRateOverride(roomTypeId: string, date: string) {
  try {
    const ctx = await requireMinRole("manager", "delete daily overrides");
    const hotelId = ctx.hotelId;

    const supabase = await createClient();

    // Verify ownership and delete
    const { error } = await supabase
      .from("daily_rate_overrides")
      .delete()
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("date", date);

    if (error) throw error;

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true };
  } catch (err) {
    return toActionError(err);
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

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true, data };
  } catch (err) {
    return toActionError(err);
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

    const { error } = await query;
    if (error) throw error;

    revalidatePath("/dashboard/rooms/pricing");
    return { success: true };
  } catch (err) {
    return toActionError(err);
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
    return toActionError(err);
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
}

export async function getResolvedRates(
  roomTypeIds: string[],
  startDate: string,
  endDate: string
) {
  try {
    const ctx = await requireAuth();
    const hotelId = ctx.hotelId;

    const supabase = await createClient();

    // Fetch in parallel
    const [roomTypesRes, seasonsRes, dailyOverridesRes] = await Promise.all([
      supabase
        .from("room_types")
        .select("id, name, base_price, weekend_price")
        .eq("hotel_id", hotelId)
        .in("id", roomTypeIds),
      supabase
        .from("seasonal_rates")
        .select(`
          id,
          name,
          start_date,
          end_date,
          overrides:seasonal_rate_overrides (
            room_type_id,
            base_price,
            weekend_price
          )
        `)
        .eq("hotel_id", hotelId)
        .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`),
      supabase
        .from("daily_rate_overrides")
        .select("room_type_id, date, price")
        .eq("hotel_id", hotelId)
        .in("room_type_id", roomTypeIds)
        .gte("date", startDate)
        .lte("date", endDate),
    ]);

    if (roomTypesRes.error) throw roomTypesRes.error;
    if (seasonsRes.error) throw seasonsRes.error;
    if (dailyOverridesRes.error) throw dailyOverridesRes.error;

    const roomTypes = roomTypesRes.data || [];
    const seasons = seasonsRes.data || [];
    const dailyOverrides = dailyOverridesRes.data || [];

    const resolvedCells: ResolvedPriceCell[] = [];

    // ── Build lookup Maps for O(1) access ─────────────────────────
    // Map: "roomTypeId" → roomType row
    const roomTypeMap = new Map(roomTypes.map((r) => [r.id, r]));

    // Map: "roomTypeId_date" → daily override price
    const dailyOverrideMap = new Map(
      dailyOverrides.map((d) => [`${d.room_type_id}_${d.date}`, d.price])
    );

    // ── Detect overlapping seasons (data integrity warning) ────────
    // Overlap is blocked on create/update but may exist in migrated data.
    // Tie-break: season with the latest start_date wins (most specific).
    // Warn once per overlap pair so callers can surface it in logs.
    const sortedSeasons = [...seasons].sort((a, b) =>
      b.start_date.localeCompare(a.start_date)
    );

    // Detect and log overlapping season pairs
    for (let i = 0; i < sortedSeasons.length; i++) {
      for (let j = i + 1; j < sortedSeasons.length; j++) {
        const a = sortedSeasons[i];
        const b = sortedSeasons[j];
        if (a.start_date <= b.end_date && a.end_date >= b.start_date) {
          console.warn(
            `[pricing] Overlapping seasons detected: "${a.name}" (${a.start_date}–${a.end_date}) ` +
            `overlaps "${b.name}" (${b.start_date}–${b.end_date}). ` +
            `"${a.name}" wins (latest start_date).`
          );
        }
      }
    }

    // Map: "date" → winning season (latest start_date wins on overlap)
    // Pre-build this map for every date in the range so inner loop is O(1).
    const dateList: string[] = [];
    {
      const current = new Date(startDate + "T12:00:00");
      const end = new Date(endDate + "T12:00:00");
      while (current <= end) {
        dateList.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
    }

    // For each date, pick the first season in sortedSeasons that covers it
    // (sortedSeasons is already sorted latest-start first → tie-break applied)
    const dateSeason = new Map<string, typeof sortedSeasons[number]>();
    for (const dateStr of dateList) {
      const win = sortedSeasons.find(
        (s) => s.start_date <= dateStr && s.end_date >= dateStr
      );
      if (win) dateSeason.set(dateStr, win);
    }

    // Map: "seasonId_roomTypeId" → override { base_price, weekend_price }
    const seasonOverrideMap = new Map<
      string,
      { base_price: number; weekend_price: number | null }
    >();
    for (const season of seasons) {
      for (const ov of season.overrides ?? []) {
        seasonOverrideMap.set(`${season.id}_${ov.room_type_id}`, {
          base_price: Number(ov.base_price),
          weekend_price: ov.weekend_price != null ? Number(ov.weekend_price) : null,
        });
      }
    }

    // ── Resolve each cell ──────────────────────────────────────────
    for (const roomTypeId of roomTypeIds) {
      const roomType = roomTypeMap.get(roomTypeId);
      if (!roomType) continue;

      for (const dateStr of dateList) {
        const weekend = isWeekend(dateStr);

        // 1. Daily override
        const dailyPrice = dailyOverrideMap.get(`${roomTypeId}_${dateStr}`);
        if (dailyPrice !== undefined) {
          resolvedCells.push({
            roomTypeId,
            date: dateStr,
            price: Number(dailyPrice),
            source: "daily",
            isWeekend: weekend,
          });
          continue;
        }

        // 2. Seasonal rate (tie-broken: latest start_date wins)
        const season = dateSeason.get(dateStr);
        const seasonalOverride = season
          ? seasonOverrideMap.get(`${season.id}_${roomTypeId}`)
          : undefined;

        if (season && seasonalOverride) {
          const price = weekend
            ? (seasonalOverride.weekend_price ?? seasonalOverride.base_price)
            : seasonalOverride.base_price;

          resolvedCells.push({
            roomTypeId,
            date: dateStr,
            price,
            source: "seasonal",
            seasonName: season.name,
            isWeekend: weekend,
          });
          continue;
        }

        // 3. Season active but no override configured for this room type
        // Still falls through to base price — but tag source so the UI
        // can render a "season active / unconfigured" visual cue.
        if (season && !seasonalOverride) {
          const price = weekend
            ? (Number(roomType.weekend_price) || Number(roomType.base_price))
            : Number(roomType.base_price);

          resolvedCells.push({
            roomTypeId,
            date: dateStr,
            price,
            source: "base",
            seasonName: season.name,        // non-null = season active, no override
            isWeekend: weekend,
          });
          continue;
        }

        // 4. Fallback — base / weekend price
        const price = weekend
          ? (Number(roomType.weekend_price) || Number(roomType.base_price))
          : Number(roomType.base_price);

        resolvedCells.push({
          roomTypeId,
          date: dateStr,
          price,
          source: "base",
          isWeekend: weekend,
        });
      }
    }

    return { success: true as const, data: resolvedCells };
  } catch (err) {
    return toActionError(err);
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
    return toActionError(err);
  }
}
