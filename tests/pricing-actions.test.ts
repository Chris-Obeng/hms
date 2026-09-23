import { beforeEach, describe, expect, it, vi } from "vitest";

const HOTEL_ID = "11111111-1111-4111-8111-111111111111";
const SEASON_ID = "22222222-2222-4222-8222-222222222222";
const NEW_SEASON_ID = "33333333-3333-4333-8333-333333333333";
const ROOM_TYPE_ID = "44444444-4444-4444-8444-444444444444";

type Result = { data: unknown; error: null };
type WriteCall = { table: string; method: "insert" | "upsert"; value: unknown };

const singleResults: Record<string, Result[]> = {};
const maybeResults: Record<string, Result[]> = {};
const writeCalls: WriteCall[] = [];

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "or"]) chain[method] = () => chain;
  chain.insert = (value: unknown) => {
    writeCalls.push({ table, method: "insert", value });
    return chain;
  };
  chain.upsert = (value: unknown) => {
    writeCalls.push({ table, method: "upsert", value });
    return chain;
  };
  chain.single = () => Promise.resolve(singleResults[table]?.shift() ?? { data: null, error: null });
  chain.maybeSingle = () => Promise.resolve(maybeResults[table]?.shift() ?? { data: null, error: null });
  return chain;
}

vi.mock("@/lib/auth", () => ({
  requireMinRole: () => Promise.resolve({
    hotelId: HOTEL_ID,
    staffId: "55555555-5555-4555-8555-555555555555",
    staffName: "Manager",
  }),
  requireAuth: vi.fn(),
  toActionError: (error: unknown) => ({ success: false, error: String(error) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ from: (table: string) => builder(table) }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/pricing/nightly-rates", () => ({ fetchNightlyRates: vi.fn(), nextDay: vi.fn() }));
vi.mock("@/lib/pricing/rate-restrictions", () => ({ fetchRestrictionFlags: vi.fn() }));
vi.mock("@/lib/money", () => ({ fromMinor: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/observability/sentry", () => ({ captureError: vi.fn() }));

const { duplicateSeasonalRate, upsertSeasonalRateOverride } = await import("@/app/actions/pricing");

beforeEach(() => {
  writeCalls.length = 0;
  for (const key of Object.keys(singleResults)) delete singleResults[key];
  for (const key of Object.keys(maybeResults)) delete maybeResults[key];
});

describe("seasonal override tenant writes", () => {
  it("copies each seasonal override with authenticated hotel_id", async () => {
    singleResults.seasonal_rates = [
      {
        data: {
          name: "Peak",
          start_date: "2026-09-01",
          end_date: "2026-09-03",
          priority: 1,
          overrides: [{ room_type_id: ROOM_TYPE_ID, base_price: 150, weekend_price: 175 }],
        },
        error: null,
      },
      { data: { id: NEW_SEASON_ID, name: "Copy of Peak", priority: 1 }, error: null },
    ];

    const result = await duplicateSeasonalRate(SEASON_ID);

    expect(result.success).toBe(true);
    expect(writeCalls).toContainEqual({
      table: "seasonal_rate_overrides",
      method: "insert",
      value: [{
        hotel_id: HOTEL_ID,
        seasonal_rate_id: NEW_SEASON_ID,
        room_type_id: ROOM_TYPE_ID,
        base_price: 150,
        weekend_price: 175,
      }],
    });
  });

  it("upserts seasonal override with authenticated hotel_id", async () => {
    singleResults.seasonal_rates = [{ data: { id: SEASON_ID }, error: null }];
    singleResults.room_types = [{ data: { id: ROOM_TYPE_ID }, error: null }];
    singleResults.seasonal_rate_overrides = [{ data: { id: "6", base_price: 200 }, error: null }];
    maybeResults.seasonal_rate_overrides = [{ data: null, error: null }];

    const result = await upsertSeasonalRateOverride(SEASON_ID, ROOM_TYPE_ID, 200, null);

    expect(result.success).toBe(true);
    expect(writeCalls).toContainEqual({
      table: "seasonal_rate_overrides",
      method: "upsert",
      value: {
        hotel_id: HOTEL_ID,
        seasonal_rate_id: SEASON_ID,
        room_type_id: ROOM_TYPE_ID,
        base_price: 200,
        weekend_price: null,
      },
    });
  });
});
