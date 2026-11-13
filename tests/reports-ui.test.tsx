/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import type { GuestsData, OccupancyData, OverviewData, RevenueData } from "@/app/dashboard/reports/actions";
import { ReportsClient, type ReportsClientProps } from "@/app/dashboard/reports/reports-client";
import { classifyArrivals } from "@/lib/reports/arrivals";
import { matchesReportContext, shiftReportDate, validateReportRange, type ReportSnapshot } from "@/app/dashboard/reports/_components/report-utils";
import { qk } from "@/lib/query-keys";

const mocks = vi.hoisted(() => ({
  identity: { isLoaded: true, userId: "staff-a", orgId: "org-a" },
  overview: vi.fn(), revenue: vi.fn(), occupancy: vi.fn(), guests: vi.fn(),
  roomsSold: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => mocks.identity }));
// The URL carries range state; a no-op router keeps the test outside the app shell.
const replaceMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }), usePathname: () => "/dashboard/reports" }));
vi.mock("@/app/dashboard/reports/actions", () => ({
  getReportsOverview: mocks.overview, getRevenueReport: mocks.revenue,
  getOccupancyReport: mocks.occupancy, getGuestsReport: mocks.guests,
  getRoomsSoldTonight: mocks.roomsSold,
}));
// JSDOM has no layout; retain the real chart and its data, with a measured test viewport.
vi.mock("recharts", async (original) => ({
  ...await original<typeof import("recharts")>(),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) => cloneElement(children, { width: 600, height: 288 }),
}));

const scope = { orgId: "org-a", hotelId: "hotel-a" };
const meta = { ...scope, startDate: "2026-10-01", endDate: "2026-10-20", priorStartDate: "2026-09-11", priorEndDate: "2026-09-30", timeZone: "Africa/Accra", generatedAt: "2026-10-21T09:00:00Z", warnings: [] };
function overview(overrides: Partial<OverviewData> = {}): OverviewData {
  return { currency: "GHS", revenue: 12345.67, occupancy: 62.5, revpar: 123.45, adr: 197.53, roomNights: 63, revpag: 160.33,
    deltas: { revenue: 6.4, occupancy: 2.5, revpar: 3.2, adr: -1.5, roomNights: null },
    series: [{ date: "2026-10-01", label: "Oct 1", revenue: 12345.67, occupancy: 62.5, roomNights: 63, adr: 197.53, revpar: 123.45 }],
    priorSeries: [{ date: "2026-09-11", label: "Sep 11", revenue: 10000, occupancy: 60, roomNights: 60, adr: 200, revpar: 120 }],
    sources: [{ source: "direct", count: 12, roomNights: 63, revenue: 12345.67, pct: 100 }],
    guestVisits: 5, collected: 4321, byMethod: [{ method: "cash", amount: 4321, count: 3 }], meta, ...overrides };
}
function occupancy(overrides: Partial<OccupancyData> = {}): OccupancyData {
  return { currency: "GHS", occupancy: null, roomNights: 6, availableRoomNights: null, avgLengthOfStay: 2, newBookings: 3,
    deltas: { occupancy: null, roomNights: 10 },
    stayMix: { stayed: 2, inHouse: 1, arriving: 3, cancelled: 1, noShow: 0 },
    daily: [{ date: "2026-10-01", label: "Oct 1", occupancy: null }],
    coverage: { occupancy: null, recordedDays: 0, completedDays: 1, firstRecordedDate: null },
    byRoomType: [{ name: "Garden suite", booked: 6, capacity: null, occupancy: null, revenue: 0, adr: null, revpar: null }], meta, ...overrides };
}
function guests(): GuestsData {
  return { currency: "GHS", totalCollected: 321.45, outstanding: 9876.54, newGuests: 2, repeatGuests: 1, totalGuests: 3,
    byMethod: [{ method: "cash", amount: 321.45, count: 2 }], origins: [{ nationality: "Ghana", count: 2 }], meta };
}
function revenue(): RevenueData {
  return { currency: "GHS", totalRevenue: 12345.67, adr: 197.53, revpar: 123.45, outstanding: 9876.54, outstandingCount: 4, granularity: "week",
    deltas: { revenue: 6.4, adr: -1.5, revpar: 3.2 }, trend: [{ key: "2026-09-28", label: "Sep 28", revenue: 12345.67 }], bySource: overview().sources, meta };
}
const props: ReportsClientProps = { orgId: "org-a", hotelId: "hotel-a", timeZone: meta.timeZone, today: "2026-10-21", initialStartDate: meta.startDate, initialEndDate: meta.endDate };
const clients: QueryClient[] = [];
const getAnimationsDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
function renderClient(current = props, cached?: ReportSnapshot) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  if (cached) client.setQueryData(qk.reports(current.orgId, current.hotelId, "overview", current.initialStartDate, current.initialEndDate), cached);
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...render(<ReportsClient {...current} />, { wrapper: Wrapper }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity = { isLoaded: true, userId: "staff-a", orgId: "org-a" };
  mocks.overview.mockImplementation(async (startDate: string, endDate: string) => overview({ meta: { ...meta, startDate, endDate } }));
  mocks.revenue.mockResolvedValue(revenue());
  mocks.occupancy.mockResolvedValue(occupancy());
  mocks.guests.mockResolvedValue(guests());
  mocks.roomsSold.mockResolvedValue({
    metric: { date: "2026-10-21", asOf: "2026-10-21T09:00:00Z", basis: "live", state: "ready", totalRooms: 12, outOfService: 1, blocked: 2,
      soldRooms: 6, heldRooms: 2, sellableRooms: 9, availableRooms: 1, soldPercent: 66.7, issues: [] },
    timeZone: meta.timeZone,
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) });
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (getAnimationsDescriptor) Object.defineProperty(Element.prototype, "getAnimations", getAnimationsDescriptor);
  else Reflect.deleteProperty(Element.prototype, "getAnimations");
});

