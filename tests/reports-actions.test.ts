import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireMinRole: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireMinRole: mocks.requireMinRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { getGuestsReport, getOccupancyReport, getReportsOverview, getRevenueReport } from "@/app/dashboard/reports/actions";

const scope = { orgId: "org-a", hotelId: "h" };

type Row = Record<string, unknown>;
type Filter = { column: string; op: string; value: unknown };
const state: { tables: Record<string, Row[]>; failures: Set<string>; queries: { table: string; filters: Filter[]; fields: string }[]; cap: number } = {
  tables: {}, failures: new Set(), queries: [], cap: 1000,
};
class Query {
  filters: Filter[] = [];
  fields = "";
  count = false;
  head = false;
  one = false;
  size = 1000;
  sorted = false;
  constructor(readonly table: string) {}
  select(fields: string, options?: { count?: string; head?: boolean }) { this.fields = fields; this.count = options?.count === "exact"; this.head = options?.head ?? false; return this; }
  eq(column: string, value: unknown) { this.filters.push({ column, op: "eq", value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ column, op: "in", value }); return this; }
  lt(column: string, value: unknown) { this.filters.push({ column, op: "lt", value }); return this; }
  lte(column: string, value: unknown) { this.filters.push({ column, op: "lte", value }); return this; }
  gt(column: string, value: unknown) { this.filters.push({ column, op: "gt", value }); return this; }
  gte(column: string, value: unknown) { this.filters.push({ column, op: "gte", value }); return this; }
  order() { this.sorted = true; return this; }
  limit(size: number) { this.size = size; return this; }
  single() { this.one = true; return this; }
  async execute() {
    state.queries.push({ table: this.table, filters: this.filters, fields: this.fields });
    if (state.failures.has(this.table) || state.failures.has(`${this.table}:${this.fields}`)) return { data: null, count: null, error: { code: "XX001", message: "private database detail" } };
    const rows = (state.tables[this.table] ?? []).filter(row => this.filters.every(({ column, op, value }) => {
      const actual = row[column];
      if (actual == null) return false;
      if (op === "eq") return actual === value;
      if (op === "in") return (value as unknown[]).includes(actual);
      const a = actual as string | number, b = value as string | number;
      if (op === "lt") return a < b;
      if (op === "lte") return a <= b;
      if (op === "gt") return a > b;
      return a >= b;
    }));
    if (this.sorted) rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return { data: this.head ? null : this.one ? rows[0] ?? null : rows.slice(0, Math.min(this.size, state.cap)), count: this.count ? rows.length : null, error: null };
  }
  then<T = Awaited<ReturnType<Query["execute"]>>, U = never>(fulfilled?: ((value: Awaited<ReturnType<Query["execute"]>>) => T | PromiseLike<T>) | null, rejected?: ((reason: unknown) => U | PromiseLike<U>) | null): Promise<T | U> {
    return this.execute().then(fulfilled, rejected);
  }
}
const booking = (overrides: Row = {}): Row => ({
  id: "b1", hotel_id: "h", guest_id: "g1", room_type_id: "standard", check_in: "2026-06-10", check_out: "2026-06-12", nights: 2,
  subtotal: 400, total_amount: 480, currency: "GHS", rooms_count: 1, adults: 2, children: 0, status: "checked_out", source: "direct",
  outstanding_balance: 0, created_at: "2026-06-01T12:00:00.000Z", ...overrides,
});
const night = (date: string, rate: number, overrides: Row = {}): Row => ({ id: `n-${date}`, hotel_id: "h", booking_id: "b1", stay_date: date, rate_minor: rate, rooms_count: 1, currency: "GHS", source: "daily", ...overrides });
const inventory = (date: string, capacity = 10): Row => ({ id: `i-${date}`, hotel_id: "h", effective_date: date, capacity_by_type: { standard: capacity }, time_zone: "Africa/Accra" });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  mocks.requireMinRole.mockReset().mockResolvedValue({ ...scope, hotel: { currency: "GHS" } });
  mocks.createClient.mockReset().mockResolvedValue({ from: (table: string) => new Query(table) });
  state.failures = new Set(); state.queries = []; state.cap = 1000;
  state.tables = {
    hotels: [{ id: "h", currency: "GHS", timezone: "Africa/Accra", status: "active" }],
    bookings: [booking()], booking_nights: [night("2026-06-10", 10000), night("2026-06-11", 30000)],
    reports_inventory_history: [inventory("2026-01-01")],
    room_types: [{ id: "standard", hotel_id: "h", name: "Standard" }],
    guests: [{ id: "g1", hotel_id: "h", nationality: "Ghana", total_stays: 999 }], payments: [],
  };
});
afterEach(() => vi.useRealTimers());

