import { describe, expect, it, vi } from "vitest";

/**
 * Staff payments must go through the service role: the client-write guard
 * rejects a staff JWT that changes amount_paid ("Cannot directly modify
 * immutable or financial booking fields"). The role and hotel checks stay in
 * the server action.
 */

const adminRpc = vi.fn(async () => ({ data: [{ payment_id: "pay-1", payment_status: "paid" }], error: null }));
const userRpc = vi.fn(async () => ({
  data: null,
  error: { message: "Cannot directly modify immutable or financial booking fields" },
}));

function userQuery(table: string) {
  const row =
    table === "bookings"
      ? { id: "b1", total_amount: 300, amount_paid: 0, status: "checked_in", guests: null, room_types: null }
      : { id: "staff-1" };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "insert"]) chain[m] = () => chain;
  chain.single = async () => ({ data: row, error: null });
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc: adminRpc } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: userRpc, from: userQuery }),
}));
vi.mock("@/lib/auth", () => ({
  requireMinRole: vi.fn(async () => ({
    hotelId: "h1",
    hotel: { currency: "GHS" },
    orgId: "org1",
    userId: "user1",
    staffId: "staff-1",
    staffName: "Desk",
  })),
  toActionError: vi.fn(async (err: unknown) => ({ success: false, error: String(err) })),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/notify-hotel-staff", () => ({ notifyHotelStaff: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({})) }));

describe("recordPayment", () => {
  it("records a staff payment through the service role, not the staff JWT", async () => {
    const { recordPayment } = await import("@/app/actions/bookings-detail");
    const result = await recordPayment({
      bookingId: "6f1c3c1e-6c55-4f43-9a52-0a4f6f0d1a11",
      amount: 300,
      method: "cash",
      notes: "",
    });

    expect(result).toEqual({ success: true, paymentId: "pay-1" });
    expect(userRpc).not.toHaveBeenCalled();
    expect(adminRpc).toHaveBeenCalledWith(
      "record_payment_atomic",
      expect.objectContaining({ p_hotel_id: "h1", p_amount: 300, p_method: "cash", p_recorded_by: "staff-1" })
    );
  });
});
