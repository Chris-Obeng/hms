import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/query-keys";
import { AMENITIES_LIST } from "@/lib/amenities";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("px-2", "text-sm")).toBe("px-2 text-sm");
  });

  it("drops falsy values and flattens conditional inputs", () => {
    expect(cn("px-2", false && "hidden", undefined, null, ["gap-1", { "text-sm": true, italic: false }])).toBe(
      "px-2 gap-1 text-sm"
    );
  });

  it("lets later Tailwind classes win over conflicting earlier ones", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});

describe("query keys", () => {
  it("builds stable, scoped keys", () => {
    expect(qk.dashboard("org", "hotel", "2026-03-02")).toEqual(["dashboard", "org", "hotel", "2026-03-02"]);
    expect(qk.calendar("org", "hotel", "2026-03-02", 30)).toEqual(["calendar", "org", "hotel", "2026-03-02", 30]);
    expect(qk.staffProfile("org", "user")).toEqual(["staffProfile", "org", "user"]);
    expect(qk.pricingResolved("org", "hotel", ["rt1"], "2026-03-02", "2026-03-05")).toEqual([
      "pricing",
      "resolved",
      "org",
      "hotel",
      ["rt1"],
      "2026-03-02",
      "2026-03-05",
    ]);
  });

  it("gives each pricing query its own namespace suffix", () => {
    expect(qk.pricingSeasons("org", "hotel")[1]).toBe("seasons");
    expect(qk.pricingOccupancy("org", "hotel", "a", "b")[1]).toBe("occupancy");
  });

  it("produces different keys for different scopes", () => {
    expect(qk.rooms("org1", "hotel")).not.toEqual(qk.rooms("org2", "hotel"));
    expect(qk.roomTypes("org", "hotel1")).not.toEqual(qk.roomTypes("org", "hotel2"));
  });
});

describe("amenities", () => {
  it("has unique icons and labels", () => {
    const icons = AMENITIES_LIST.map((a) => a.icon);
    const labels = AMENITIES_LIST.map((a) => a.label);
    expect(new Set(icons).size).toBe(icons.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has a non-empty icon and label for every entry", () => {
    for (const amenity of AMENITIES_LIST) {
      expect(amenity.icon).toBeTruthy();
      expect(amenity.label).toBeTruthy();
    }
  });
});