describe("report actions: one reconciled room-revenue basis", () => {
  it("tiles, series, sources and trend reconcile to nightly room charges, excluding tax", async () => {
    const overview = await getReportsOverview("2026-06-10", "2026-06-11", scope);
    expect(overview.revenue).toBe(400);
    expect(overview.adr).toBe(200); expect(overview.revpar).toBe(20); expect(overview.occupancy).toBe(10);
    expect(overview.series.map(p => p.revenue)).toEqual([100, 300]);
    expect(overview.sources).toEqual([{ source: "direct", count: 1, revenue: 400, roomNights: 2, pct: 100 }]);
    expect(overview.meta).toMatchObject({ ...scope, startDate: "2026-06-10", endDate: "2026-06-11", priorStartDate: "2026-06-08", priorEndDate: "2026-06-09", timeZone: "Africa/Accra", generatedAt: "2026-10-21T12:00:00.000Z" });
    const revenue = await getRevenueReport("2026-06-10", "2026-06-11", scope);
    expect(revenue.trend.map(p => p.revenue)).toEqual([100, 300]);
    expect(revenue.totalRevenue).toBe(overview.revenue);
  });
  it("loads all booking nights for an intersecting date before allocating discounts", async () => {
    state.tables.bookings[0].subtotal = 333.33;
    const day = await getReportsOverview("2026-06-11", "2026-06-11", scope);
    expect(day.revenue).toBe(250); // 3/4 of subtotal, largest remainder
    expect(day.sources[0].revenue).toBe(250);
    expect(day.meta.warnings.join()).toContain("reconciled proportionally");
  });
  it("confirmed reservations and incomplete/future nights do not become earned revenue", async () => {
    state.tables.bookings = [booking({ status: "confirmed" }), booking({ id: "in-house", status: "checked_in", check_in: "2026-10-20", check_out: "2026-10-23", nights: 3, subtotal: 300 })];
    state.tables.booking_nights = [];
    const result = await getReportsOverview("2026-10-20", "2026-10-21", scope);
    expect(result.roomNights).toBe(1); expect(result.revenue).toBe(100);
    expect(result.series[1]).toMatchObject({ revenue: 0, roomNights: 0, occupancy: null, revpar: null });
    expect(result.meta.warnings.join()).toContain("Confirmed reservations");
    const old = await getReportsOverview("2026-06-10", "2026-06-11", scope);
    expect(old.revenue).toBe(0);
  });
  it("keeps unknown capacity null in totals, daily series, type breakdown and deltas", async () => {
    state.tables.reports_inventory_history = [inventory("2026-06-11", 20)];
    const overview = await getReportsOverview("2026-06-10", "2026-06-11", scope);
    expect(overview.occupancy).toBeNull(); expect(overview.revpar).toBeNull(); expect(overview.deltas.occupancy).toBeNull();
    expect(overview.series.map(p => p.occupancy)).toEqual([null, 5]);
    const result = await getOccupancyReport("2026-06-10", "2026-06-11", scope);
    expect(result.availableRoomNights).toBeNull();
    expect(result.byRoomType[0]).toMatchObject({ booked: 2, capacity: null, occupancy: null });
    expect(result.meta.warnings.join()).toContain("Historical capacity is unavailable");
    // The chart still gets the recorded day, with occupancy over recorded days only.
    expect(result.coverage).toEqual({ occupancy: 5, recordedDays: 1, completedDays: 2, firstRecordedDate: "2026-06-11" });
    expect(state.queries.some(q => q.table === "rooms")).toBe(false);
  });
  it("uses dated expansion for current and prior capacity independently", async () => {
    state.tables.reports_inventory_history.push(inventory("2026-06-11", 20));
    const result = await getOccupancyReport("2026-06-10", "2026-06-11", scope);
    expect(result.availableRoomNights).toBe(30);
    expect(result.occupancy).toBe(6.7);
    expect(result.coverage).toEqual({ occupancy: 6.7, recordedDays: 2, completedDays: 2, firstRecordedDate: "2026-06-10" });
    expect(result.byRoomType[0].capacity).toBe(30);
  });
  it("retrieves 1000+ bookings/night snapshots without truncating any metric", async () => {
    state.cap = 123;
    state.tables.bookings = Array.from({ length: 1101 }, (_, i) => booking({ id: `b${String(i).padStart(5, "0")}`, check_out: "2026-06-11", subtotal: 1, nights: 1 }));
    state.tables.booking_nights = state.tables.bookings.map((b, i) => night("2026-06-10", 100, { id: `n${String(i).padStart(5, "0")}`, booking_id: b.id }));
    const result = await getReportsOverview("2026-06-10", "2026-06-10", scope);
    expect(result.revenue).toBe(1101); expect(result.roomNights).toBe(1101); expect(result.sources[0].count).toBe(1101);
    expect(result.series[0].revenue).toBe(1101);
  });
});

