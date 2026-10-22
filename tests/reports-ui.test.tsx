/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import type { GuestsData, OccupancyData, OverviewData, RevenueData } from "@/app/dashboard/reports/actions";
import { ReportsClient, type ReportsClientProps } from "@/app/dashboard/reports/reports-client";
import { PeriodControl } from "@/app/dashboard/reports/_components/period-control";
import { OverviewTab } from "@/app/dashboard/reports/_components/overview-tab";
import { OccupancyTab } from "@/app/dashboard/reports/_components/occupancy-tab";
import { GuestsTab } from "@/app/dashboard/reports/_components/guests-tab";
import { buildReportCsv, canExportReport, csvCell, type ExportContext, type ReportSnapshot } from "@/app/dashboard/reports/_components/report-export";
import { shiftReportDate, validateReportRange } from "@/app/dashboard/reports/_components/report-utils";
import { qk } from "@/lib/query-keys";

const mocks = vi.hoisted(() => ({
  identity: { isLoaded: true, userId: "staff-a", orgId: "org-a" },
  overview: vi.fn(), revenue: vi.fn(), occupancy: vi.fn(), guests: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => mocks.identity }));
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
    sources: [{ source: "direct", count: 12, roomNights: 63, revenue: 12345.67, pct: 100 }], meta, ...overrides };
}
function occupancy(overrides: Partial<OccupancyData> = {}): OccupancyData {
  return { currency: "GHS", occupancy: null, roomNights: 6, availableRoomNights: null, avgLengthOfStay: 2, newBookings: 3,
    deltas: { occupancy: null, roomNights: 10 }, daily: [{ date: "2026-10-01", label: "Oct 1", occupancy: null }],
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
const context: ExportContext = { orgId: "org-a", hotelId: "hotel-a", tab: "overview", timeZone: meta.timeZone,
  startDate: meta.startDate, endDate: meta.endDate, isSuccess: true, isFetching: false, isStale: false };
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
  it("keeps invalid drafts local and applies a complete valid range once", async () => {
    const apply = vi.fn(); const user = userEvent.setup();
    render(<PeriodControl startDate={meta.startDate} endDate={meta.endDate} today={props.today} onChange={apply} />);
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-21" } });
    expect(apply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Apply dates" }));
    expect(screen.getByRole("alert").textContent).toContain("on or after");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-05" } });
    await user.click(screen.getByRole("button", { name: "Apply dates" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith("2026-10-05", "2026-10-20");
  });
});

describe("safe current-report CSV", () => {
  it.each(["=HYPERLINK(\"bad\")", "+SUM(A1:A2)", "-cmd", "@SUM(A1)", " \t=1", "\n=1", "\tplain"]) ("neutralizes spreadsheet input %s", (input) => {
    expect(csvCell(input)).toBe(`"'${input.replaceAll('"', '""')}"`);
  });
  it("quotes commas, newlines and quotes without changing trusted negative numbers", () => {
    expect(csvCell('Suite, "A"\nannex')).toBe('"Suite, ""A""\nannex"');
    expect(csvCell(-10.25)).toBe('"-10.25"');
    expect(csvCell(null)).toBe('"Unavailable"');
  });
  it("exports exact amounts, dates, currency, basis and warnings", () => {
    const snapshot: ReportSnapshot = { tab: "overview", data: overview({ meta: { ...meta, warnings: ["Historical inventory unavailable"] } }) };
    const csv = buildReportCsv(snapshot, context);
    expect(csv).toContain('"Currency","GHS"');
    expect(csv).toContain('"Organization","org-a"');
    expect(csv).toContain('"Hotel","hotel-a"');
    expect(csv).toContain('"Start date (inclusive)","2026-10-01"');
    expect(csv).toContain('"12345.67"');
    expect(csv).toContain('"Report note","Historical inventory unavailable"');
    expect(csv).toContain("Confirmed bookings and today's incomplete night are excluded");
  });
  it.each([{ orgId: "org-b" }, { hotelId: "hotel-b" }, { tab: "guests" as const }, { startDate: "2026-10-02" },
    { timeZone: "Europe/London" }, { isSuccess: false }, { isFetching: true }, { isStale: true }])("refuses mismatched or stale export %j", (override) => {
    const snapshot: ReportSnapshot = { tab: "overview", data: overview() };
    expect(canExportReport(snapshot, { ...context, ...override })).toBe(false);
    expect(() => buildReportCsv(snapshot, { ...context, ...override })).toThrow("Refresh the current report");
  });
  it("exports each active tab with its own data and makes current balance scope explicit", () => {
    const snapshots: ReportSnapshot[] = [
      { tab: "revenue", data: revenue() },
      { tab: "occupancy", data: occupancy() },
      { tab: "guests", data: guests() },
    ];
    expect(buildReportCsv(snapshots[0], { ...context, tab: "revenue" })).toContain("Week starting (selected dates only)");
    expect(buildReportCsv(snapshots[1], { ...context, tab: "occupancy" })).toContain('"Garden suite","6","Unavailable","Unavailable"');
    const csv = buildReportCsv(snapshots[2], { ...context, tab: "guests" });
    expect(csv).toContain('"Selected-period collections","321.45"');
    expect(csv).toContain('"Current outstanding (all booking dates; generated-at snapshot)","9876.54"');
    expect(csv).not.toContain('"Room revenue excluding tax","12345.67"');
  });
  it.each([
    { orgId: "org-b" }, { hotelId: "hotel-b" }, { orgId: undefined }, { hotelId: undefined },
  ])("rejects server scope %j even if a legacy client stamp matches the export context", override => {
    const data = overview({ meta: { ...meta } });
    Object.assign(data.meta, override);
    const snapshot = { ...scope, tab: "overview" as const, data };
    expect(canExportReport(snapshot, context)).toBe(false);
    expect(() => buildReportCsv(snapshot, context)).toThrow("Refresh the current report");
  });
  it("rejects missing server metadata without trusting a legacy client stamp", () => {
    const data = overview();
    Reflect.deleteProperty(data, "meta");
    const snapshot = { ...scope, tab: "overview" as const, data };
    expect(canExportReport(snapshot, context)).toBe(false);
    expect(() => buildReportCsv(snapshot, context)).toThrow("Refresh the current report");
  });
});

describe("report UI semantics and data states", () => {
  it("shows four exact KPIs, source headers and a keyboard-reachable chart data table", async () => {
    const user = userEvent.setup();
    render(<OverviewTab data={overview()} />);
    const metrics = screen.getByLabelText("Key performance indicators");
    expect(metrics.querySelectorAll("dt")).toHaveLength(4);
    expect(metrics.textContent).toContain("12,345.67");
    expect(screen.getByRole("heading", { name: "Daily room revenue" })).toBeDefined();
    expect(screen.getByRole("table", { name: /Booking sources/ })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Room nights" })).toBeDefined();
    await user.click(screen.getByText("View daily room revenue data table"));
    const table = screen.getByRole("table", { name: "Daily room revenue — exact values" });
    expect(within(table).getByRole("rowheader", { name: "Oct 1, 2026" })).toBeDefined();
    expect(table.textContent).toContain("12,345.67");
  });
  it("distinguishes unavailable occupancy from a real zero and still exposes room nights", () => {
    const view = render(<OccupancyTab data={occupancy()} />);
    expect(screen.getByText("Data unavailable")).toBeDefined();
    expect(screen.queryByText("No occupied room nights in this period.")).toBeNull();
    expect(screen.getByRole("table", { name: "Occupancy by room type" }).textContent).toContain("Garden suite6UnavailableUnavailable");
    view.rerender(<OccupancyTab data={occupancy({ occupancy: 0, daily: [{ date: meta.startDate, label: "Oct 1", occupancy: 0 }] })} />);
    expect(screen.getByText("No occupied room nights in this period.")).toBeDefined();
    expect(screen.queryByText("Data unavailable")).toBeNull();
  });
  it("shows true empty revenue and sources without implying an error", () => {
    render(<OverviewTab data={overview({ revenue: 0, series: [], sources: [] })} />);
    expect(screen.getByText("No room revenue in this period.")).toBeDefined();
    expect(screen.getByText("No bookings in this period.")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("separates selected collections from current outstanding and labels guest arrivals", () => {
    render(<GuestsTab data={guests()} />);
    expect(screen.getByText("Collected in period")).toBeDefined();
    expect(screen.getByText("Arriving guests")).toBeDefined();
    const balance = screen.getByRole("region", { name: "Current outstanding balance" });
    expect(balance.textContent).toContain("9,876.54");
    expect(balance.textContent).toContain("Not limited to the selected dates");
  });
});

describe("report client fetch and export boundaries", () => {
  it("starts a CSV download for the successfully loaded tab", async () => {
    const user = userEvent.setup();
    const createUrl = vi.fn(() => "blob:reports-test");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderClient(); await screen.findByRole("heading", { name: "Daily room revenue" });
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByText(/Overview CSV downloaded for Oct 1, 2026/)).toBeDefined();
    expect(document.querySelector("a[download]")).toBeNull();
  });
  it("renders named tabs and requests only valid applied date changes", async () => {
    const user = userEvent.setup(); renderClient();
    expect(await screen.findByRole("heading", { name: "Daily room revenue" })).toBeDefined();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Overview", "Room revenue", "Occupancy", "Guests & collections"]);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-05" } });
    expect(mocks.overview).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Showing Oct 1, 2026/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Apply dates" }));
    await waitFor(() => expect(mocks.overview).toHaveBeenLastCalledWith("2026-10-05", "2026-10-20", scope));
  });
  it("shows loading then an actionable error, never fake zero totals", async () => {
    let reject!: (error: Error) => void;
    mocks.overview.mockReturnValueOnce(new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    renderClient();
    expect(screen.getByRole("status", { name: "Loading report" })).toBeDefined();
    reject(new Error("Report service unavailable."));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry report" })).toBeDefined();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Room revenue (excl. tax)")).toBeNull();
  });
  it("retains data with a stale warning after refresh failure and blocks export", async () => {
    const user = userEvent.setup(); renderClient();
    await screen.findByRole("heading", { name: "Daily room revenue" });
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(false);
    mocks.overview.mockRejectedValueOnce(new Error("Offline"));
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Refresh failed");
    expect(screen.getByRole("heading", { name: "Daily room revenue" })).toBeDefined();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("removes prior-tenant values immediately on identity change, even with stale server props", async () => {
    const view = renderClient();
    await screen.findByRole("heading", { name: "Daily room revenue" });
    mocks.identity = { ...mocks.identity, orgId: "org-b" };
    view.rerender(<ReportsClient {...props} />);
    expect(screen.queryByRole("heading", { name: "Daily room revenue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
    mocks.overview.mockImplementationOnce(() => new Promise(() => {}));
    view.rerender(<ReportsClient {...props} orgId="org-b" hotelId="hotel-b" />);
    expect(screen.getByRole("status", { name: "Loading report" })).toBeDefined();
    expect(screen.queryByText(/12,345.67/)).toBeNull();
  });
  it("rejects a response for different effective dates instead of displaying or exporting it", async () => {
    mocks.overview.mockResolvedValueOnce(overview({ meta: { ...meta, startDate: "2026-09-01" } }));
    renderClient();
    expect((await screen.findByRole("alert")).textContent).toContain("active property, settings or report dates changed");
    expect(screen.queryByRole("heading", { name: "Daily room revenue" })).toBeNull();
  });
  it("keeps export disabled while another tab loads and shows backend notes plainly", async () => {
    const user = userEvent.setup();
    mocks.overview.mockResolvedValueOnce(overview({ meta: { ...meta, warnings: ["Historical capacity is unavailable."] } }));
    mocks.guests.mockImplementationOnce(() => new Promise(() => {}));
    renderClient(); await screen.findByRole("heading", { name: "Daily room revenue" });
    expect(screen.getByRole("complementary", { name: "Report notes" }).textContent).toContain("Historical capacity is unavailable");
    await user.click(screen.getByRole("tab", { name: "Guests & collections" }));
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("heading", { name: "Daily room revenue" })).toBeNull();
  });
  it.each([
    ["Overview", "overview"], ["Room revenue", "revenue"], ["Occupancy", "occupancy"], ["Guests & collections", "guests"],
  ] as const)("passes expected tenant scope to the %s action", async (label, key) => {
    const user = userEvent.setup(); renderClient();
    await screen.findByRole("heading", { name: "Daily room revenue" });
    if (key !== "overview") await user.click(screen.getByRole("tab", { name: label }));
    await waitFor(() => expect(mocks[key]).toHaveBeenCalledExactlyOnceWith(meta.startDate, meta.endDate, scope));
    await waitFor(() => expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(false));
  });
  it.each([
    { orgId: "org-b" }, { hotelId: "hotel-b" }, { orgId: undefined }, { hotelId: undefined },
  ])("rejects response scope %j before caching, displaying or enabling export", async override => {
    const data = overview({ meta: { ...meta } });
    Object.assign(data.meta, override);
    mocks.overview.mockResolvedValueOnce(data);
    const view = renderClient();
    expect((await screen.findByRole("alert")).textContent).toContain("active property, settings or report dates changed");
    expect(screen.queryByRole("heading", { name: "Daily room revenue" })).toBeNull();
    expect(screen.queryByText(/12,345.67/)).toBeNull();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.client.getQueryData(qk.reports(scope.orgId, scope.hotelId, "overview", meta.startDate, meta.endDate))).toBeUndefined();
  });
  it.each([
    { orgId: "org-b" }, { hotelId: "hotel-b" }, { orgId: undefined }, { hotelId: undefined },
  ])("hides a previously cached response with scope %j despite a matching legacy client stamp", override => {
    const data = overview({ meta: { ...meta } });
    Object.assign(data.meta, override);
    renderClient(props, { ...scope, tab: "overview", data });
    expect(screen.getByRole("alert").textContent).toContain("active property, settings or report dates changed");
    expect(screen.queryByRole("heading", { name: "Daily room revenue" })).toBeNull();
    expect(screen.queryByText(/12,345.67/)).toBeNull();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.overview).not.toHaveBeenCalled();
  });
  it.each(["org-a", "org-b"])("discards a late %s response after switching organizations", async responseOrgId => {
    let resolve!: (data: OverviewData) => void;
    mocks.overview.mockReturnValueOnce(new Promise<OverviewData>(resolvePromise => { resolve = resolvePromise; }));
    const view = renderClient();
    const nextScope = { orgId: "org-b", hotelId: "hotel-b" };
    mocks.identity = { ...mocks.identity, orgId: nextScope.orgId };
    view.rerender(<ReportsClient {...props} />);
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
    const next = overview({ revenue: 222.22, meta: { ...meta, ...nextScope } });
    mocks.overview.mockResolvedValueOnce(next);
    view.rerender(<ReportsClient {...props} {...nextScope} />);
    await screen.findByRole("heading", { name: "Daily room revenue" });
    const currentKey = qk.reports(nextScope.orgId, nextScope.hotelId, "overview", meta.startDate, meta.endDate);
    const accepted = view.client.getQueryData<ReportSnapshot>(currentKey);
    expect(accepted?.data.meta).toMatchObject(nextScope);
    await act(async () => { resolve(overview({ meta: { ...meta, orgId: responseOrgId, hotelId: responseOrgId === "org-a" ? "hotel-a" : "hotel-b" } })); });
    expect(view.client.getQueryData(qk.reports(scope.orgId, scope.hotelId, "overview", meta.startDate, meta.endDate))).toBeUndefined();
    expect(view.client.getQueryData(currentKey)).toBe(accepted);
    expect(screen.getByLabelText("Key performance indicators").textContent).toContain("222.22");
    expect(screen.getByLabelText("Key performance indicators").textContent).not.toContain("12,345.67");
    const csv = buildReportCsv(accepted, { ...context, ...nextScope });
    expect(csv).toContain('"Organization","org-b"');
    expect(csv).toContain('"Hotel","hotel-b"');
    expect(csv).toContain('"Room revenue excluding tax","222.22"');
  });
  it("discards a late prior-range response without repopulating its cache", async () => {
    const user = userEvent.setup();
    let resolve!: (data: OverviewData) => void;
    mocks.overview.mockReturnValueOnce(new Promise<OverviewData>(resolvePromise => { resolve = resolvePromise; }));
    const view = renderClient();
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-05" } });
    await user.click(screen.getByRole("button", { name: "Apply dates" }));
    await screen.findByRole("heading", { name: "Daily room revenue" });
    const currentKey = qk.reports(scope.orgId, scope.hotelId, "overview", "2026-10-05", meta.endDate);
    const accepted = view.client.getQueryData(currentKey);
    await act(async () => { resolve(overview()); });
    expect(view.client.getQueryData(qk.reports(scope.orgId, scope.hotelId, "overview", meta.startDate, meta.endDate))).toBeUndefined();
    expect(view.client.getQueryData(currentKey)).toBe(accepted);
    expect(screen.getByText(/Showing Oct 5, 2026/)).toBeDefined();
  });
});
