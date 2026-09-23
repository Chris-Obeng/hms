import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  toDailyOverrideInsert,
  toRoomTypeInsert,
  toSeasonalOverrideInsert,
} from "@/lib/supabase/trigger-derived";

const RATE_PLANS_MIGRATION = new URL(
  "../supabase/migrations/20260831020000_rate_plans.sql",
  import.meta.url
);

function loadSql(url: URL): string {
  return readFileSync(url, "utf8");
}

/**
 * Locks the database guarantee that lib/supabase/trigger-derived.ts relies on:
 * the sync_*_price_minor triggers ALWAYS derive rate_plan_id and the minor-unit
 * price columns on INSERT/UPDATE, overwriting client input. If a future
 * migration drops or weakens one of these triggers, the Draft->Insert casts in
 * trigger-derived.ts become lies — this test must fail first.
 */
describe("trigger-derived insert columns contract", () => {
  const sql = loadSql(RATE_PLANS_MIGRATION);

  it("installs all three sync triggers as BEFORE INSERT OR UPDATE", () => {
    for (const fn of [
      "sync_room_type_price_minor",
      "sync_daily_rate_override_minor",
      "sync_seasonal_rate_override_minor",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}()`);
      expect(sql).toMatch(
        new RegExp(`CREATE TRIGGER ${fn}[\\s\\S]*?BEFORE INSERT OR UPDATE`)
      );
    }
  });

  it("derives rate_plan_id from the room type default plan when not supplied", () => {
    const derivation = /NEW\.rate_plan_id IS NULL THEN[\s\S]*?rp\.is_default/;
    // daily + seasonal override triggers both carry this derivation
    expect(sql.match(new RegExp(derivation.source, "g"))?.length).toBe(2);
  });

  it("overwrites minor-unit columns from the numeric price and hotel currency", () => {
    expect(sql).toContain(
      "NEW.base_price_minor    := public.to_minor(NEW.base_price, v_currency)"
    );
    expect(sql).toContain(
      "NEW.price_minor := public.to_minor(NEW.price, v_currency)"
    );
    expect(sql).toContain("Client-supplied minor values are always overwritten");
  });

  it("enforces NOT NULL on the derived columns so inserts cannot bypass the trigger silently", () => {
    expect(sql).toContain("ALTER COLUMN base_price_minor SET NOT NULL");
    expect(sql).toContain("ALTER COLUMN rate_plan_id SET NOT NULL");
    expect(sql).toContain("ALTER COLUMN price_minor  SET NOT NULL");
  });

  it("exports the three typed insert adapters", () => {
    expect(typeof toSeasonalOverrideInsert).toBe("function");
    expect(typeof toDailyOverrideInsert).toBe("function");
    expect(typeof toRoomTypeInsert).toBe("function");
  });
});
