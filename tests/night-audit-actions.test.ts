import { beforeEach, describe, expect, it, vi } from "vitest";
import { nightAuditReceipt } from "./night-audit-fixtures";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireMinRole: vi.fn(), revalidatePath: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireMinRole: mocks.requireMinRole,
  toActionError: (err: unknown) => ({ success: false, error: err instanceof Error ? err.message : "Error" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/observability/sentry", () => ({ captureSupabaseError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const { getNightAuditData, executeNightAudit } = await import("@/app/dashboard/night-audit/actions");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMinRole.mockResolvedValue({ hotelId: "hotel-A", hotel: { status: "active" } });
  mocks.rpc.mockResolvedValue({ data: nightAuditReceipt(true), error: null });
});

describe("durable night audit actions", () => {
  it("closes the requested prior date through one tenant-scoped transactional RPC", async () => {
    const result = await executeNightAudit("2026-10-20", " notes ");
    expect(result.success).toBe(true);
    expect(mocks.requireMinRole).toHaveBeenCalledWith("manager", "close a business date");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("close_night_audit", { p_hotel_id: "hotel-A", p_business_date: "2026-10-20", p_notes: "notes" });
    expect(mocks.from).not.toHaveBeenCalled();
    if (result.success) expect(result.summary.lastAudit?.at).toBe("2026-10-21T01:20:00Z");
  });

  it("returns the original persisted receipt on replay without replacing its actor or notes", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...nightAuditReceipt(true), replayed: true }, error: null });
    const result = await executeNightAudit("2026-10-20", "replacement");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain("already closed");
      expect(result.summary.lastAudit?.notes).toBe("First handover");
    }
  });

  it("does not do application read-then-write when two actions arrive together", async () => {
    const results = await Promise.all([executeNightAudit("2026-10-20"), executeNightAudit("2026-10-20")]);
    expect(results.every((result) => result.success && result.summary.closeId === "close-20")).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.from).not.toHaveBeenCalled();
    // Actual serialization/unique-key enforcement is exercised by the SQL suite.
  });

  it.each(["PGRST202", "42883", "42P01"])("fails visibly when durable schema is missing (%s)", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "missing" } });
    expect(await executeNightAudit("2026-10-20")).toMatchObject({ success: false, error: expect.stringContaining("durable_business_date_close migration") });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("fails on persistence error, then lets a later explicit retry succeed", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message: "disk failure" } });
    expect(await executeNightAudit("2026-10-20")).toMatchObject({ success: false });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect((await executeNightAudit("2026-10-20")).success).toBe(true);
  });

  it("does not turn missing data or an unclosed response into success", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await executeNightAudit("2026-10-20")).success).toBe(false);
    mocks.rpc.mockResolvedValueOnce({ data: nightAuditReceipt(), error: null });
    expect((await executeNightAudit("2026-10-20")).success).toBe(false);
  });

  it("rejects a valid receipt for a different business date", async () => {
    expect(await executeNightAudit("2026-10-19")).toMatchObject({ success: false, error: expect.stringContaining("different business date") });
  });

  it.each(["2026-02-30", "garbage", "1999-01-01"])("rejects date %s without calling the database", async (date) => {
    expect((await executeNightAudit(date)).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects oversized notes", async () => {
    expect((await executeNightAudit("2026-10-20", "x".repeat(1001))).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects inactive staff or insufficient roles before any RPC", async () => {
    mocks.requireMinRole.mockRejectedValue(new Error("Inactive or forbidden"));
    expect((await executeNightAudit("2026-10-20")).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects inactive properties", async () => {
    mocks.requireMinRole.mockResolvedValue({ hotelId: "hotel-A", hotel: { status: "suspended" } });
    expect((await executeNightAudit("2026-10-20")).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("propagates the database unresolved-operation gate", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "Resolve arrivals before closing." } });
    expect(await executeNightAudit("2026-10-20")).toMatchObject({ success: false, error: "Resolve arrivals before closing." });
  });

  it("reads the saved summary by business date without fetching live rooms", async () => {
    expect((await getNightAuditData("2026-10-20")).roomRevenue).toBe(100.01);
    expect(mocks.requireMinRole).toHaveBeenCalledWith("read_only", "view Night Audit");
    expect(mocks.rpc).toHaveBeenCalledWith("get_night_audit_summary", { p_hotel_id: "hotel-A", p_business_date: "2026-10-20" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("delegates the default date to the database's property timezone", async () => {
    await getNightAuditData();
    expect(mocks.rpc).toHaveBeenCalledWith("get_night_audit_summary", { p_hotel_id: "hotel-A", p_business_date: null });
  });

  it("throws on required read errors instead of showing zero values", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "query failed" } });
    await expect(getNightAuditData("2026-10-20")).rejects.toThrow("could not confirm");
  });
});
