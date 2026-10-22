import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { fetchDashboardOccupancy } from "@/lib/dashboard/fetch-dashboard-occupancy";

const now = new Date("2026-10-21T12:00:00Z");
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

function clientWithInventory({ roomCount = 3, failTable, missingCount = false, rpcAvailable = 2 }: {
  roomCount?: number; failTable?: string; missingCount?: boolean; rpcAvailable?: number;
} = {}) {
  const requests: { url: URL; init: RequestInit | undefined }[] = [];
  const rooms = Array.from({ length: roomCount }, (_, i) => ({ id: `r-${i}`, room_type_id: "standard", status: "available" }));
  const reservations = [{ id: "b1", room_id: null, room_type_id: "standard", rooms_count: 1, status: "confirmed", payment_status: "unpaid", payment_preference: "pay_later", source: "manual", created_at: "2026-10-20T12:00:00Z" }];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push({ url, init });
    const name = url.pathname.split("/").pop();
    if (name === failTable) return new Response(JSON.stringify({ message: "inventory permission denied", code: "42501", details: null, hint: null }), { status: 403, headers: { "Content-Type": "application/json" } });
    if (name === "room_type_available_counts") return new Response(JSON.stringify([{ room_type_id: "standard", available: rpcAvailable }]), { headers: { "Content-Type": "application/json" } });
    const rows = name === "rooms" ? rooms : name === "bookings" ? reservations : [];
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const page = rows.slice(offset, offset + limit);
    return new Response(JSON.stringify(page), { headers: {
      "Content-Type": "application/json",
      ...(!missingCount ? { "Content-Range": `${offset}-${offset + page.length - 1}/${rows.length}` } : {}),
    } });
  });
  const supabase = createClient<Database>("https://inventory-test.invalid", "test-publishable-key", {
    global: { fetch: fetchMock }, accessToken: async () => "test-token",
  });
  return { supabase, requests, fetchMock };
}

describe("dashboard occupancy data boundary", () => {
  it("uses hotel-scoped reads, half-open stay dates and the existing batch RPC", async () => {
    const { supabase, requests } = clientWithInventory();
    const metric = await fetchDashboardOccupancy(supabase, "hotel-a", "2026-10-21", "UTC");
    expect(metric).toMatchObject({ state: "ready", soldRooms: 1, availableRooms: 2, totalRooms: 3 });
    for (const { url } of requests.filter(({ url }) => !url.pathname.includes("/rpc/"))) {
      expect(url.searchParams.get("hotel_id")).toBe("eq.hotel-a");
    }
    const bookingUrl = requests.find(({ url }) => url.pathname.endsWith("/bookings"))!.url;
    expect(bookingUrl.searchParams.get("check_in")).toBe("lte.2026-10-21");
    expect(bookingUrl.searchParams.get("check_out")).toBe("gt.2026-10-21");
    expect(bookingUrl.searchParams.get("status")).toBe("in.(pending,confirmed,checked_in)");
    expect(JSON.parse(String(requests.find(({ url }) => url.pathname.includes("/rpc/"))!.init?.body))).toEqual({
      p_room_type_ids: ["standard"], p_from: "2026-10-21", p_to: "2026-10-22",
    });
  });
  it("does not call live inventory or the forward-only RPC for historical days", async () => {
    const { supabase, fetchMock } = clientWithInventory();
    expect(await fetchDashboardOccupancy(supabase, "hotel-a", "2026-10-20", "UTC")).toMatchObject({ state: "unavailable", totalRooms: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("resolves past versus future using the property's business date", async () => {
    vi.setSystemTime(new Date("2026-10-21T23:30:00Z"));
    const { supabase, fetchMock } = clientWithInventory();
    expect(await fetchDashboardOccupancy(supabase, "hotel-a", "2026-10-21", "Asia/Tokyo")).toMatchObject({ state: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("paginates inventory instead of silently using the first page", async () => {
    const { supabase, requests } = clientWithInventory({ roomCount: 1001, rpcAvailable: 1000 });
    expect(await fetchDashboardOccupancy(supabase, "hotel-a", "2026-10-21", "UTC")).toMatchObject({ state: "ready", totalRooms: 1001, availableRooms: 1000 });
    expect(requests.filter(({ url }) => url.pathname.endsWith("/rooms"))).toHaveLength(3);
  });
  it.each(["rooms", "bookings", "availability_blocks", "room_type_available_counts"])("propagates %s database errors", async (failTable) => {
    const { supabase } = clientWithInventory({ failTable });
    await expect(fetchDashboardOccupancy(supabase, "hotel-a", "2026-10-21", "UTC")).rejects.toMatchObject({ message: "inventory permission denied" });
  });
  it("rejects missing count metadata instead of guessing that all rows arrived", async () => {
    const { supabase } = clientWithInventory({ missingCount: true });
    await expect(fetchDashboardOccupancy(supabase, "hotel-a", "2026-10-21", "UTC")).rejects.toThrow("incomplete");
  });
  it("makes a mismatch with authoritative availability visible", async () => {
    const { supabase } = clientWithInventory({ rpcAvailable: 1 });
    const metric = await fetchDashboardOccupancy(supabase, "hotel-a", "2026-10-21", "UTC");
    expect(metric.state).toBe("inconsistent");
    expect(metric.issues.join(" ")).toContain("disagree");
  });
});
