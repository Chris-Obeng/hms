import { describe, expect, it } from "vitest";
import { businessToday } from "@/lib/business-date";

// Fixed instants so tests never depend on the machine's timezone or clock.
const jan1_2330z = new Date(Date.UTC(2026, 0, 1, 23, 30));
const jan2_0030z = new Date(Date.UTC(2026, 1 - 1, 2, 0, 30));
const jan1_0200z = new Date(Date.UTC(2026, 0, 1, 2, 0));

describe("businessToday", () => {
  it("returns ISO YYYY-MM-DD", () => {
    expect(businessToday("Africa/Accra", jan1_2330z)).toBe("2026-01-01");
    expect(businessToday("UTC", jan1_2330z)).toBe("2026-01-01");
  });

  it("rolls the Accra business date at UTC midnight", () => {
    expect(businessToday("Africa/Accra", jan2_0030z)).toBe("2026-01-02");
  });

  it("differs from UTC for properties east of GMT (Nairobi UTC+3)", () => {
    // 23:30Z is already Jan 2 in Nairobi — the bug toISOString() would hide.
    expect(businessToday("Africa/Nairobi", jan1_2330z)).toBe("2026-01-02");
    expect(businessToday("UTC", jan1_2330z)).toBe("2026-01-01");
  });

  it("differs for properties west of GMT (New York UTC-5)", () => {
    // 02:00Z on Jan 1 is still Dec 31 in New York.
    expect(businessToday("America/New_York", jan1_0200z)).toBe("2025-12-31");
  });

  it("falls back to UTC for an invalid timezone id", () => {
    expect(businessToday("Mars/Olympus_Mons", jan1_2330z)).toBe("2026-01-01");
  });

  it("caches formatters without cross-timezone corruption", () => {
    expect(businessToday("Africa/Accra", jan1_2330z)).toBe("2026-01-01");
    expect(businessToday("Africa/Nairobi", jan1_2330z)).toBe("2026-01-02");
    expect(businessToday("Africa/Accra", jan1_2330z)).toBe("2026-01-01");
  });
});
