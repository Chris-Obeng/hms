import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

/** Rows returned per table by the mocked Supabase admin client. */
const tableData: Record<string, Row[]> = {
  room_types: [],
  seasonal_rates: [],
  daily_rate_overrides: [],
};

/**
 * Minimal chainable stub of the Supabase query builder: every filter method
 * returns the builder, and awaiting it resolves to the configured rows.
 */
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
  supabaseAdmin: { from: (table: string) => queryBuilder(table) },
}));

const { getDefaultBookingDates, resolvePublicNightlyTotal, resolvePublicRoomPrices } = await import(
  "@/lib/pricing/resolve-public-price"
);

beforeEach(() => {
  tableData.room_types = [{ id: "rt1", base_price: 100, weekend_price: 150 }];
  tableData.seasonal_rates = [];
  tableData.daily_rate_overrides = [];
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
  it("returns an empty list when no room types are requested", async () => {
    expect(await resolvePublicRoomPrices("h1", [], "2026-03-02", "2026-03-04")).toEqual([]);
  });

  it("returns an empty list when the stay has no nights", async () => {
    expect(await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-04", "2026-03-04")).toEqual([]);
    expect(await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-05", "2026-03-04")).toEqual([]);
  });

  it("builds one night per stay date, excluding the check-out night", async () => {
    // Mon 2026-03-02 → Wed 2026-03-04 = 2 weekday nights
    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-04");
    expect(room.nights.map((n) => n.date)).toEqual(["2026-03-02", "2026-03-03"]);
    expect(room.nights.every((n) => n.source === "base" && n.price === 100)).toBe(true);
    expect(room.subtotal).toBe(200);
    expect(room.avgNightlyRate).toBe(100);
    expect(room.displayPrice).toBe(100);
    expect(room.hasOverride).toBe(false);
  });

  it("uses weekend_price for Friday and Saturday nights", async () => {
    // Fri 2026-03-06 → Sun 2026-03-08 = Fri + Sat
    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-06", "2026-03-08");
    expect(room.nights.map((n) => n.price)).toEqual([150, 150]);
    expect(room.displayPrice).toBe(150);
    expect(room.hasOverride).toBe(true);
  });

  it("falls back to base_price when weekend_price is null", async () => {
    tableData.room_types = [{ id: "rt1", base_price: 100, weekend_price: null }];
    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-06", "2026-03-07");
    expect(room.nights[0].price).toBe(100);
    expect(room.hasOverride).toBe(false);
  });

  it("prefers daily overrides over seasonal and base rates", async () => {
    tableData.seasonal_rates = [
      {
        id: "s1",
        name: "Peak",
        start_date: "2026-03-01",
        end_date: "2026-03-31",
        overrides: [{ room_type_id: "rt1", base_price: 200, weekend_price: 250 }],
      },
    ];
    tableData.daily_rate_overrides = [{ room_type_id: "rt1", date: "2026-03-02", price: "77.5" }];

    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-04");
    expect(room.nights[0]).toEqual({ date: "2026-03-02", price: 77.5, source: "daily" });
    expect(room.nights[1]).toMatchObject({ price: 200, source: "seasonal", seasonName: "Peak" });
    expect(room.subtotal).toBe(277.5);
    expect(room.avgNightlyRate).toBe(138.75);
  });

  it("applies seasonal weekend prices, falling back to the seasonal base price", async () => {
    tableData.seasonal_rates = [
      {
        id: "s1",
        name: "Peak",
        start_date: "2026-03-01",
        end_date: "2026-03-31",
        overrides: [{ room_type_id: "rt1", base_price: 200, weekend_price: 250 }],
      },
    ];
    // Fri + Sat
    const [weekend] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-06", "2026-03-08");
    expect(weekend.nights.map((n) => n.price)).toEqual([250, 250]);

    tableData.seasonal_rates[0].overrides = [
      { room_type_id: "rt1", base_price: 200, weekend_price: null },
    ];
    const [noWeekendRate] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-06", "2026-03-08");
    expect(noWeekendRate.nights.map((n) => n.price)).toEqual([200, 200]);
  });

  it("ignores a season that has no override for the requested room type", async () => {
    tableData.seasonal_rates = [
      {
        id: "s1",
        name: "Peak",
        start_date: "2026-03-01",
        end_date: "2026-03-31",
        overrides: [{ room_type_id: "other", base_price: 999, weekend_price: null }],
      },
    ];
    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03");
    expect(room.nights[0]).toMatchObject({ price: 100, source: "base" });
  });

  it("breaks overlapping seasons by latest start_date and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    tableData.seasonal_rates = [
      {
        id: "s1",
        name: "Early",
        start_date: "2026-03-01",
        end_date: "2026-03-31",
        overrides: [{ room_type_id: "rt1", base_price: 200, weekend_price: null }],
      },
      {
        id: "s2",
        name: "Late",
        start_date: "2026-03-02",
        end_date: "2026-03-10",
        overrides: [{ room_type_id: "rt1", base_price: 300, weekend_price: null }],
      },
    ];

    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-03");
    expect(room.nights[0]).toMatchObject({ price: 300, seasonName: "Late" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Overlapping seasons"));
    warn.mockRestore();
  });

  it("prices unknown room types at zero without throwing", async () => {
    const [room] = await resolvePublicRoomPrices("h1", ["missing"], "2026-03-02", "2026-03-03");
    expect(room).toMatchObject({ roomTypeId: "missing", displayPrice: 0, hasOverride: false, subtotal: 0 });
  });

  it("preserves the requested room type order", async () => {
    tableData.room_types = [
      { id: "rt1", base_price: 100, weekend_price: null },
      { id: "rt2", base_price: 300, weekend_price: null },
    ];
    const results = await resolvePublicRoomPrices("h1", ["rt2", "rt1"], "2026-03-02", "2026-03-03");
    expect(results.map((r) => r.roomTypeId)).toEqual(["rt2", "rt1"]);
    expect(results.map((r) => r.displayPrice)).toEqual([300, 100]);
  });

  it("rounds the average nightly rate to two decimals", async () => {
    tableData.daily_rate_overrides = [
      { room_type_id: "rt1", date: "2026-03-02", price: 100 },
      { room_type_id: "rt1", date: "2026-03-03", price: 101 },
      { room_type_id: "rt1", date: "2026-03-04", price: 101 },
    ];
    const [room] = await resolvePublicRoomPrices("h1", ["rt1"], "2026-03-02", "2026-03-05");
    expect(room.avgNightlyRate).toBe(100.67);
  });
});

describe("resolvePublicNightlyTotal", () => {
  it("returns the totals for a single room type", async () => {
    const result = await resolvePublicNightlyTotal("h1", "rt1", "2026-03-02", "2026-03-04");
    expect(result).toEqual({
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
    const result = await resolvePublicNightlyTotal("h1", "rt1", "2026-03-04", "2026-03-04");
    expect(result).toEqual({
      subtotal: 0,
      avgNightlyRate: 0,
      displayPrice: 0,
      hasOverride: false,
      nights: [],
    });
  });
});