describe.each([
  { name: "overview", action: getReportsOverview,
    unavailable: { revenue: null, revpar: null, adr: null, occupancy: null, roomNights: null },
    historical: { revenue: 200, revpar: 200, adr: 50, occupancy: 100, roomNights: 100 },
    todayValues: { revenue: 0, roomNights: 0 }, partialValues: { revenue: 1800, roomNights: 12 } },
  { name: "revenue", action: getRevenueReport,
    unavailable: { revenue: null, adr: null, revpar: null }, historical: { revenue: 200, adr: 50, revpar: 200 },
    todayValues: { totalRevenue: 0 }, partialValues: { totalRevenue: 1800 } },
  { name: "occupancy", action: getOccupancyReport,
    unavailable: { occupancy: null, roomNights: null }, historical: { occupancy: 100, roomNights: 100 },
    todayValues: { roomNights: 0, availableRoomNights: null }, partialValues: { roomNights: 12, availableRoomNights: 60 } },
])("$name completed-range comparisons", ({ action, unavailable, historical, todayValues, partialValues }) => {
  const comparisonWarning = "Room KPI comparisons require a completed date range. Choose an end date before today in the property's timezone.";
  beforeEach(() => {
    state.tables.bookings = [
      booking({ id: "prior", check_in: "2026-10-07", check_out: "2026-10-14", nights: 7, subtotal: 700 }),
      booking({ id: "current", check_in: "2026-10-14", check_out: "2026-10-22", nights: 8, rooms_count: 2, subtotal: 2400, status: "checked_in" }),
    ];
    state.tables.booking_nights = [];
  });
  it("suppresses every room KPI delta for Today instead of reporting an artificial decline", async () => {
    const result = await action("2026-10-21", "2026-10-21", scope);
    expect(result.deltas).toEqual(unavailable);
    expect(result).toMatchObject(todayValues);
    expect(result.meta).toMatchObject({ startDate: "2026-10-21", endDate: "2026-10-21", priorStartDate: "2026-10-20", priorEndDate: "2026-10-20" });
    expect(result.meta.warnings).toContain(comparisonWarning);
  });
  it("suppresses comparisons for seven requested dates ending today while retaining six earned nights", async () => {
    const result = await action("2026-10-15", "2026-10-21", scope);
    expect(result.deltas).toEqual(unavailable);
    expect(result).toMatchObject(partialValues);
    expect(result.meta).toMatchObject({ startDate: "2026-10-15", endDate: "2026-10-21", priorStartDate: "2026-10-08", priorEndDate: "2026-10-14" });
    expect(result.meta.warnings).toContain(comparisonWarning);
  });
  it("preserves exact KPI comparisons for a fully completed historical range", async () => {
    const result = await action("2026-10-14", "2026-10-20", scope);
    expect(result.deltas).toEqual(historical);
    expect(result.meta).toMatchObject({ startDate: "2026-10-14", endDate: "2026-10-20", priorStartDate: "2026-10-07", priorEndDate: "2026-10-13" });
    expect(result.meta.warnings).not.toContain(comparisonWarning);
  });
  it.each([
    { timeZone: "America/New_York", now: "2026-10-21T02:00:00Z", completed: false },
    { timeZone: "Asia/Tokyo", now: "2026-10-20T16:00:00Z", completed: true },
  ])("uses property-local completion at $now in $timeZone, not the UTC date", async ({ timeZone, now, completed }) => {
    vi.setSystemTime(new Date(now));
    state.tables.hotels[0].timezone = timeZone;
    state.tables.reports_inventory_history[0].time_zone = timeZone;
    const result = await action("2026-10-14", "2026-10-20", scope);
    expect(result.deltas).toEqual(completed ? historical : unavailable);
    expect(result.meta.timeZone).toBe(timeZone);
    expect(result.meta.warnings.includes(comparisonWarning)).toBe(!completed);
  });
});

