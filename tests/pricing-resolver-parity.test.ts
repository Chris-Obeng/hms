/**
 * tests/pricing-resolver-parity.test.ts
 *
 * The merge gate for Phase 6.
 *
 * Nightly rate precedence used to live in TypeScript, once in the guest funnel
 * and again in the staff rate matrix. It now lives in
 * `public.resolve_nightly_rates()` (supabase/migrations/20260831030000_…sql) and
 * both callers read it through `lib/pricing/nightly-rates.ts`. Moving pricing
 * rules is the kind of change that silently reprices live inventory, so this
 * test re-derives every night from the original rules in TypeScript and demands
 * the database agree exactly — not on a spot check, but over 120 consecutive
 * nights for every room type crossed with every rate plan and two occupancies.
 *
 * The fixture is generated, never hand-edited:
 *
 *   pnpm db:parity-fixture      (supabase/tests/pricing_parity_fixture.sql)
 *
 * That script seeds an adversarial hotel into a local database inside a
 * transaction, records both the inputs the resolver read and the rates it
 * returned, and rolls back. Recording it keeps the gate runnable in CI with no
 * database, and keeps regeneration honest: a resolver change that alters a price
 * fails here until someone regenerates the fixture and explains the diff.
 *
 * Season selection is not reimplemented — `lib/pricing/season-layering.ts` is
 * imported, so the ordering the old resolvers used is literally the ordering
 * under test. Everything else (plan choice, override lookup, weekend fallback)
 * is transcribed from the pre-Phase-6 engines, with the two behaviour changes
 * the migration deliberately made:
 *
 *   1. Daily overrides are keyed (rate_plan_id, date, occupancy). The old matrix
 *      keyed (room_type_id, date) and so applied a non-default plan's override
 *      to every plan.
 *   2. A weekend price of 0 wins. The old code used `weekend || base`, which
 *      treated 0 as absent. Prices are validated > 0 everywhere, so no stored
 *      row can tell the difference.
 *
 * Money is compared in minor units. A float comparison here would be a way for
 * a rounding regression to pass.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareSeasonPriority,
  findWinningSeason,
} from "@/lib/pricing/season-layering";

// ── Fixture shape ────────────────────────────────────────────────
// Mirrors the json_build_object calls in supabase/tests/pricing_parity_fixture.sql.

interface FixtureRoomType {
  id: string;
  name: string;
  base_price_minor: number;
  weekend_price_minor: number | null;
}

interface FixtureRatePlan {
  id: string;
  room_type_id: string;
  currency: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface FixtureSeason {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  priority: number | null;
}

interface FixtureSeasonalOverride {
  season_name: string;
  rate_plan_id: string;
  occupancy: number;
  base_price_minor: number;
  weekend_price_minor: number | null;
}

interface FixtureDailyOverride {
  rate_plan_id: string;
  date: string;
  occupancy: number;
  price_minor: number;
}

interface FixtureInputs {
  kind: "inputs";
  from: string;
  to: string;
  hotel_id: string;
  hotel_currency: string | null;
  room_types: FixtureRoomType[];
  rate_plans: FixtureRatePlan[];
  seasons: FixtureSeason[];
  seasonal_overrides: FixtureSeasonalOverride[];
  daily_overrides: FixtureDailyOverride[];
}

/**
 * One resolved night, positional to keep the fixture small:
 * [stay_date, rate_minor, source, season_name, active_season_name, is_weekend]
 */
type FixtureNight = [
  string,
  number | string,
  "daily" | "seasonal" | "base",
  string | null,
  string | null,
  boolean,
];

interface FixtureCase {
  kind: "case";
  room_type_id: string;
  /** null exercises "let the resolver pick the room type's default plan". */
  requested_rate_plan_id: string | null;
  occupancy: number;
  /** DISTINCT over the rows, so a case that resolved two plans is visible here. */
  resolved_rate_plan_ids: (string | null)[];
  currencies: (string | null)[];
  nights: FixtureNight[];
}

/** Resolved from this module, not from cwd, so the path holds under any runner. */
const FIXTURE = new URL("./fixtures/pricing-parity.jsonl", import.meta.url);
const FIXTURE_LABEL = "tests/fixtures/pricing-parity.jsonl";

