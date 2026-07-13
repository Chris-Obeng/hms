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

const BulkDailyOverrideSchema = z.array(DailyOverrideSchema);

const DailyOverrideDeleteSchema = z.object({
  roomTypeId: z.string().uuid("Invalid room type ID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
});
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
          hotel_id: hotelId,
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

    if (overrides.length === 0) {
      return { success: true };
    }

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

    // Loop through dates
    const start = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");

    const dateList: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      dateList.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }

    for (const roomTypeId of roomTypeIds) {
      const roomType = roomTypes.find((r) => r.id === roomTypeId);
      if (!roomType) continue;

      for (const dateStr of dateList) {
        const weekend = isWeekend(dateStr);

        // 1. Check daily overrides
        const dailyOverride = dailyOverrides.find(
          (d) => d.room_type_id === roomTypeId && d.date === dateStr
        );

        if (dailyOverride) {
          resolvedCells.push({
            roomTypeId,
            date: dateStr,
            price: Number(dailyOverride.price),
            source: "daily",
            isWeekend: weekend,
          });
          continue;
        }

        // 2. Check seasonal rates (at most one should cover)
        const season = seasons.find((s) => s.start_date <= dateStr && s.end_date >= dateStr);
        const seasonalOverride = season?.overrides?.find((o) => o.room_type_id === roomTypeId);

        if (season && seasonalOverride) {
          const price = weekend
            ? (seasonalOverride.weekend_price ?? seasonalOverride.base_price)
            : seasonalOverride.base_price;

          resolvedCells.push({
            roomTypeId,
            date: dateStr,
            price: Number(price),
            source: "seasonal",
            seasonName: season.name,
            isWeekend: weekend,
          });
          continue;
        }

        // 3. Fallback to base pricing
        const price = weekend
          ? (roomType.weekend_price ?? roomType.base_price)
          : roomType.base_price;

        resolvedCells.push({
          roomTypeId,
          date: dateStr,
          price: Number(price),
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
