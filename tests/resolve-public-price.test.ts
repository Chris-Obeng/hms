import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract test for the thin wrapper over public.resolve_nightly_rates().
 *
 * Precedence, season layering and weekend selection are the database's job now
 * and are proven against a real Postgres in the migration's own assertion
 * harness — a chainable mock cannot exercise SQL. What is testable here, and
 * what actually broke in the past, is the mapping: minor units to major, row
 * order to nights, and the totals the booking funnel reads.
 */

type Row = Record<string, unknown>;

interface NightlyRow {
  room_type_id: string;
  rate_plan_id: string | null;
  stay_date: string;
  occupancy: number;
  rate_minor: number | string;
  currency: string;
  source: "daily" | "seasonal" | "base";
  seasonal_rate_id: string | null;
  season_name: string | null;
}

const tableData: Record<string, Row[]> = { room_types: [] };

let rpcRows: NightlyRow[] = [];
let rpcError: { message: string } | null = null;
const rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];

/** One resolver row with the boring fields filled in. */
function night(over: Partial<NightlyRow> & { stay_date: string; rate_minor: number }): NightlyRow {
  return {
    room_type_id: "rt1",
    rate_plan_id: "plan1",
    occupancy: 0,
    currency: "GHS",
    source: "base",
    seasonal_rate_id: null,
    season_name: null,
    ...over,
  };
}

function queryBuilder(table: string) {
  const result = { data: tableData[table] ?? [], error: null };
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ["select", "eq", "in", "gte", "lte", "lt", "gt", "order"]) {
    builder[method] = () => builder;
  }
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => queryBuilder(table),
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      return Promise.resolve({ data: rpcError ? null : rpcRows, error: rpcError });
    },
  },
}));

const { getDefaultBookingDates, resolvePublicNightlyTotal, resolvePublicRoomPrices } = await import(
  "@/lib/pricing/resolve-public-price"
);

beforeEach(() => {
  tableData.room_types = [{ id: "rt1", base_price: 100 }];
  rpcRows = [];
  rpcError = null;
  rpcCalls.length = 0;
});

describe("getDefaultBookingDates", () => {
  it("returns today and tomorrow as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T22:00:00Z"));
    expect(getDefaultBookingDates()).toEqual({ checkIn: "2026-03-10", checkOut: "2026-03-11" });
    vi.useRealTimers();
  });

  it("rolls over month boundaries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T09:00:00Z"));
    expect(getDefaultBookingDates()).toEqual({ checkIn: "2026-01-31", checkOut: "2026-02-01" });
    vi.useRealTimers();
  });
});