function loadFixture(): { inputs: FixtureInputs; cases: FixtureCase[] } {
  const lines = readFileSync(FIXTURE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const docs = lines.map((line, i) => {
    try {
      return JSON.parse(line) as FixtureInputs | FixtureCase;
    } catch {
      throw new Error(
        `${FIXTURE_LABEL}:${i + 1} is not JSON. Regenerate with: pnpm db:parity-fixture`
      );
    }
  });

  const inputs = docs.find((d): d is FixtureInputs => d.kind === "inputs");
  if (!inputs) throw new Error(`${FIXTURE_LABEL} has no "inputs" document`);
  return { inputs, cases: docs.filter((d): d is FixtureCase => d.kind === "case") };
}

// ── The rules, as TypeScript ─────────────────────────────────────

/** check-in … check-out - 1, the same half-open window the resolver walks. */
function stayNights(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (cur < end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Friday or Saturday, read in UTC. Matches SQL's extract(isodow) IN (5, 6). */
function isWeekend(date: string): boolean {
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  return dow === 5 || dow === 6;
}

/**
 * The plan the resolver prices: the requested one when it belongs to this room
 * type and is either active or explicitly named, otherwise the room type's
 * default. Transcribed from the resolver's LATERAL:
 *   ORDER BY (id = requested) DESC, is_default DESC, created_at, id
 */
function pickPlan(
  plans: FixtureRatePlan[],
  roomTypeId: string,
  requested: string | null
): FixtureRatePlan | undefined {
  return plans
    .filter(
      (p) =>
        p.room_type_id === roomTypeId && (p.is_active || p.id === requested)
    )
    .sort((a, b) => {
      const wanted = Number(b.id === requested) - Number(a.id === requested);
      if (wanted !== 0) return wanted;
      const byDefault = Number(b.is_default) - Number(a.is_default);
      if (byDefault !== 0) return byDefault;
      const byAge = Date.parse(a.created_at) - Date.parse(b.created_at);
      if (byAge !== 0) return byAge;
      return a.id.localeCompare(b.id);
    })[0];
}

interface ExpectedNight {
  date: string;
  rateMinor: number;
  source: "daily" | "seasonal" | "base";
  /** The season that actually set the price, or null. */
  seasonName: string | null;
  /** The winning season for the night, priced or not. */
  activeSeasonName: string | null;
  isWeekend: boolean;
}

/** Everything one case needs, indexed once instead of per night. */
function buildReference(inputs: FixtureInputs) {
  const roomTypes = new Map(inputs.room_types.map((rt) => [rt.id, rt]));
  // Sorted once, exactly as the pre-Phase-6 engines did; findWinningSeason then
  // takes the first covering season.
  const seasons = [...inputs.seasons].sort(compareSeasonPriority);

  const seasonal = new Map(
    inputs.seasonal_overrides.map((o) => [
      `${o.season_name}|${o.rate_plan_id}|${o.occupancy}`,
      o,
    ])
  );
  const daily = new Map(
    inputs.daily_overrides.map((o) => [
      `${o.rate_plan_id}|${o.date}|${o.occupancy}`,
      o,
    ])
  );

  function resolve(
    roomTypeId: string,
    requestedPlanId: string | null,
    occupancy: number,
    date: string
  ): ExpectedNight {
    const rt = roomTypes.get(roomTypeId);
    if (!rt) throw new Error(`fixture inputs have no room type ${roomTypeId}`);

    const plan = pickPlan(inputs.rate_plans, roomTypeId, requestedPlanId);
    const weekend = isWeekend(date);
    const winner = findWinningSeason(seasons, date);
    const active = winner?.name ?? null;

    const dro = plan ? daily.get(`${plan.id}|${date}|${occupancy}`) : undefined;
    if (dro) {
      return {
        date,
        rateMinor: Number(dro.price_minor),
        source: "daily",
        seasonName: null,
        activeSeasonName: active,
        isWeekend: weekend,
      };
    }

    const sro =
      winner && plan
        ? seasonal.get(`${winner.name}|${plan.id}|${occupancy}`)
        : undefined;
    if (sro) {
      const minor =
        weekend && sro.weekend_price_minor !== null
          ? sro.weekend_price_minor
          : sro.base_price_minor;
      return {
        date,
        rateMinor: Number(minor),
        source: "seasonal",
        seasonName: winner?.name ?? null,
        activeSeasonName: active,
        isWeekend: weekend,
      };
    }

    const minor =
      weekend && rt.weekend_price_minor !== null
        ? rt.weekend_price_minor
        : rt.base_price_minor;
    return {
      date,
      rateMinor: Number(minor),
      source: "base",
      seasonName: null,
      activeSeasonName: active,
      isWeekend: weekend,
    };
  }

  function planFor(roomTypeId: string, requestedPlanId: string | null) {
    return pickPlan(inputs.rate_plans, roomTypeId, requestedPlanId);
  }

  function currencyFor(roomTypeId: string, requestedPlanId: string | null) {
    const plan = planFor(roomTypeId, requestedPlanId);
    return plan?.currency ?? inputs.hotel_currency ?? "GHS";
  }

  return { resolve, planFor, currencyFor };
}

// ── The gate ─────────────────────────────────────────────────────

const { inputs, cases } = loadFixture();
const nightDates = stayNights(inputs.from, inputs.to);
const reference = buildReference(inputs);

describe("resolve_nightly_rates parity", () => {
  it("reads a fixture of the shape the generator promises", () => {
    // 4 room types x (their own plans + the null default case) x 2 occupancies.
    expect(cases).toHaveLength(22);
    expect(nightDates).toHaveLength(120);
    // Two month boundaries and a year boundary are the point of the window.
    expect(nightDates[0]).toBe(inputs.from);
    expect(nightDates).toContain("2027-01-01");

    for (const c of cases) {
      expect(c.nights.map((n) => n[0])).toEqual(nightDates);
    }
  });

  it("resolves the rate plan and currency the rules choose", () => {
    for (const c of cases) {
      const plan = reference.planFor(c.room_type_id, c.requested_rate_plan_id);
      const label = `${c.room_type_id} plan=${c.requested_rate_plan_id ?? "default"} occ=${c.occupancy}`;

      // One plan per (room type, request): a second id here would mean the
      // resolver priced one call against two plans.
      expect(c.resolved_rate_plan_ids, label).toEqual([plan?.id ?? null]);
      expect(c.currencies, label).toEqual([
        reference.currencyFor(c.room_type_id, c.requested_rate_plan_id),
      ]);
    }
  });

  it("prices all 2640 nights exactly as the original rules do", () => {
    const diffs: string[] = [];

    for (const c of cases) {
      for (const [date, rateMinor, source, seasonName, activeSeasonName, weekend] of c.nights) {
        const want = reference.resolve(
          c.room_type_id,
          c.requested_rate_plan_id,
          c.occupancy,
          date
        );
        const got = {
          date,
          rateMinor: Number(rateMinor),
          source,
          seasonName,
          activeSeasonName,
          isWeekend: weekend,
        };
        if (
          got.rateMinor !== want.rateMinor ||
          got.source !== want.source ||
          got.seasonName !== want.seasonName ||
          got.activeSeasonName !== want.activeSeasonName ||
          got.isWeekend !== want.isWeekend
        ) {
          diffs.push(
            `${date} rt=${c.room_type_id} plan=${c.requested_rate_plan_id ?? "default"} occ=${c.occupancy}\n` +
              `  sql: ${JSON.stringify(got)}\n  ref: ${JSON.stringify(want)}`
          );
        }
      }
    }

    const compared = cases.reduce((n, c) => n + c.nights.length, 0);
    expect(compared).toBe(2640);
    // Every difference, not the first: a repricing regression is easier to read
    // whole. Zero is the only passing count — see the header.
    expect(diffs.slice(0, 10).join("\n"), `${diffs.length} of ${compared} nights differ`).toBe("");
  });

  // A gate that stops exercising a branch stops guarding it, and a fixture is
  // easy to regenerate against a hotel that has quietly lost its overrides.
  it("still exercises every precedence branch", () => {
    const nights = cases.flatMap((c) => c.nights);
    const bySource = (s: string) => nights.filter((n) => n[2] === s).length;

    expect(bySource("daily")).toBeGreaterThan(0);
    expect(bySource("seasonal")).toBeGreaterThan(0);
    expect(bySource("base")).toBeGreaterThan(0);

    // The rule most easily broken by a rewrite: a winning season that does not
    // price this room type falls through to base, not to the season below it.
    expect(nights.some((n) => n[2] === "base" && n[4] !== null)).toBe(true);
    // A daily override outranks the season but must not hide it.
    expect(nights.some((n) => n[2] === "daily" && n[4] !== null)).toBe(true);
    // Nights no season covers at all.
    expect(nights.some((n) => n[4] === null)).toBe(true);
    // Weekend fallback on both sides of the flag.
    expect(nights.some((n) => n[5])).toBe(true);
    expect(nights.some((n) => !n[5])).toBe(true);

    // A plan currency overriding the hotel's, and a room type with no weekend
    // price of its own.
    expect(cases.some((c) => c.currencies.some((cur) => cur !== inputs.hotel_currency))).toBe(true);
    expect(inputs.room_types.some((rt) => rt.weekend_price_minor === null)).toBe(true);

    // An inactive plan is priceable only when the caller names it.
    const inactive = inputs.rate_plans.find((p) => !p.is_active);
    expect(inactive).toBeDefined();
    expect(
      cases.some(
        (c) =>
          c.requested_rate_plan_id === inactive?.id &&
          c.resolved_rate_plan_ids.includes(inactive.id)
      )
    ).toBe(true);
  });
});
