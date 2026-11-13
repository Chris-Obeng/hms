import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { requireMinRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { businessDayBounds, businessToday } from "@/lib/business-date";
import { addDays, format, parseISO, subDays } from "date-fns";
import { assertCurrency, moneyMinor, priorRange, type NightRow, type StayRow } from "./bi-math";
import { resolveRange } from "./resolve-range";
import { readAllPages, reportReadError } from "./pagination";
import { fromMinor, sumMinor } from "@/lib/money";
import type { InventorySnapshot } from "./inventory";

// Local schema extension until the generated shared Database is refreshed after
// the migration. The client remains the authenticated, RLS-bound request client.
type ReportsDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      reports_inventory_history: {
        Row: { id: string; hotel_id: string; effective_date: string; capacity_by_type: Json; time_zone: string; captured_at: string };
        Insert: never; Update: never; Relationships: [];
      };
    };
  };
};
export interface ReportScope { orgId: string; hotelId: string }
export interface ReportMeta extends ReportScope {
  startDate: string; endDate: string; priorStartDate: string; priorEndDate: string;
  /** False when the range has no completed night (today only), so no comparison exists. */
  comparable: boolean;
  /** Last night actually compared: yesterday when the range ends today, otherwise endDate. */
  comparedEndDate: string;
  timeZone: string; generatedAt: string; warnings: string[];
}
export interface ReportStay extends StayRow { status: string | null; source: string | null; room_type_id: string | null; guest_id: string | null }
export const STAYED = ["checked_in", "checked_out"];
const STAY_FIELDS = "id, check_in, check_out, subtotal, currency, nights, rooms_count, adults, children, status, source, room_type_id, guest_id";
export const ROOM_BASIS = "Room revenue and room-nights use checked-in/checked-out stays on completed property nights only (checkout exclusive). Confirmed reservations and today's/future nights are excluded; these are live stay-derived figures, not posted-ledger or physically occupied-room counts.";
export const INVENTORY_BASIS = "Capacity uses dated active physical-room inventory at each property's day end. Maintenance, out-of-service and availability blocks are not deducted; this is not a sellable-inventory or external benchmarking denominator.";
export const BALANCE_BASIS = "Outstanding is the current tax-inclusive balance on all non-cancelled/non-no-show bookings, including departed stays; it is not an as-of-period receivables ledger.";

/** Auth, tenant match and hotel settings — everything a report needs before dates are involved. */
export async function resolveReportScope(expectedScope: ReportScope) {
  const auth = await requireMinRole("read_only", "view reports");
  // Page props express the caller's expectation, never authority to select a tenant.
  // Check before opening the report client, including the hotel settings read.
  if (!expectedScope || typeof expectedScope !== "object" || Array.isArray(expectedScope) ||
      typeof expectedScope.orgId !== "string" || !expectedScope.orgId.trim() ||
      typeof expectedScope.hotelId !== "string" || !expectedScope.hotelId.trim()) {
    throw new Error("Report unavailable: the expected organization and hotel are required.");
  }
  if (expectedScope.orgId !== auth.orgId || expectedScope.hotelId !== auth.hotelId) {
    throw new Error("The active property changed. Reload this page to continue.");
  }
  const client = await createClient();
  const supabase = client as unknown as SupabaseClient<ReportsDatabase>;
  const hotelResult = await supabase.from("hotels").select("currency, timezone, status").eq("id", auth.hotelId).single();
  if (hotelResult.error || !hotelResult.data) reportReadError("hotel settings", hotelResult.error);
  if (hotelResult.data.status !== "active") throw new Error("Reports are unavailable for an inactive hotel.");
  const currency = assertCurrency(hotelResult.data.currency);
  const timeZone = hotelResult.data.timezone;
  if (!timeZone) throw new Error("Report unavailable: the hotel timezone is missing.");
  const now = new Date();
  const today = businessToday(timeZone, now);
  return { auth, supabase, hotelId: auth.hotelId, currency, timeZone, now, today };
}