describe("report date boundaries and tenant-scoped keys", () => {
  it("separates organizations, properties, sections, and ranges in cache", () => {
    const key = qk.reports("org-a", "hotel-a", "overview", "2026-10-01", "2026-10-20");
    expect(key).toEqual(["reports", "org-a", "hotel-a", "overview", "2026-10-01", "2026-10-20"]);
    expect(key).not.toEqual(qk.reports("org-b", "hotel-a", "overview", "2026-10-01", "2026-10-20"));
    expect(key).not.toEqual(qk.reports("org-a", "hotel-b", "overview", "2026-10-01", "2026-10-20"));
    expect(key).not.toEqual(qk.reports("org-a", "hotel-a", "guests", "2026-10-01", "2026-10-20"));
    expect(key).not.toEqual(qk.reports("org-a", "hotel-a", "overview", "2026-10-02", "2026-10-20"));
  });
  it.each([
    ["", "2026-10-20", "Enter a valid"], ["2026-02-30", "2026-10-20", "Enter a valid"],
    ["2026-10-20", "2026-10-01", "on or after"], ["2026-10-01", "2026-10-22", "property date"],
    ["2025-10-19", "2026-10-20", "366 days"],
  ])("rejects invalid range %s to %s", (startDate, endDate, error) => {
    expect(validateReportRange({ startDate, endDate }, props.today)).toContain(error);
  });
  it("accepts inclusive 366-day and single-day ranges and shifts without DST drift", () => {
    expect(validateReportRange({ startDate: "2025-10-20", endDate: "2026-10-20" }, props.today)).toBeNull();
    expect(validateReportRange({ startDate: "2026-10-20", endDate: "2026-10-20" }, props.today)).toBeNull();
    expect(shiftReportDate("2026-03-09", -1)).toBe("2026-03-08");
  });
  it("buckets each arrival exactly once and never counts a closed stay as expected", () => {
    const rows = [
      { id: "a", status: "checked_out", check_in: "2026-10-02" },
      { id: "b", status: "checked_in", check_in: "2026-10-02" },
      { id: "c", status: "confirmed", check_in: "2026-10-03" },
      { id: "d", status: "cancelled", check_in: "2026-10-03" },
      { id: "e", status: "no_show", check_in: "2026-10-04" },
    ];
    expect(classifyArrivals(rows, ["a", "b"])).toEqual({ stayed: 2, inHouse: 1, arriving: 1, cancelled: 1, noShow: 1 });
    expect(classifyArrivals([{ id: "b", status: "confirmed", check_in: "2026-10-02" }], ["b"]).arriving).toBe(0);
    expect(classifyArrivals([{ id: "d", status: "cancelled", check_in: "2026-10-03" }], []).stayed).toBe(0);
  });
});