it("preserves today's guest arrivals, collections and new bookings when room comparisons are unavailable", async () => {
  state.tables.bookings.push(booking({ id: "today-arrival", check_in: "2026-10-21", check_out: "2026-10-22", nights: 1, subtotal: 100, status: "checked_in", created_at: "2026-10-21T10:00:00Z" }));
  state.tables.payments = [{ id: "today-payment", hotel_id: "h", amount: 42, currency: "GHS", method: "cash", status: "success", paid_at: "2026-10-21T11:00:00Z" }];
  const result = await getGuestsReport("2026-10-21", "2026-10-21", scope);
  expect(result).toMatchObject({ totalCollected: 42, totalGuests: 1, repeatGuests: 1 });
  expect(result.meta).toMatchObject({ startDate: "2026-10-21", endDate: "2026-10-21" });
  expect(result.meta.warnings.join()).not.toContain("comparisons require a completed date range");
  expect(await getOccupancyReport("2026-10-21", "2026-10-21", scope)).toMatchObject({ newBookings: 1, roomNights: 0 });
});

describe("report actions: explicit failure and access contracts", () => {
  it("requires active staff through the shared role guard before database reads", async () => {
    mocks.requireMinRole.mockRejectedValueOnce(new Error("Your account is not active"));
    await expect(getReportsOverview("2026-06-10", "2026-06-11", scope)).rejects.toThrow("not active");
    expect(mocks.requireMinRole).toHaveBeenCalledWith("read_only", "view reports");
    expect(state.queries).toHaveLength(0);
  });
  it.each(["hotels", "bookings", "booking_nights", "reports_inventory_history"])("propagates %s read errors", async table => {
    state.failures.add(table);
    await expect(getReportsOverview("2026-06-10", "2026-06-11", scope)).rejects.toThrow("Report unavailable");
  });
  it("does not default a missing currency or timezone", async () => {
    state.tables.hotels[0].currency = null;
    await expect(getGuestsReport("2026-06-10", "2026-06-11", scope)).rejects.toThrow("currency");
    state.tables.hotels[0].currency = "GHS"; state.tables.hotels[0].timezone = null;
    await expect(getGuestsReport("2026-06-10", "2026-06-11", scope)).rejects.toThrow("timezone");
  });
  it("rejects mixed booking, nightly, receipt and outstanding currencies", async () => {
    state.tables.bookings[0].currency = "USD";
    await expect(getReportsOverview("2026-06-10", "2026-06-11", scope)).rejects.toThrow("mixed currencies");
    state.tables.bookings[0].currency = "GHS"; state.tables.booking_nights[0].currency = "USD";
    await expect(getReportsOverview("2026-06-10", "2026-06-11", scope)).rejects.toThrow("mixed currencies");
    state.tables.payments = [{ id: "p", hotel_id: "h", currency: "USD", amount: 10, status: "success", paid_at: "2026-06-10T12:00:00.000Z" }];
    await expect(getGuestsReport("2026-06-10", "2026-06-11", scope)).rejects.toThrow("mixed currencies");
    state.tables.payments = []; state.tables.bookings[0].currency = "USD"; state.tables.bookings[0].outstanding_balance = 10;
    await expect(getGuestsReport("2026-06-10", "2026-06-11", scope)).rejects.toThrow("mixed currencies");
  });
  it("rejects invalid ranges instead of returning mismatched effective dates", async () => {
    await expect(getReportsOverview("2025-01-01", "2026-10-21", scope)).rejects.toThrow("366 days");
    await expect(getReportsOverview("2026-06-11", "2026-06-10", scope)).rejects.toThrow("before");
  });
  it("checks count-only booking queries and room type reads", async () => {
    state.failures.add("bookings:id");
    await expect(getOccupancyReport("2026-06-10", "2026-06-11", scope)).rejects.toThrow("new booking count");
    state.failures.clear(); state.failures.add("room_types");
    await expect(getOccupancyReport("2026-06-10", "2026-06-11", scope)).rejects.toThrow("room types");
  });
});