export async function reportContext(startDate: string, endDate: string, expectedScope: ReportScope) {
  const scope = await resolveReportScope(expectedScope);
  const { start, end } = resolveRange(startDate, endDate, scope.timeZone, scope.now);
  // Tonight is not finished, so a range that ends today is compared on its
  // completed nights only (start to yesterday), against the same number of
  // nights immediately before it. A range that is only today has no completed
  // night, so it keeps its one-day prior window and shows no comparison.
  const comparedEnd = endDate >= scope.today ? subDays(parseISO(scope.today), 1) : end;
  const comparable = comparedEnd >= start;
  const prior = priorRange(start, comparable ? comparedEnd : end);
  const comparedEndDate = format(comparable ? comparedEnd : end, "yyyy-MM-dd");
  const meta: ReportMeta = {
    orgId: scope.auth.orgId, hotelId: scope.hotelId,
    startDate, endDate, priorStartDate: format(prior.start, "yyyy-MM-dd"), priorEndDate: format(prior.end, "yyyy-MM-dd"),
    comparable, comparedEndDate,
    timeZone: scope.timeZone, generatedAt: scope.now.toISOString(), warnings: [],
  };
  return { supabase: scope.supabase, hotelId: scope.hotelId, currency: scope.currency, timeZone: scope.timeZone,
    today: scope.today, start, end, prior, comparable, comparedEnd: comparedEndDate, meta,
    startISO: businessDayBounds(startDate, scope.timeZone).startISO, endISO: businessDayBounds(endDate, scope.timeZone).endISO };
}
export type ReportContext = Awaited<ReturnType<typeof reportContext>>;

export function withWarnings(ctx: ReportContext, ...warnings: (string | string[])[]): ReportMeta {
  return { ...ctx.meta, warnings: [...new Set(warnings.flat())] };
}
export async function loadStays(ctx: ReportContext): Promise<ReportStay[]> {
  return readAllPages("stays", (after, size) => {
    let q = ctx.supabase.from("bookings").select(STAY_FIELDS, { count: "exact" })
      .eq("hotel_id", ctx.hotelId).in("status", STAYED)
      .lt("check_in", ctx.today).lt("check_in", format(addDays(ctx.end, 1), "yyyy-MM-dd"))
      .gt("check_out", ctx.meta.priorStartDate).order("id").limit(size);
    if (after) q = q.gt("id", after);
    return q;
  });
}
export async function loadNights(ctx: ReportContext, stays: ReportStay[]): Promise<NightRow[]> {
  const nights: NightRow[] = [];
  // Bound IN filters to avoid oversized URLs, and load the ENTIRE stay before
  // allocating discounts. A date-window-only snapshot query cannot reconcile.
  for (let offset = 0; offset < stays.length; offset += 100) {
    const batch = stays.slice(offset, offset + 100).map(s => s.id);
    const rows = await readAllPages("nightly snapshots", (after, size) => {
      let q = ctx.supabase.from("booking_nights").select("id, booking_id, stay_date, rate_minor, rooms_count, currency, source", { count: "exact" })
        .eq("hotel_id", ctx.hotelId).in("booking_id", batch).order("id").limit(size);
      if (after) q = q.gt("id", after);
      return q;
    }, 100_000 - nights.length);
    nights.push(...rows);
  }
  return nights;
}
export async function loadInventory(ctx: ReportContext): Promise<InventorySnapshot[]> {
  return readAllPages("inventory history (the reports inventory migration is required)", (after, size) => {
    let q = ctx.supabase.from("reports_inventory_history").select("id, effective_date, capacity_by_type, time_zone", { count: "exact" })
      .eq("hotel_id", ctx.hotelId).lte("effective_date", ctx.meta.endDate).order("id").limit(size);
    if (after) q = q.gt("id", after);
    return q;
  });
}
export interface OutstandingSummary { amount: number; count: number }
export async function loadOutstanding(ctx: ReportContext): Promise<number> {
  return (await loadOutstandingSummary(ctx)).amount;
}
/** Amount plus the open-bookings count, so the balance can carry its own denominator. */
export async function loadOutstandingSummary(ctx: ReportContext): Promise<OutstandingSummary> {
  const rows = await readAllPages("outstanding balances", (after, size) => {
    let q = ctx.supabase.from("bookings").select("id, outstanding_balance, currency", { count: "exact" })
      .eq("hotel_id", ctx.hotelId).in("status", ["pending", "confirmed", "checked_in", "checked_out"])
      .gt("outstanding_balance", 0).order("id").limit(size);
    if (after) q = q.gt("id", after);
    return q;
  });
  return { count: rows.length, amount: fromMinor(sumMinor(rows.map(row => {
    assertCurrency(row.currency, ctx.currency);
    return moneyMinor(row.outstanding_balance, ctx.currency);
  })), ctx.currency) };
}
