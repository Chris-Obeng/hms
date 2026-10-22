import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseISO } from "date-fns";
import { historicalCapacity, type InventorySnapshot } from "@/lib/reports/inventory";
import { readAllPages } from "@/lib/reports/pagination";
import { classifyArrivingGuests } from "@/lib/reports/guests";

const mocks = vi.hoisted(() => ({ requireMinRole: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireMinRole: mocks.requireMinRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { reportContext, withWarnings } from "@/lib/reports/data";

describe("authenticated report context", () => {
  const scope = { orgId: "org-a", hotelId: "hotel-a" };
  beforeEach(() => {
    mocks.requireMinRole.mockReset().mockResolvedValue(scope);
    mocks.createClient.mockReset();
  });
  it.each([
    undefined, null, {}, [], "org-a", { orgId: "org-a" }, { hotelId: "hotel-a" },
    { ...scope, orgId: 1 }, { ...scope, hotelId: false },
    { ...scope, orgId: "" }, { ...scope, hotelId: "" },
    { ...scope, orgId: "  " }, { ...scope, hotelId: "\t" },
  ].map(expected => ({ expected })))("rejects missing or malformed expected scope $expected before opening the report client", async ({ expected }) => {
    await expect(Reflect.apply(reportContext, undefined, ["2026-06-10", "2026-06-11", expected])).rejects.toThrow("expected organization and hotel are required");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each([{ ...scope, orgId: "org-b" }, { ...scope, hotelId: "hotel-b" }, { orgId: "org-b", hotelId: "hotel-b" }])("rejects changed authenticated scope %j before report reads", async authenticated => {
    mocks.requireMinRole.mockResolvedValueOnce(authenticated);
    await expect(reportContext("2026-06-10", "2026-06-11", scope)).rejects.toThrow("active property changed");
    expect(mocks.requireMinRole).toHaveBeenCalledWith("read_only", "view reports");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("uses authenticated tenant IDs in metadata and preserves them with warnings", async () => {
    const expected = { ...scope };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { currency: "GHS", timezone: "Africa/Accra", status: "active" }, error: null }) };
    mocks.createClient.mockImplementationOnce(async () => {
      expected.orgId = "changed-after-validation"; expected.hotelId = "changed-after-validation";
      return { from: vi.fn(() => query) };
    });
    const ctx = await reportContext("2026-06-10", "2026-06-11", expected);
    expect(query.eq).toHaveBeenCalledWith("id", scope.hotelId);
    expect(ctx.meta).toMatchObject(scope);
    expect(withWarnings(ctx, "Basis", "Basis")).toMatchObject({ ...scope, warnings: ["Basis"] });
  });
});

describe("complete deterministic report pagination", () => {
  it("retrieves more than 1000 rows even when the server cap is below the requested page size", async () => {
    const rows = Array.from({ length: 1301 }, (_, n) => ({ id: String(n).padStart(5, "0") }));
    const page = vi.fn(async (after: string | null) => {
      const remaining = rows.filter(row => after === null || row.id > after);
      return { data: remaining.slice(0, 137), count: remaining.length, error: null };
    });
    expect(await readAllPages("fixture", page)).toEqual(rows);
    expect(page).toHaveBeenCalledTimes(10);
  });
  it("rejects read failures instead of producing zeros", async () => {
    await expect(readAllPages("payments", async () => ({ data: null, count: null, error: { code: "XX001" } }))).rejects.toThrow("could not read payments");
  });
  it("rejects incomplete counts, duplicate pages, empty truncated pages, and oversized reads", async () => {
    await expect(readAllPages("test", async () => ({ data: [], count: null, error: null }))).rejects.toThrow();
    await expect(readAllPages("test", async () => ({ data: [], count: 1, error: null }))).rejects.toThrow();
    await expect(readAllPages("test", async () => ({ data: [{ id: "1" }], count: 100001, error: null }))).rejects.toThrow("safety limit");
    await expect(readAllPages("test", async after => ({ data: [{ id: "1" }], count: after ? 1 : 2, error: null }))).rejects.toThrow();
  });
  it("detects rows being inserted/deleted during pagination", async () => {
    await expect(readAllPages("test", async after => ({ data: [{ id: after ? "2" : "1" }], count: 2, error: null }))).rejects.toThrow("changed during pagination");
  });
});

describe("dated historical inventory", () => {
  const snapshots: InventorySnapshot[] = [
    { id: "1", effective_date: "2026-06-02", capacity_by_type: { standard: 10 }, time_zone: "Africa/Accra" },
    { id: "2", effective_date: "2026-06-04", capacity_by_type: { standard: 12, suite: 2 }, time_zone: "Africa/Accra" },
  ];
  it("never fabricates days before baseline and honors inventory changes", () => {
    const days = historicalCapacity(snapshots, parseISO("2026-06-01"), parseISO("2026-06-05"), "2026-06-05", "Africa/Accra");
    expect(days.map(d => d.capacity)).toEqual([null, 10, 10, 14, null]);
    expect(days[3].byType?.get("suite")).toBe(2);
  });
  it("treats an empty baseline as recorded zero, and no baseline as unknown", () => {
    expect(historicalCapacity([], parseISO("2026-06-01"), parseISO("2026-06-01"), "2026-06-02", "UTC")[0].capacity).toBeNull();
    expect(historicalCapacity([{ id: "0", effective_date: "2026-06-01", capacity_by_type: {}, time_zone: "UTC" }], parseISO("2026-06-01"), parseISO("2026-06-01"), "2026-06-02", "UTC")[0].capacity).toBe(0);
  });
  it("does not carry an old timezone baseline into the new timezone", () => {
    expect(historicalCapacity(snapshots, parseISO("2026-06-02"), parseISO("2026-06-04"), "2026-06-05", "America/New_York").every(d => d.capacity === null)).toBe(true);
  });
});

describe("as-of-arrival guest classification", () => {
  const stay = (id: string, check_in: string, check_out: string, guest_id = "g") => ({ id, guest_id, check_in, check_out });
  it("a later return cannot rewrite the first period's new guest", () => {
    const first = stay("first", "2026-01-01", "2026-01-03"), later = stay("later", "2026-10-01", "2026-10-03");
    expect(classifyArrivingGuests([first], [first, later])).toEqual({ newGuests: 1, repeatGuests: 0 });
    expect(classifyArrivingGuests([later], [first, later])).toEqual({ newGuests: 0, repeatGuests: 1 });
  });
  it("multi-room/concurrent stays count once and are not prior visits", () => {
    const arrival = stay("a", "2026-01-02", "2026-01-04");
    expect(classifyArrivingGuests([arrival, { ...arrival, id: "b" }], [arrival, stay("overlap", "2026-01-01", "2026-01-04")])).toEqual({ newGuests: 1, repeatGuests: 0 });
  });
  it("classifies once at the first arrival in the period, even with a later same-period return", () => {
    const a = stay("a", "2026-01-01", "2026-01-02"), b = stay("b", "2026-01-05", "2026-01-06");
    expect(classifyArrivingGuests([b, a], [a, b])).toEqual({ newGuests: 1, repeatGuests: 0 });
  });
});
