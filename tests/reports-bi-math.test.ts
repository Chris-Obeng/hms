import { describe, expect, it } from "vitest";
import { parseISO } from "date-fns";
import {
  adr,
  allocateMinorExactly,
  allocateNightlyRevenue,
  occupancyFromAvailability,
  pctDelta,
  pointsDelta,
  priorRange,
  revpag,
  revpar,
  reconcileBookingNights,
  stayNightsInRange,
  type StayRow,
  type NightRow,
} from "@/lib/reports/bi-math";

const d = (s: string) => parseISO(s);
const day = (x: Date) => x.toISOString().slice(0, 10);

describe("stayNightsInRange — a night is check_in <= d < check_out", () => {
  const start = d("2026-06-01");
  const end = d("2026-06-30");

  it("counts a stay fully inside the range", () => {
    expect(stayNightsInRange("2026-06-10", "2026-06-13", start, end)).toBe(3);
  });

  it("never counts the checkout day as a night", () => {
    expect(stayNightsInRange("2026-06-10", "2026-06-11", start, end)).toBe(1);
  });

  it("clips nights before the range start", () => {
    expect(stayNightsInRange("2026-06-01", "2026-06-05", d("2026-06-03"), end)).toBe(2);
  });

  it("clips nights after the range end", () => {
    expect(stayNightsInRange("2026-06-28", "2026-07-02", start, end)).toBe(3);
  });

  it("is zero for a stay entirely before the range", () => {
    expect(stayNightsInRange("2026-05-01", "2026-05-03", start, end)).toBe(0);
  });

  it("is zero when checkout lands on the range start (last night is the day before)", () => {
    expect(stayNightsInRange("2026-05-30", "2026-06-01", start, end)).toBe(0);
  });
});
describe("priorRange — immediately preceding equal-length window", () => {
  it("maps a 10-day range to the 10 days before it", () => {
    const { start, end } = priorRange(d("2026-06-11"), d("2026-06-20"));
    expect(day(start)).toBe("2026-06-01");
    expect(day(end)).toBe("2026-06-10");
  });
});

describe("pointsDelta", () => {
  it("reports the change between two percentages in points", () => {
    expect(pointsDelta(20, 10)).toBe(10);
    expect(pointsDelta(11.7, 20)).toBe(-8.3);
    expect(pointsDelta(0, 0)).toBe(0);
    expect(pointsDelta(null, 10)).toBeNull();
    expect(pointsDelta(10, null)).toBeNull();
  });
});

describe("pctDelta", () => {
  it("computes a positive change", () => {
    expect(pctDelta(120, 100)).toBe(20);
  });
  it("computes a negative change", () => {
    expect(pctDelta(80, 100)).toBe(-20);
  });
  it("returns null when there is no prior baseline", () => {
    expect(pctDelta(50, 0)).toBeNull();
  });
});

describe("occupancyFromAvailability", () => {
  it("folds capacity and booked into a percentage", () => {
    const o = occupancyFromAvailability([
      { capacity: 10, booked: 5 },
      { capacity: 10, booked: 8 },
    ]);
    expect(o.availableRoomNights).toBe(20);
    expect(o.roomNightsSold).toBe(13);
    expect(o.occupancyPct).toBe(65);
  });
  it("is unavailable with no capacity", () => {
    expect(occupancyFromAvailability([]).occupancyPct).toBeNull();
    expect(occupancyFromAvailability([{ capacity: null, booked: 1 }]).availableRoomNights).toBeNull();
  });
});

describe("ratio guards", () => {
  it("guards zero denominators without inventing RevPAR", () => {
    expect(adr(500, 0)).toBe(0);
    expect(revpar(500, 0)).toBeNull();
    expect(revpag(500, 0)).toBe(0);
  });
});
describe("allocateNightlyRevenue — per-night recognized revenue", () => {
  const start = d("2026-06-01");
  const end = d("2026-06-30");
  const stay = (o: Partial<StayRow>): StayRow => ({
    id: "booking",
    check_in: "2026-06-10",
    check_out: "2026-06-13",
    subtotal: 600,
    total_amount: 720,
    currency: "GHS",
    nights: 3,
    rooms_count: 1,
    adults: 2,
    children: 1,
    ...o,
  });

  it("recognizes the full booking when it falls inside the range", () => {
    const a = allocateNightlyRevenue([stay({})], start, end, "GHS");
    expect(a.revenue).toBe(600);
    expect(a.roomNights).toBe(3);
    expect(a.guests).toBe(3);
    expect(adr(a.revenue, a.roomNights)).toBe(200);
  });

  it("recognizes only the nights inside the range", () => {
    const a = allocateNightlyRevenue(
      [stay({ check_in: "2026-06-28", check_out: "2026-07-02", subtotal: 400, nights: 4 })],
      start,
      end,
      "GHS"
    );
    expect(a.revenue).toBe(300); // 3 of 4 nights × 100
    expect(a.roomNights).toBe(3);
  });

  it("scales room-nights by rooms_count without double-counting revenue", () => {
    const a = allocateNightlyRevenue([stay({ rooms_count: 2 })], start, end, "GHS");
    expect(a.revenue).toBe(600);
    expect(a.roomNights).toBe(6);
    expect(adr(a.revenue, a.roomNights)).toBe(100);
  });

  it("skips stays with no nights in the range", () => {
    const a = allocateNightlyRevenue(
      [stay({ check_in: "2026-05-01", check_out: "2026-05-04" })],
      start,
      end,
      "GHS"
    );
    expect(a.revenue).toBe(0);
    expect(a.roomNights).toBe(0);
  });
});

