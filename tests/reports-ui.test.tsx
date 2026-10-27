/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import type { GuestsData, OccupancyData, OverviewData, RevenueData } from "@/app/dashboard/reports/actions";
import { ReportsClient, type ReportsClientProps } from "@/app/dashboard/reports/reports-client";
import { PeriodControl } from "@/app/dashboard/reports/_components/period-control";
import { OverviewTab } from "@/app/dashboard/reports/_components/overview-tab";
import { OccupancyTab } from "@/app/dashboard/reports/_components/occupancy-tab";
import { classifyArrivals } from "@/lib/reports/arrivals";
import { GuestsTab } from "@/app/dashboard/reports/_components/guests-tab";
import { RevenueTab } from "@/app/dashboard/reports/_components/revenue-tab";
import { matchesReportContext, shiftReportDate, validateReportRange, type ReportSnapshot } from "@/app/dashboard/reports/_components/report-utils";
import { qk } from "@/lib/query-keys";

const mocks = vi.hoisted(() => ({
  identity: { isLoaded: true, userId: "staff-a", orgId: "org-a" },
  overview: vi.fn(), revenue: vi.fn(), occupancy: vi.fn(), guests: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => mocks.identity }));
// The URL carries tab and range state; a no-op router keeps the test outside the app shell.
const replaceMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }), usePathname: () => "/dashboard/reports" }));
vi.mock("@/app/dashboard/reports/actions", () => ({
  getReportsOverview: mocks.overview, getRevenueReport: mocks.revenue,
  getOccupancyReport: mocks.occupancy, getGuestsReport: mocks.guests,
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
    sources: [{ source: "direct", count: 12, roomNights: 63, revenue: 12345.67, pct: 100 }],
    guestVisits: 5, collected: 4321, byMethod: [{ method: "cash", amount: 4321, count: 3 }], meta, ...overrides };
}
function occupancy(overrides: Partial<OccupancyData> = {}): OccupancyData {
  return { currency: "GHS", occupancy: null, roomNights: 6, availableRoomNights: null, avgLengthOfStay: 2, newBookings: 3,
    deltas: { occupancy: null, roomNights: 10 },
    stayMix: { stayed: 2, inHouse: 1, arriving: 3, cancelled: 1, noShow: 0 },
    daily: [{ date: "2026-10-01", label: "Oct 1", occupancy: null }],
    byRoomType: [{ name: "Garden suite", booked: 6, capacity: null, occupancy: null }], meta, ...overrides };
}
function guests(): GuestsData {
  return { currency: "GHS", totalCollected: 321.45, outstanding: 9876.54, newGuests: 2, repeatGuests: 1, totalGuests: 3,
    byMethod: [{ method: "cash", amount: 321.45, count: 2 }], origins: [{ nationality: "Ghana", count: 2 }], meta };
}
function revenue(): RevenueData {
  return { currency: "GHS", totalRevenue: 12345.67, adr: 197.53, revpar: 123.45, outstanding: 9876.54, granularity: "week",
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
  it("separates organizations, properties, tabs, and ranges in cache", () => {
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
    // `a` and `b` had their rooms occupied; `b` is still in house, `a` has left.
    expect(classifyArrivals(rows, ["a", "b"])).toEqual({ stayed: 2, inHouse: 1, arriving: 1, cancelled: 1, noShow: 1 });
    // A booking marked confirmed but already occupied is in house, not "booked to arrive".
    expect(classifyArrivals([{ id: "b", status: "confirmed", check_in: "2026-10-02" }], ["b"]).arriving).toBe(0);
    // A cancelled booking is not a guest who came, even if it once had nights.
    expect(classifyArrivals([{ id: "d", status: "cancelled", check_in: "2026-10-03" }], []).stayed).toBe(0);
  });
  it("applies a preset once and marks it as selected", async () => {
    const apply = vi.fn(); const user = userEvent.setup();
    render(<PeriodControl startDate={meta.startDate} endDate={meta.endDate} today={props.today} onChange={apply} />);
    await user.click(screen.getByRole("button", { name: "7 days" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith("2026-10-15", "2026-10-21");
  });
  it("opens the same calendar used on the dashboard for each boundary", async () => {
    const user = userEvent.setup();
    render(<PeriodControl startDate={meta.startDate} endDate={meta.endDate} today={props.today} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /End date: Oct 20, 2026/ })).toBeDefined();
    void user.click(screen.getByRole("button", { name: /Start date: Oct 1, 2026/ }));
    expect(await screen.findByRole("dialog")).toBeDefined();
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
describe("report UI semantics and data states", () => {
  it("shows five exact KPIs, a period comparison and a keyboard-reachable chart data table", async () => {
    const user = userEvent.setup();
    render(<OverviewTab data={overview()} />);
    const metrics = screen.getByRole("group", { name: "Key performance indicators" });
    expect(metrics.querySelectorAll("dt")).toHaveLength(5);
    expect(metrics.textContent).toContain("12,345.67");
    expect(metrics.textContent).toContain("+6.4% vs prior period");
    expect(screen.getByRole("heading", { name: "Room revenue" })).toBeDefined();
    await user.click(screen.getByText("View data table"));
    const table = screen.getByRole("table", { name: "Room revenue — exact values" });
    expect(within(table).getByRole("rowheader", { name: "Oct 1, 2026" })).toBeDefined();
    expect(table.textContent).toContain("12,345.67");
  });
  it("keeps the sources table and outstanding balance off every other tab", () => {
    render(<RevenueTab data={revenue()} />);
    expect(screen.getByRole("table", { name: /Booking sources/ })).toBeDefined();
    expect(screen.getByRole("region", { name: "Outstanding balance" }).textContent).toContain("9,876.54");
    expect(screen.getAllByRole("heading", { name: /room revenue/i })).toHaveLength(1);
  });
  it("shows the payment mix as a composition ring on Overview only", () => {
    render(<OverviewTab data={overview()} />);
    expect(screen.getByRole("img", { name: /Collected by payment method: .*4,321\.00/ })).toBeDefined();
  });
  it("shows the arrival mix and the new-bookings figure the daily mix used to carry", () => {
    render(<OccupancyTab data={occupancy()} />);
    const arrivals = screen.getByRole("region", { name: "Arrivals" });
    expect(arrivals.textContent).toContain("Stayed2");
    expect(arrivals.textContent).toContain("Expected3");
    expect(screen.getByRole("group", { name: "Occupancy indicators" }).textContent).toContain("New bookings3");
  });
  it("distinguishes unavailable occupancy from a real zero and still exposes room nights", () => {
    const view = render(<OccupancyTab data={occupancy()} />);
    expect(screen.getByText("Data unavailable")).toBeDefined();
    expect(screen.getByRole("group", { name: "Occupancy indicators" }).textContent).toContain("6");
    expect(screen.queryByText("No occupied room nights in this period.")).toBeNull();
    expect(screen.getByRole("table", { name: "Occupancy by room type" }).textContent).toContain("Garden suite6——");
    view.rerender(<OccupancyTab data={occupancy({ occupancy: 0, daily: [{ date: meta.startDate, label: "Oct 1", occupancy: 0 }] })} />);
    expect(screen.getByText("No occupied room nights in this period.")).toBeDefined();
    expect(screen.queryByText("Data unavailable")).toBeNull();
  });
  it("shows true empty revenue without implying an error", () => {
    render(<OverviewTab data={overview({ revenue: 0, series: [], sources: [], byMethod: [] })} />);
    expect(screen.getByText("No room revenue in this period.")).toBeDefined();
    expect(screen.getByText("No payments collected in this period.")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("labels guest arrivals and keeps outstanding out of the guests tab", () => {
    render(<GuestsTab data={guests()} />);
    expect(screen.getAllByText("Collected").length).toBeGreaterThan(0);
    expect(screen.getByText("Repeat")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Outstanding balance" })).toBeNull();
    expect(screen.queryByText("9,876.54")).toBeNull();
  });
  it("removes the refresh and CSV export controls from the reports client", async () => {
    renderClient();
    await screen.findByRole("heading", { name: "Room revenue" });
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.queryByRole("button", { name: /CSV/i })).toBeNull();
    expect(screen.queryByText(/CSV includes/)).toBeNull();
  });
});
describe("report client fetch boundaries", () => {
  it("renders named tabs and requests only applied date changes", async () => {
    const user = userEvent.setup(); renderClient();
    expect(await screen.findByRole("heading", { name: "Room revenue" })).toBeDefined();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Overview", "Room revenue", "Occupancy", "Guests & collections"]);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Start date: Oct 1, 2026/ }));
    expect(mocks.overview).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Oct 1 – Oct 20, 2026/)).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
  });
  it("restores the tab from the URL and writes it back when the range changes", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/dashboard/reports?tab=guests&startDate=2026-10-01&endDate=2026-10-20");
    try {
      renderClient();
      expect(await screen.findByRole("tab", { name: "Guests & collections" }).then((tab) => tab.getAttribute("aria-selected"))).toBe("true");
      expect(mocks.guests).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope);
      expect(mocks.overview).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "7 days" }));
      // The tab survives a range change instead of silently reverting to Overview.
      expect(pushMock).toHaveBeenCalledWith("/dashboard/reports?tab=guests&startDate=2026-10-15&endDate=2026-10-21", { scroll: false });
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it("rewrites a crafted URL that fell back to the server default", async () => {
    window.history.replaceState(null, "", "/dashboard/reports?tab=nope&startDate=9999-01-01&endDate=9999-01-02");
    try {
      renderClient();
      await screen.findByRole("heading", { name: "Room revenue" });
      // The figures on screen are the default range, so the address bar must say so.
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/reports?tab=overview&startDate=2026-10-01&endDate=2026-10-20", { scroll: false });
      expect(mocks.overview).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope);
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it("shows loading then an actionable error, never fake zero totals", async () => {
    let reject!: (error: Error) => void;
    mocks.overview.mockReturnValueOnce(new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    renderClient();
    expect(screen.getByRole("status", { name: "Loading report" })).toBeDefined();
    reject(new Error("Report service unavailable."));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    expect(screen.queryByLabelText("Key performance indicators")).toBeNull();
  });
  it("removes prior-tenant values immediately on identity change, even with stale server props", async () => {
    const view = renderClient();
    await screen.findByRole("heading", { name: "Room revenue" });
    mocks.identity = { ...mocks.identity, orgId: "org-b" };
    view.rerender(<ReportsClient {...props} />);
    expect(screen.queryByRole("heading", { name: "Room revenue" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull();
    mocks.overview.mockImplementationOnce(() => new Promise(() => {}));
    view.rerender(<ReportsClient {...props} orgId="org-b" hotelId="hotel-b" />);
    expect(screen.getByRole("status", { name: "Loading report" })).toBeDefined();
    expect(screen.queryByText(/12,345.67/)).toBeNull();
  });
  it("rejects a response for different effective dates instead of displaying it", async () => {
    mocks.overview.mockResolvedValueOnce(overview({ meta: { ...meta, startDate: "2026-09-01" } }));
    renderClient();
    expect((await screen.findByRole("alert")).textContent).toContain("active property, settings or report dates changed");
    expect(screen.queryByRole("heading", { name: "Room revenue" })).toBeNull();
  });
  it("keeps backend notes behind one disclosure", async () => {
    mocks.overview.mockResolvedValueOnce(overview({ meta: { ...meta, warnings: ["Historical capacity is unavailable."] } }));
    renderClient(); await screen.findByRole("heading", { name: "Room revenue" });
    const notes = screen.getByText("How these figures work").closest("details");
    expect(notes?.textContent).toContain("Historical capacity is unavailable");
    expect(notes?.hasAttribute("open")).toBe(false);
  });
  it.each([
    ["Overview", "overview"], ["Room revenue", "revenue"], ["Occupancy", "occupancy"], ["Guests & collections", "guests"],
  ] as const)("passes expected tenant scope to the %s action", async (label, key) => {
    const user = userEvent.setup(); renderClient();
    await screen.findByRole("heading", { name: "Room revenue" });
    if (key !== "overview") await user.click(screen.getByRole("tab", { name: label }));
    await waitFor(() => expect(mocks[key]).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope));
  });
  it.each([
    { orgId: "org-b" }, { hotelId: "hotel-b" }, { orgId: undefined }, { hotelId: undefined },
  ])("rejects response scope %j before caching or displaying", async override => {
    const data = overview({ meta: { ...meta } });
    Object.assign(data.meta, override);
    mocks.overview.mockResolvedValueOnce(data);
    const view = renderClient();
    expect((await screen.findByRole("alert")).textContent).toContain("active property, settings or report dates changed");
    expect(screen.queryByRole("heading", { name: "Room revenue" })).toBeNull();
    expect(screen.queryByText(/12,345.67/)).toBeNull();
    expect(view.client.getQueryData(qk.reports(scope.orgId, scope.hotelId, "overview", meta.startDate, meta.endDate))).toBeUndefined();
  });
  it.each([
    { orgId: "org-b" }, { hotelId: "hotel-b" }, { orgId: undefined }, { hotelId: undefined },
  ])("hides a previously cached response with scope %j", override => {
    const data = overview({ meta: { ...meta } });
    Object.assign(data.meta, override);
    renderClient(props, { ...scope, tab: "overview", data });
    expect(screen.getByRole("alert").textContent).toContain("active property, settings or report dates changed");
    expect(screen.queryByRole("heading", { name: "Room revenue" })).toBeNull();
    expect(screen.queryByText(/12,345.67/)).toBeNull();
    expect(mocks.overview).not.toHaveBeenCalled();
  });
  it.each(["org-a", "org-b"])("discards a late %s response after switching organizations", async responseOrgId => {
    let resolve!: (data: OverviewData) => void;
    mocks.overview.mockReturnValueOnce(new Promise<OverviewData>(resolvePromise => { resolve = resolvePromise; }));
    const view = renderClient();
    const nextScope = { orgId: "org-b", hotelId: "hotel-b" };
    mocks.identity = { ...mocks.identity, orgId: nextScope.orgId };
    view.rerender(<ReportsClient {...props} />);
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull();
    const next = overview({ revenue: 222.22, meta: { ...meta, ...nextScope } });
    mocks.overview.mockResolvedValueOnce(next);
    view.rerender(<ReportsClient {...props} {...nextScope} />);
    await screen.findByRole("heading", { name: "Room revenue" });
    const currentKey = qk.reports(nextScope.orgId, nextScope.hotelId, "overview", meta.startDate, meta.endDate);
    const accepted = view.client.getQueryData<ReportSnapshot>(currentKey);
    expect(accepted?.data.meta).toMatchObject(nextScope);
    await act(async () => { resolve(overview({ meta: { ...meta, orgId: responseOrgId, hotelId: responseOrgId === "org-a" ? "hotel-a" : "hotel-b" } })); });
    expect(view.client.getQueryData(qk.reports(scope.orgId, scope.hotelId, "overview", meta.startDate, meta.endDate))).toBeUndefined();
    expect(view.client.getQueryData(currentKey)).toBe(accepted);
    expect(screen.getByLabelText("Key performance indicators").textContent).toContain("222.22");
    expect(screen.getByLabelText("Key performance indicators").textContent).not.toContain("12,345.67");
  });
});
