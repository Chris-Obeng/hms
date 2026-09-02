import { describe, expect, it } from "vitest";
import {
  compareSeasonPriority,
  findWinningSeason,
  type LayerableSeason,
} from "@/lib/pricing/season-layering";

function season(
  start_date: string,
  end_date: string,
  priority: number | null = 0
): LayerableSeason {
  return { start_date, end_date, priority };
}

// The shape this whole feature exists for: a short expensive window sitting
// inside a long cheaper one.
const summer = season("2026-06-01", "2026-08-31", 0);
const conference = season("2026-07-10", "2026-07-15", 100);

describe("compareSeasonPriority", () => {
  it("puts the higher priority first regardless of width or dates", () => {
    expect(compareSeasonPriority(conference, summer)).toBeLessThan(0);
    expect(compareSeasonPriority(summer, conference)).toBeGreaterThan(0);
  });

  it("treats a null priority as layer 0", () => {
    const nullLayer = season("2026-06-01", "2026-08-31", null);
    expect(compareSeasonPriority(nullLayer, summer)).toBe(
      compareSeasonPriority(summer, summer)
    );
    expect(compareSeasonPriority(conference, nullLayer)).toBeLessThan(0);
  });

  it("prefers the narrower range when priorities match", () => {
    const wide = season("2026-06-01", "2026-06-30", 50);
    const narrow = season("2026-09-01", "2026-09-05", 50);
    expect(compareSeasonPriority(narrow, wide)).toBeLessThan(0);
  });

  it("prefers the later start when priority and width match", () => {
    const earlier = season("2026-06-01", "2026-06-07", 50);
    const later = season("2026-09-01", "2026-09-07", 50);
    expect(compareSeasonPriority(later, earlier)).toBeLessThan(0);
  });

  it("is a total order — input order cannot change the result", () => {
    const rows = [
      season("2026-01-01", "2026-12-31", 0),
      season("2026-07-10", "2026-07-15", 100),
      season("2026-12-20", "2026-12-27", 200),
      season("2026-03-01", "2026-03-31", 100),
    ];
    const forward = [...rows].sort(compareSeasonPriority);
    const backward = [...rows].reverse().sort(compareSeasonPriority);
    expect(forward).toEqual(backward);
  });

  it("does not mutate the rows it compares", () => {
    const before = JSON.stringify([summer, conference]);
    compareSeasonPriority(summer, conference);
    expect(JSON.stringify([summer, conference])).toBe(before);
  });
});

describe("findWinningSeason", () => {
  const sorted = [summer, conference].sort(compareSeasonPriority);

  it("returns the highest-priority season covering the night", () => {
    expect(findWinningSeason(sorted, "2026-07-12")).toBe(conference);
  });

  it("falls back to the lower layer outside the nested window", () => {
    expect(findWinningSeason(sorted, "2026-07-09")).toBe(summer);
    expect(findWinningSeason(sorted, "2026-07-16")).toBe(summer);
  });

  it("treats both endpoints as inclusive, matching daterange '[]'", () => {
    expect(findWinningSeason(sorted, "2026-07-10")).toBe(conference);
    expect(findWinningSeason(sorted, "2026-07-15")).toBe(conference);
    expect(findWinningSeason(sorted, "2026-06-01")).toBe(summer);
    expect(findWinningSeason(sorted, "2026-08-31")).toBe(summer);
  });

  it("returns undefined when no season covers the night", () => {
    expect(findWinningSeason(sorted, "2026-05-31")).toBeUndefined();
    expect(findWinningSeason(sorted, "2026-09-01")).toBeUndefined();
    expect(findWinningSeason([], "2026-07-12")).toBeUndefined();
  });

  it("resolves three stacked layers to the top one", () => {
    const year = season("2026-01-01", "2026-12-31", 0);
    const december = season("2026-12-01", "2026-12-31", 100);
    const christmas = season("2026-12-24", "2026-12-26", 200);
    const stack = [year, december, christmas].sort(compareSeasonPriority);

    expect(findWinningSeason(stack, "2026-12-25")).toBe(christmas);
    expect(findWinningSeason(stack, "2026-12-10")).toBe(december);
    expect(findWinningSeason(stack, "2026-06-15")).toBe(year);
  });
});