describe("resolvePublicRoomPrices", () => {
  it("returns an empty list without calling the resolver when nothing is asked for", async () => {
    expect(await resolvePublicRoomPrices("h1", [], "2026-03-02", "2026-03-04")).toEqual([]);
    expect(await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-04", "2026-03-04")).toEqual([]);
    expect(await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-05", "2026-03-04")).toEqual([]);
    expect(rpcCalls).toHaveLength(0);
  });

  it("passes the stay window through to the resolver, defaulting plan and occupancy", async () => {
    rpcRows = [night({ stay_date: "2026-03-02", rate_minor: 10000 })];
    await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03");
    expect(rpcCalls[0]).toEqual({
      fn: "resolve_nightly_rates",
      params: {
        p_hotel_id: "h1",
        p_room_type_ids: ["rt1"],
        p_from: "2026-03-02",
        p_to: "2026-03-03",
        p_rate_plan_id: null,
        p_occupancy: 0,
      },
    });
  });

  it("forwards an explicit rate plan and occupancy", async () => {
    rpcRows = [night({ stay_date: "2026-03-02", rate_minor: 10000 })];
    await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03", {
      ratePlanId: "plan9",
      occupancy: 2,
    });
    expect(rpcCalls[0].params).toMatchObject({ p_rate_plan_id: "plan9", p_occupancy: 2 });
  });

  it("shapes resolver rows into nights, converting minor units to major", async () => {
    rpcRows = [
      night({ stay_date: "2026-03-02", rate_minor: 7750, source: "daily" }),
      night({
        stay_date: "2026-03-03",
        rate_minor: 20000,
        source: "seasonal",
        seasonal_rate_id: "s1",
        season_name: "Peak",
      }),
      night({ stay_date: "2026-03-04", rate_minor: 10000 }),
    ];

    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-05");
    expect(room.nights).toEqual([
      { date: "2026-03-02", price: 77.5, source: "daily" },
      { date: "2026-03-03", price: 200, source: "seasonal", seasonName: "Peak" },
      { date: "2026-03-04", price: 100, source: "base" },
    ]);
    expect(room.subtotal).toBe(377.5);
    expect(room.displayPrice).toBe(77.5);
  });

  it("converts using the row's own currency exponent", async () => {
    tableData.room_types = [{ id: "rt1", base_price: 12345 }];
    rpcRows = [night({ stay_date: "2026-03-02", rate_minor: 12345, currency: "JPY" })];

    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03");
    expect(room.nights[0].price).toBe(12345);
    expect(room.subtotal).toBe(12345);
    expect(room.hasOverride).toBe(false);
  });

  it("accepts rate_minor as a string, the way PostgREST returns bigint", async () => {
    rpcRows = [night({ stay_date: "2026-03-02", rate_minor: "10000" as unknown as number })];
    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03");
    expect(room.subtotal).toBe(100);
    expect(room.nights[0].price).toBe(100);
  });

  it("sums in minor units so a long stay cannot drift", async () => {
    // 33.33 x 3 summed as floats is 99.99000000000001.
    rpcRows = ["2026-03-02", "2026-03-03", "2026-03-04"].map((stay_date) =>
      night({ stay_date, rate_minor: 3333, source: "daily" })
    );
    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-05");
    expect(room.subtotal).toBe(99.99);
  });

  it("rounds the average nightly rate to two decimals", async () => {
    rpcRows = [
      night({ stay_date: "2026-03-02", rate_minor: 10000, source: "daily" }),
      night({ stay_date: "2026-03-03", rate_minor: 10100, source: "daily" }),
      night({ stay_date: "2026-03-04", rate_minor: 10100, source: "daily" }),
    ];
    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-05");
    expect(room.avgNightlyRate).toBe(100.67);
  });

  it("flags an override only when the first night differs from base_price", async () => {
    rpcRows = [night({ stay_date: "2026-03-02", rate_minor: 15000, source: "seasonal" })];
    const [overridden] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03");
    expect(overridden).toMatchObject({ displayPrice: 150, hasOverride: true });

    // A night tagged 'base' still priced at the room's own rate is not an override.
    rpcRows = [night({ stay_date: "2026-03-02", rate_minor: 10000 })];
    const [plain] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03");
    expect(plain).toMatchObject({ displayPrice: 100, hasOverride: false });
  });

  it("groups interleaved rows by room type and keeps the requested order", async () => {
    tableData.room_types = [
      { id: "rt1", base_price: 100 },
      { id: "rt2", base_price: 300 },
    ];
    rpcRows = [
      night({ room_type_id: "rt1", stay_date: "2026-03-02", rate_minor: 10000 }),
      night({ room_type_id: "rt2", stay_date: "2026-03-02", rate_minor: 30000 }),
      night({ room_type_id: "rt1", stay_date: "2026-03-03", rate_minor: 10000 }),
      night({ room_type_id: "rt2", stay_date: "2026-03-03", rate_minor: 30000 }),
    ];

    const results = await resolvePublicRoomPrices("h1", ["rt2", "rt1"], "2026-03-02", "2026-03-04");
    expect(results.map((r) => r.roomTypeId)).toEqual(["rt2", "rt1"]);
    expect(results.map((r) => r.displayPrice)).toEqual([300, 100]);
    expect(results.map((r) => r.subtotal)).toEqual([600, 200]);
    expect(results.every((r) => r.nights.length === 2)).toBe(true);
  });

  it("prices a room type the resolver returned no rows for at zero without throwing", async () => {
    const [room] = await resolvePublicRoomPrices("h1", ["missing"], "2026-03-02", "2026-03-04");
    expect(room).toMatchObject({
      roomTypeId: "missing",
      displayPrice: 0,
      hasOverride: false,
      subtotal: 0,
      avgNightlyRate: 0,
    });
    expect(room.nights.map((n) => n.date)).toEqual(["2026-03-02", "2026-03-03"]);
  });

  it("throws when the resolver fails instead of quoting an un-overridden price", async () => {
    rpcError = { message: "permission denied for function resolve_nightly_rates" };
    await expect(
      resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03")
    ).rejects.toThrow(/resolve_nightly_rates failed: permission denied/);
  });
});

describe("resolvePublicNightlyTotal", () => {
  it("returns the totals for a single room type", async () => {
    rpcRows = [
      night({ stay_date: "2026-03-02", rate_minor: 10000 }),
      night({ stay_date: "2026-03-03", rate_minor: 10000 }),
    ];
    expect(await resolvePublicNightlyTotal("h1", "rt1", "2026-03-02", "2026-03-04")).toEqual({
      subtotal: 200,
      avgNightlyRate: 100,
      displayPrice: 100,
      hasOverride: false,
      nights: [
        { date: "2026-03-02", price: 100, source: "base" },
        { date: "2026-03-03", price: 100, source: "base" },
      ],
    });
  });

  it("returns zeroed totals when the stay resolves to no nights", async () => {
    expect(await resolvePublicNightlyTotal("h1", "rt1", "2026-03-04", "2026-03-04")).toEqual({
      subtotal: 0,
      avgNightlyRate: 0,
      displayPrice: 0,
      hasOverride: false,
      nights: [],
    });
  });
});