describe("report response scope guard", () => {
  const base = { ...scope, ...meta, tab: "overview" as const };
  it("accepts a response built for the requested tenant, dates and timezone", () => {
    expect(matchesReportContext({ tab: "overview", data: overview() }, base)).toBe(true);
  });
  it.each([{ orgId: "org-b" }, { hotelId: "hotel-b" }, { startDate: "2026-10-02" }, { endDate: "2026-10-19" },
    { timeZone: "Europe/London" }, { tab: "guests" as const }])("rejects a response with %j", (override) => {
    expect(matchesReportContext({ tab: "overview", data: overview() }, { ...base, ...override })).toBe(false);
  });
  it("rejects a response without server metadata, ignoring any client-side stamp", () => {
    const data = overview();
    Reflect.deleteProperty(data, "meta");
    expect(matchesReportContext({ tab: "overview", data }, base)).toBe(false);
  });
});

describe("business intelligence page semantics", () => {
  it("renders the KPI strip with the period comparison subtitle", async () => {
    renderClient();
    expect(await screen.findByText(/12,345/)).toBeDefined();
    expect(screen.getByText(/Sep 11 – Sep 30/)).toBeDefined();
    const revenueKpi = screen.getByRole("article", { name: "Room revenue" });
    expect(revenueKpi.textContent).toContain("+6.4%");
    expect(revenueKpi.textContent).toContain("vs prior period");
    expect(screen.getByRole("article", { name: "ADR" }).textContent).toContain("−1.5%");
    const roomNights = screen.getByRole("article", { name: "Room nights" }).textContent;
    expect(roomNights).not.toContain("comparison");
    expect(roomNights).not.toContain("vs prior period");
  });
  it("renders the KPI cards without sparklines", async () => {
    renderClient();
    const kpis = await screen.findAllByRole("article");
    expect(kpis.map((kpi) => kpi.getAttribute("aria-label"))).toEqual(["Room revenue", "Occupancy", "ADR", "RevPAR", "Room nights"]);
    for (const kpi of kpis) expect(kpi.querySelector("svg path[fill]:not([fill='none'])")).toBeNull();
  });
  it("renders only the revenue, collections and occupancy sections", async () => {
    renderClient();
    expect(await screen.findByRole("heading", { name: "Room revenue", level: 2 })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Collections", level: 2 })).toBeDefined();
    expect(await screen.findByRole("heading", { name: "Occupancy", level: 2 })).toBeDefined();
    for (const name of ["Room type performance", "Rooms sold", "Booking sources", "Guests"]) expect(screen.queryByRole("heading", { name })).toBeNull();
    expect(screen.queryByText(/sellable of 12 active rooms/)).toBeNull();
    expect(screen.queryByText(/Unpaid balances/)).toBeNull();
    expect(screen.queryByText(/View receivables/)).toBeNull();
    expect(screen.queryByText(/Night audit/)).toBeNull();
  });
  it("charts the days that have a recorded room count and says how many are missing", async () => {
    mocks.occupancy.mockResolvedValueOnce(occupancy({
      daily: [{ date: "2026-10-01", label: "Oct 1", occupancy: null }, { date: "2026-10-02", label: "Oct 2", occupancy: 50 }],
      coverage: { occupancy: 50, recordedDays: 1, completedDays: 2, firstRecordedDate: "2026-10-02" },
    }));
    renderClient();
    expect(await screen.findByText(/Shown for 1 of 2 completed days/)).toBeDefined();
    expect(screen.getByText(/counts start on Oct 2, 2026/)).toBeDefined();
    expect(screen.getByRole("figure", { name: /Average of recorded days 50%/ })).toBeDefined();
    expect(screen.queryByText(/No room count is recorded/)).toBeNull();
  });
  it("explains an occupancy chart with no recorded room counts", async () => {
    renderClient();
    expect(await screen.findByText(/No room count is recorded for these dates yet/)).toBeDefined();
  });
  it("offers the CSV export of the loaded figures", async () => {
    renderClient();
    const buttons = await screen.findAllByRole("button", { name: /Export/ });
    expect(buttons.length).toBeGreaterThan(0);
  });
  it("shows loading skeletons before the figures land, never fake zeros", () => {
    mocks.overview.mockImplementation(() => new Promise<OverviewData>(() => {}));
    renderClient();
    expect(screen.queryByText(/12,345/)).toBeNull();
    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
  it("shows an actionable error when the overview fails", async () => {
    mocks.overview.mockRejectedValueOnce(new Error("Report service unavailable."));
    renderClient();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts[0].textContent).toContain("Report service unavailable.");
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0);
  });
  it("no longer shows the figure notes disclosure", async () => {
    mocks.overview.mockResolvedValueOnce(overview({ meta: { ...meta, warnings: ["Historical capacity is unavailable."] } }));
    renderClient();
    await screen.findByRole("heading", { name: "Collections", level: 2 });
    expect(screen.queryByText("How these figures work")).toBeNull();
  });
});

describe("report client fetch boundaries", () => {
  it("requests the figures behind the page and the export for the applied range and passes the tenant scope", async () => {
    renderClient();
    await screen.findByRole("heading", { name: "Business Intelligence" });
    await act(async () => {});
    expect(mocks.overview).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope);
    expect(mocks.occupancy).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope);
    expect(mocks.guests).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope);
    expect(mocks.revenue).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope);
    expect(mocks.roomsSold).toHaveBeenCalledExactlyOnceWith(scope);
  });
  it("rewrites a crafted URL that fell back to the server default and drops the pre-BI tab param", async () => {
    window.history.replaceState(null, "", "/dashboard/reports?tab=nope&startDate=9999-01-01&endDate=9999-01-02");
    try {
      renderClient();
      await screen.findByRole("heading", { name: "Business Intelligence" });
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/reports?startDate=2026-10-01&endDate=2026-10-20", { scroll: false });
      expect(mocks.overview).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope);
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it("rejects a response for different effective dates instead of displaying it", async () => {
    mocks.overview.mockResolvedValueOnce(overview({ meta: { ...meta, startDate: "2026-09-01" } }));
    renderClient();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts[0].textContent).toContain("active property, settings or report dates changed");
    expect(screen.queryByText(/12,345/)).toBeNull();
  });
  it("removes prior-tenant values immediately on identity change, even with stale server props", async () => {
    const view = renderClient();
    await screen.findByText(/12,345/);
    mocks.identity = { ...mocks.identity, orgId: "org-b" };
    view.rerender(<ReportsClient {...props} />);
    expect(screen.queryByText(/12,345/)).toBeNull();
    view.rerender(<ReportsClient {...props} orgId="org-b" hotelId="hotel-b" />);
    expect(screen.queryByText(/12,345/)).toBeNull();
  });
  it("discards a late response from a superseded organization", async () => {
    let resolve!: (data: OverviewData) => void;
    mocks.overview.mockReturnValueOnce(new Promise<OverviewData>(resolvePromise => { resolve = resolvePromise; }));
    const view = renderClient();
    const nextScope = { orgId: "org-b", hotelId: "hotel-b" };
    mocks.identity = { ...mocks.identity, orgId: nextScope.orgId };
    view.rerender(<ReportsClient {...props} />);
    const next = overview({ revenue: 222.22, meta: { ...meta, ...nextScope } });
    mocks.overview.mockResolvedValueOnce(next);
    view.rerender(<ReportsClient {...props} {...nextScope} />);
    expect((await screen.findAllByText(/222/)).length).toBeGreaterThan(0);
    await act(async () => { resolve(overview({ meta: { ...meta, orgId: "org-a" } })); });
    expect(view.client.getQueryData(qk.reports(scope.orgId, scope.hotelId, "overview", meta.startDate, meta.endDate))).toBeUndefined();
    expect(screen.queryAllByText(/222/).length).toBeGreaterThan(0);
  });
});
