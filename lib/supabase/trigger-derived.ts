import type { Database } from "@/types/database.types";

type TableInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/**
 * Trigger-derived insert columns.
 *
 * Migration 20260831020000 added NOT NULL money/plan columns to room_types,
 * daily_rate_overrides and seasonal_rate_overrides, and BEFORE INSERT/UPDATE
 * triggers that ALWAYS derive them:
 *
 *   sync_room_type_price_minor()        — base_price_minor / weekend_price_minor
 *   sync_daily_rate_override_minor()    — price_minor, rate_plan_id
 *   sync_seasonal_rate_override_minor() — base_price_minor / weekend_price_minor,
 *                                         rate_plan_id
 *
 * Client-supplied minor values are overwritten, and a null rate_plan_id is
 * resolved to the room type's default plan (a plan from another room type is
 * rejected). The database is therefore the single source of truth for these
 * derivations — app code must NOT recompute them (that would be a third
 * exponent/plan-resolution implementation alongside lib/money and to_minor).
 *
 * The generated Insert types still mark the columns required, because
 * supabase gen types cannot see trigger behaviour. The Draft types below are
 * what callers legitimately supply; the to*Insert helpers are the single,
 * documented seam where the trigger guarantee is acknowledged.
 *
 * That guarantee is locked by tests/trigger-derived-columns.test.ts — if a
 * sync trigger is ever dropped or stops deriving these columns, that test
 * must fail before these casts become a lie.
 */

export type SeasonalOverrideInsertDraft = Omit<
  TableInsert<"seasonal_rate_overrides">,
  "rate_plan_id" | "base_price_minor" | "weekend_price_minor"
>;

export type DailyOverrideInsertDraft = Omit<
  TableInsert<"daily_rate_overrides">,
  "rate_plan_id" | "price_minor"
>;

export type RoomTypeInsertDraft = Omit<
  TableInsert<"room_types">,
  "base_price_minor" | "weekend_price_minor"
>;

export function toSeasonalOverrideInsert(
  row: SeasonalOverrideInsertDraft
): TableInsert<"seasonal_rate_overrides"> {
  return row as TableInsert<"seasonal_rate_overrides">;
}

export function toDailyOverrideInsert(
  row: DailyOverrideInsertDraft
): TableInsert<"daily_rate_overrides"> {
  return row as TableInsert<"daily_rate_overrides">;
}

export function toRoomTypeInsert(
  row: RoomTypeInsertDraft
): TableInsert<"room_types"> {
  return row as TableInsert<"room_types">;
}
