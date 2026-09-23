import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit contract for the per-date restriction reader the availability matrix
 * renders its badges from.
 *
 * The SQL half — which date each control is evaluated against, and whom the
 * bookings guard refuses — is proven against a real Postgres in
 * supabase/tests/rate_restrictions.sql; a mock cannot exercise a trigger. What
 * is testable here is everything that would mis-render a calendar without
 * failing anything: a row whose controls have all been cleared lighting up a
 * cell, a map key that no longer matches the one getResolvedRates looks up, a
 * badge order that disagrees with the guest copy, or a SELECT that stops naming
 * a column the flags are built from.
 */

type RestrictionRow = {
  rate_plan_id: string;
  date: string;
  min_stay: number | null;
  min_stay_arrival: number | null;
  min_stay_through: number | null;
  max_stay: number | null;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  stop_sell: boolean;
};

let rows: RestrictionRow[] = [];
let readError: { message: string } | null = null;
let filters: { method: string; args: unknown[] }[] = [];
let selected: string | null = null;
let relation: string | null = null;

function queryBuilder() {
  const result = { data: readError ? null : rows, error: readError };
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ["eq", "in", "gte", "lte"]) {
    builder[method] = (...args: unknown[]) => {
      filters.push({ method, args });
      return builder;
    };
  }
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      relation = table;
      return {
        select: (columns: string) => {
          selected = columns;
          return queryBuilder();
        },
      };
    },
  },
}));

const { fetchRestrictionFlags, restrictionMarkers, toRestrictionFlags } = await import(
  "@/lib/pricing/rate-restrictions"
);

/** One row with every control cleared, so each case sets only what it is about. */
function row(over: Partial<RestrictionRow> = {}): RestrictionRow {
  return {
    rate_plan_id: "plan-a",
    date: "2026-10-05",
    min_stay: null,
    min_stay_arrival: null,
    min_stay_through: null,
    max_stay: null,
    closed_to_arrival: false,
    closed_to_departure: false,
    stop_sell: false,
    ...over,
  };
}

beforeEach(() => {
  rows = [];
  readError = null;
  filters = [];
  selected = null;
  relation = null;
});

describe("toRestrictionFlags", () => {
  it("returns null for a row that restricts nothing", () => {
    // Clearing the last control leaves the row behind unless the caller deletes
    // it, and an empty row must not mark a date.
    expect(toRestrictionFlags(row())).toBeNull();
  });

  it("treats max_stay = 0 as cleared, not as a zero-night maximum", () => {
    expect(toRestrictionFlags(row({ max_stay: 0 }))).toBeNull();
    expect(toRestrictionFlags(row({ max_stay: 0, min_stay: 2 }))).toEqual(
      expect.objectContaining({ maxStay: null, minStay: 2 })
    );
  });

  it("drops non-positive minimums", () => {
    expect(toRestrictionFlags(row({ min_stay: 0, min_stay_arrival: -1 }))).toBeNull();
  });

  it("carries every set control through under its UI name", () => {
    const flags = toRestrictionFlags(
      row({
        min_stay: 3,
        min_stay_arrival: 2,
        min_stay_through: 4,
        max_stay: 14,
        closed_to_arrival: true,
        closed_to_departure: true,
        stop_sell: true,
      })
    );
    expect(flags).toEqual({
      minStay: 3,
      minStayArrival: 2,
      minStayThrough: 4,
      maxStay: 14,
      closedToArrival: true,
      closedToDeparture: true,
      stopSell: true,
    });
  });
});

describe("restrictionMarkers", () => {
  const all = {
    minStay: 3,
    minStayArrival: 2,
    minStayThrough: 4,
    maxStay: 14,
    closedToArrival: true,
    closedToDeparture: true,
    stopSell: true,
  };

  it("orders badges the way stay_restriction_violations orders its codes", () => {
    // One order across the SQL, the guest copy and the grid: the first thing a
    // person sees is the same fact on whichever surface they are looking at.
    expect(restrictionMarkers(all).map((m) => m.code)).toEqual([
      "stop",
      "cta",
      "ctd",
      "min",
      "min-arrival",
      "min-through",
      "max",
    ]);
  });

  it("labels a minimum n+ and a maximum with a less-than-or-equal sign", () => {
    const labels = new Map(restrictionMarkers(all).map((m) => [m.code, m.label]));
    expect(labels.get("min")).toBe("3+");
    expect(labels.get("max")).toBe("≤14");
  });

  it("writes a one-night control in the singular", () => {
    const titles = restrictionMarkers({ ...all, minStay: 1 }).map((m) => m.title);
    expect(titles).toContain("Minimum stay 1 night");
    expect(titles.join(" ")).not.toContain("1 nights");
  });

  it("emits nothing when nothing is set", () => {
    expect(
      restrictionMarkers({
        minStay: null,
        minStayArrival: null,
        minStayThrough: null,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: false,
      })
    ).toEqual([]);
  });
});

describe("fetchRestrictionFlags", () => {
  it("keys the map exactly the way getResolvedRates looks it up", async () => {
    rows = [row({ rate_plan_id: "plan-a", date: "2026-10-05", min_stay: 3 })];
    const flags = await fetchRestrictionFlags("hotel-1", ["plan-a"], "2026-10-01", "2026-10-31");
    expect([...flags.keys()]).toEqual(["plan-a_2026-10-05"]);
    expect(flags.get("plan-a_2026-10-05")?.minStay).toBe(3);
  });

  it("does not touch the database when no plan priced the window", async () => {
    const flags = await fetchRestrictionFlags("hotel-1", [], "2026-10-01", "2026-10-31");
    expect(flags.size).toBe(0);
    expect(relation).toBeNull();
  });

  it("scopes the read by hotel, plan and date range, and asks once per grid", async () => {
    await fetchRestrictionFlags(
      "hotel-1",
      ["plan-a", "plan-b", "plan-a"],
      "2026-10-01",
      "2026-10-31"
    );
    expect(relation).toBe("rate_restrictions");
    expect(filters).toEqual([
      { method: "eq", args: ["hotel_id", "hotel-1"] },
      // Deduped: a grid repeats one plan across every room type it prices.
      { method: "in", args: ["rate_plan_id", ["plan-a", "plan-b"]] },
      { method: "gte", args: ["date", "2026-10-01"] },
      { method: "lte", args: ["date", "2026-10-31"] },
    ]);
  });

  it("selects every column the flags are built from", async () => {
    // A flag added to RestrictionFlags without its column here would read as
    // undefined and quietly clear itself, so the SELECT is pinned to the shape.
    await fetchRestrictionFlags("hotel-1", ["plan-a"], "2026-10-01", "2026-10-31");
    for (const column of Object.keys(row())) {
      expect(selected).toContain(column);
    }
  });

  it("leaves a date whose controls have all been cleared off the map", async () => {
    rows = [
      row({ date: "2026-10-05", max_stay: 0 }),
      row({ date: "2026-10-06", closed_to_arrival: true }),
    ];
    const flags = await fetchRestrictionFlags("hotel-1", ["plan-a"], "2026-10-01", "2026-10-31");
    expect([...flags.keys()]).toEqual(["plan-a_2026-10-06"]);
  });

  it("throws when the read fails, so the caller decides whether to fail soft", async () => {
    readError = { message: "permission denied for table rate_restrictions" };
    await expect(
      fetchRestrictionFlags("hotel-1", ["plan-a"], "2026-10-01", "2026-10-31")
    ).rejects.toThrow("permission denied for table rate_restrictions");
  });
});
