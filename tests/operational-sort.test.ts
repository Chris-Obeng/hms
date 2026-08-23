import { describe, expect, it } from "vitest";
import { sortByOperationalRelevance } from "@/lib/bookings/operational-sort";

const row = (checkIn: string) => ({ checkIn });

describe("sortByOperationalRelevance", () => {
  const businessDate = "2026-08-23";

  it("puts current and upcoming stays first in arrival order", () => {
    const sorted = sortByOperationalRelevance(
      [row("2026-08-25"), row("2026-08-24"), row("2026-08-23"), row("2020-01-01")],
      businessDate,
    );
    expect(sorted.map((r) => r.checkIn)).toEqual(["2026-08-23", "2026-08-24", "2026-08-25", "2020-01-01"]);
  });

  it("orders past stays most-recent-first after upcoming ones", () => {
    const sorted = sortByOperationalRelevance(
      [row("2019-06-01"), row("2026-08-30"), row("2026-08-21"), row("2025-12-31")],
      businessDate,
    );
    expect(sorted.map((r) => r.checkIn)).toEqual(["2026-08-30", "2026-08-21", "2025-12-31", "2019-06-01"]);
  });

  it("treats the business date itself as current (today's arrivals on top)", () => {
    const sorted = sortByOperationalRelevance([row("2026-08-22"), row("2026-08-23")], businessDate);
    expect(sorted.map((r) => r.checkIn)).toEqual(["2026-08-23", "2026-08-22"]);
  });

  it("does not mutate the input array", () => {
    const input = [row("2026-08-20"), row("2026-08-30")];
    sortByOperationalRelevance(input, businessDate);
    expect(input.map((r) => r.checkIn)).toEqual(["2026-08-20", "2026-08-30"]);
  });
});