describe("report actions: property-local receipts and as-of guests", () => {
  it("collections use property midnight bounds, remain separate from room revenue and include departed outstanding", async () => {
    state.tables.hotels[0].timezone = "America/New_York";
    state.tables.bookings = [booking({ outstanding_balance: 80, created_at: "2026-06-11T02:00:00.000Z" })];
    state.tables.payments = [
      { id: "p1", hotel_id: "h", currency: "GHS", amount: 100, method: "cash", status: "success", paid_at: "2026-06-10T03:59:59.000Z" },
      { id: "p2", hotel_id: "h", currency: "GHS", amount: 480, method: "card", status: "success", paid_at: "2026-06-11T03:59:59.000Z" },
      { id: "p3", hotel_id: "h", currency: "GHS", amount: 50, method: "cash", status: "success", paid_at: "2026-06-11T04:00:00.000Z" },
    ];
    const result = await getGuestsReport("2026-06-10", "2026-06-10", scope);
    expect(result.totalCollected).toBe(480); expect(result.outstanding).toBe(80);
    expect(result.meta.timeZone).toBe("America/New_York");
    const occ = await getOccupancyReport("2026-06-10", "2026-06-10", scope);
    expect(occ.newBookings).toBe(1);
  });
  it("does not use lifetime counters or later returns to classify earlier arrivals", async () => {
    state.tables.bookings.push(booking({ id: "later", check_in: "2026-10-10", check_out: "2026-10-12" }));
    expect(await getGuestsReport("2026-06-10", "2026-06-11", scope)).toMatchObject({ newGuests: 1, repeatGuests: 0, totalGuests: 1 });
    expect(await getGuestsReport("2026-10-10", "2026-10-11", scope)).toMatchObject({ newGuests: 0, repeatGuests: 1, totalGuests: 1 });
  });
  it("deduplicates multi-room arrivals and excludes anonymous or unarrived bookings", async () => {
    state.tables.bookings.push(booking({ id: "second-room" }), booking({ id: "anonymous", guest_id: null }), booking({ id: "unarrived", guest_id: "g2", status: "confirmed" }));
    expect(await getGuestsReport("2026-06-10", "2026-06-11", scope)).toMatchObject({ newGuests: 1, totalGuests: 1 });
  });
  it("pages receipts, guest profiles/history and outstanding balances above 1000 rows", async () => {
    state.cap = 97;
    state.tables.bookings = Array.from({ length: 1001 }, (_, i) => booking({ id: `b${String(i).padStart(5, "0")}`, guest_id: `g${String(i).padStart(5, "0")}`, outstanding_balance: 0.01 }));
    state.tables.guests = state.tables.bookings.map(b => ({ id: b.guest_id, hotel_id: "h", nationality: "Ghana" }));
    state.tables.payments = state.tables.bookings.map((b, i) => ({ id: `p${String(i).padStart(5, "0")}`, hotel_id: "h", amount: 0.01, currency: "GHS", method: "cash", status: "success", paid_at: "2026-06-10T12:00:00.000Z" }));
    const result = await getGuestsReport("2026-06-10", "2026-06-11", scope);
    expect(result.totalCollected).toBe(10.01); expect(result.outstanding).toBe(10.01);
    expect(result.totalGuests).toBe(1001); expect(result.newGuests).toBe(1001); expect(result.origins[0].count).toBe(1001);
  });
  it.each(["payments", "guests", "bookings:id, outstanding_balance, currency"])("propagates %s failures", async table => {
    state.failures.add(table);
    await expect(getGuestsReport("2026-06-10", "2026-06-11", scope)).rejects.toThrow("Report unavailable");
  });
  it("never substitutes another tenant's guest, booking or receipt", async () => {
    state.tables.bookings.push(booking({ id: "foreign", hotel_id: "elsewhere", subtotal: 90000, guest_id: "foreign-guest" }));
    state.tables.guests.push({ id: "foreign-guest", hotel_id: "elsewhere", nationality: "Elsewhere" });
    state.tables.payments.push({ id: "foreign-pay", hotel_id: "elsewhere", amount: 999, status: "success", currency: "USD", paid_at: "2026-06-10T12:00:00.000Z" });
    expect(await getGuestsReport("2026-06-10", "2026-06-11", scope)).toMatchObject({ totalGuests: 1, totalCollected: 0 });
    expect((await getReportsOverview("2026-06-10", "2026-06-11", scope)).revenue).toBe(400);
  });
});

describe.each([
  ["overview", getReportsOverview], ["revenue", getRevenueReport],
  ["occupancy", getOccupancyReport], ["guests", getGuestsReport],
])("%s action tenant integrity", (_name, action) => {
  it("returns authenticated scope for a matching request", async () => {
    const result = await action("2026-06-10", "2026-06-11", scope);
    expect(result.meta).toMatchObject(scope);
    expect(mocks.requireMinRole).toHaveBeenCalledWith("read_only", "view reports");
  });
  it("rejects an old caller missing the expected scope before report reads", async () => {
    await expect(Reflect.apply(action, undefined, ["2026-06-10", "2026-06-11"])).rejects.toThrow("expected organization and hotel are required");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
  });
  it.each([{ ...scope, orgId: "org-b" }, { ...scope, hotelId: "hotel-b" }, { orgId: "org-b", hotelId: "hotel-b" }])("rejects stale page scope when authenticated scope becomes %j", async authenticated => {
    mocks.requireMinRole.mockResolvedValueOnce(authenticated);
    await expect(action("2026-06-10", "2026-06-11", scope)).rejects.toThrow("active property changed");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
  });
});