describe("nightly snapshot reconciliation", () => {
  const stay: StayRow = { id: "b", check_in: "2026-01-31", check_out: "2026-02-02", subtotal: 400, total_amount: 480, currency: "GHS", nights: 2, rooms_count: 1 };
  const nights: NightRow[] = [10000, 30000].map((rate_minor, index) => ({ id: `n${index}`, booking_id: "b", stay_date: index ? "2026-02-01" : "2026-01-31", rate_minor, rooms_count: 1, currency: "GHS", source: "daily" }));

  it("uses stored variable nightly rates and excludes tax, including cross-month slices", () => {
    expect(reconcileBookingNights(stay, nights, "GHS").facts.map(n => n.revenueMinor)).toEqual([10000, 30000]);
    expect(allocateNightlyRevenue([stay], d("2026-02-01"), d("2026-02-01"), "GHS", nights).revenue).toBe(300);
  });
  it("allocates a discount proportionally with deterministic exact remainders", () => {
    const result = reconcileBookingNights({ ...stay, subtotal: 333.33 }, [...nights].reverse(), "GHS");
    expect(result.facts.map(n => n.revenueMinor)).toEqual([8333, 25000]);
    expect(result.facts.reduce((sum, n) => sum + n.revenueMinor, 0)).toBe(33333);
    expect(result.warnings.join(" ")).toContain("reconciled");
  });
  it("uses quantities in weights and room nights, never multiplying subtotal twice", () => {
    const result = reconcileBookingNights({ ...stay, subtotal: 800, rooms_count: 2 }, nights.map(n => ({ ...n, rooms_count: 2 })), "GHS");
    expect(result.facts.map(n => n.revenueMinor)).toEqual([20000, 60000]);
    expect(result.facts.map(n => n.roomNights)).toEqual([2, 2]);
    expect(result.warnings).toEqual([]);
  });
  it.each([
    { label: "understated", quantities: [1, 1] },
    { label: "overstated", quantities: [3, 3] },
    { label: "varying with the same aggregate room-nights", quantities: [1, 3] },
  ])("rejects $label snapshot quantities that disagree with the booking", ({ quantities }) => {
    const recorded = nights.map((n, index) => ({ ...n, rooms_count: quantities[index] }));
    expect(() => reconcileBookingNights({ ...stay, rooms_count: 2 }, recorded, "GHS"))
      .toThrow("nightly snapshot room quantities do not match their booking");
  });
  it("rejects a quantity mismatch outside the report slice before using it as a revenue weight", () => {
    const recorded = nights.map((n, index) => ({ ...n, rooms_count: index ? 2 : 1 }));
    expect(() => allocateNightlyRevenue([{ ...stay, rooms_count: 2 }], d("2026-02-01"), d("2026-02-01"), "GHS", recorded))
      .toThrow("nightly snapshot room quantities do not match their booking");
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, undefined])(
    "rejects invalid booking quantity %s both with snapshots and with the legacy fallback",
    rooms_count => {
      expect(() => reconcileBookingNights({ ...stay, rooms_count }, nights, "GHS"))
        .toThrow("invalid booking room quantity");
      expect(() => reconcileBookingNights({ ...stay, rooms_count }, [], "GHS"))
        .toThrow("invalid booking room quantity");
    },
  );
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid nightly quantity %s before comparing it with the booking",
    rooms_count => {
      expect(() => reconcileBookingNights(stay, [{ ...nights[0], rooms_count }, nights[1]], "GHS"))
        .toThrow("invalid nightly room quantity");
    },
  );
  it.each([
    { currency: "GHS", subtotal: "333.33", expected: [8333, 25000], total: 33333 },
    { currency: "UGX", subtotal: "101", expected: [25, 76], total: 101 },
    { currency: "KWD", subtotal: "1.001", expected: [250, 751], total: 1001 },
  ])("conserves every $currency minor unit for a discounted multi-room stay and its date slices", ({ currency, subtotal, expected, total }) => {
    const multiRoom = { ...stay, rooms_count: 2, currency, subtotal };
    const recorded = nights.map(n => ({ ...n, rooms_count: 2, currency }));
    const result = reconcileBookingNights(multiRoom, [...recorded].reverse(), currency);
    expect(result.facts.map(n => n.revenueMinor)).toEqual(expected);
    expect(result.facts.map(n => n.roomNights)).toEqual([2, 2]);
    expect(result.warnings.join(" ")).toContain("reconciled");

    const full = allocateNightlyRevenue([multiRoom], d(stay.check_in), d(stay.check_out), currency, recorded);
    expect(full.revenueMinor).toBe(total);
    expect(full.revenue).toBe(Number(subtotal));
    expect(full.roomNights).toBe(4);

    const slices = recorded.map(n => allocateNightlyRevenue([multiRoom], d(n.stay_date), d(n.stay_date), currency, recorded));
    expect(slices.map(slice => slice.revenueMinor)).toEqual(expected);
    expect(slices.reduce((sum, slice) => sum + slice.revenueMinor, 0)).toBe(total);
    expect(slices.map(slice => slice.roomNights)).toEqual([2, 2]);
  });
  it("keeps fully discounted stays as occupied nights with zero revenue", () => {
    const result = reconcileBookingNights({ ...stay, subtotal: 0 }, nights, "GHS");
    expect(result.facts.map(n => [n.revenueMinor, n.roomNights])).toEqual([[0, 1], [0, 1]]);
  });
  it("legacy thirds conserve the final minor unit and independently sliced dates reconcile", () => {
    const legacy = { ...stay, check_in: "2026-01-01", check_out: "2026-01-04", nights: 3, subtotal: 100 };
    const result = reconcileBookingNights(legacy, [], "GHS");
    expect(result.facts.map(n => n.revenueMinor)).toEqual([3334, 3333, 3333]);
    expect(result.warnings.join()).toContain("legacy");
    const amounts = [1, 2, 3].map(i => allocateNightlyRevenue([legacy], d(`2026-01-0${i}`), d(`2026-01-0${i}`), "GHS").revenueMinor);
    expect(amounts.reduce((sum, n) => sum + n, 0)).toBe(10000);
  });
  it("rejects partial snapshots, duplicate dates, currency mixing and invalid money", () => {
    expect(() => reconcileBookingNights(stay, nights.slice(0, 1), "GHS")).toThrow("incomplete");
    expect(() => reconcileBookingNights(stay, [nights[0], nights[0]], "GHS")).toThrow("dates");
    expect(() => reconcileBookingNights({ ...stay, currency: "USD" }, nights, "GHS")).toThrow("mixed currencies");
    expect(() => reconcileBookingNights(stay, nights.map(n => ({ ...n, currency: "USD" })), "GHS")).toThrow("mixed currencies");
    expect(() => reconcileBookingNights({ ...stay, subtotal: "NaN" }, nights, "GHS")).toThrow();
    expect(() => reconcileBookingNights(stay, nights.map(n => ({ ...n, rate_minor: "9007199254740992" })), "GHS")).toThrow("invalid nightly");
  });
  it("is exact for zero and three decimal currencies", () => {
    expect(reconcileBookingNights({ ...stay, currency: "UGX", subtotal: 101 }, [], "UGX").facts.map(n => n.revenueMinor)).toEqual([51, 50]);
    expect(reconcileBookingNights({ ...stay, currency: "KWD", subtotal: 1.001 }, [], "KWD").facts.map(n => n.revenueMinor)).toEqual([501, 500]);
  });
  it("uses bigint intermediate products and conserves positive/negative remainders", () => {
    expect(allocateMinorExactly(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(allocateMinorExactly(-10000, [1, 1, 1])).toEqual([-3334, -3333, -3333]);
    expect(allocateMinorExactly(9007199254740991, [9007199254740990, 1]).reduce((sum, n) => sum + n, 0)).toBe(9007199254740991);
    for (let total = 0; total < 100; total++) expect(allocateMinorExactly(total, [3, 7, 13, 1]).reduce((sum, n) => sum + n, 0)).toBe(total);
  });
});
