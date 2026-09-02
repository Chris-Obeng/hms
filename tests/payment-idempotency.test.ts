import { describe, expect, it, vi, beforeEach } from "vitest";

const insertErrorHolder = { value: null as { code: string; message: string } | null };
const bookingUpdateErrorHolder = { value: null as { message: string } | null };

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: makeDb() }));
vi.mock("@/lib/notifications/send-booking-confirmation", () => ({
  sendBookingConfirmation: vi.fn(async () => ({ success: true, channel: "email" })),
}));

import { recordOnlinePayment } from "@/lib/bookings/confirm-online-payment";

// ── Fake supabaseAdmin ─────────────────────────────────────────────

interface DbConfig {
  booking?: Record<string, unknown> | null;
  fullBooking?: Record<string, unknown>;
  hotel?: Record<string, unknown>;
  staff?: { id: string; notification_prefs: unknown }[];
  existingAlert?: { id: string } | null;
}

let dbConfig: DbConfig = {};

function recorded() {
  return {
    paymentInserts: [] as Record<string, unknown>[],
    bookingUpdates: [] as Record<string, unknown>[],
    notificationInserts: [] as Record<string, unknown>[],
    amountPaid: 0,
    rpcCalls: [] as { p_booking_id: string; p_hotel_id: string; p_amount: number }[],
  };
}

let state = recorded();

function makeDb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(table: string): any {
    const api: Record<string, unknown> = {};
    const chain = () => api;

    api.select = chain;
    api.eq = chain;
    api.order = chain;
    api.limit = chain;

    api.maybeSingle = () =>
      Promise.resolve({
        data:
          table === "bookings"
            ? (dbConfig.booking ?? null)
            : (dbConfig.existingAlert ?? null),
        error: null,
      });

    api.single = () =>
      Promise.resolve({
        data: table === "bookings" ? (dbConfig.fullBooking ?? {}) : (dbConfig.hotel ?? {}),
        error: null,
      });

    api.insert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      const list = Array.isArray(rows) ? rows : [rows];
      if (table === "payments") state.paymentInserts.push(...list);
      else if (table === "notifications") state.notificationInserts.push(...list);
      return { error: table === "payments" ? insertErrorHolder.value : null };
    };

    api.update = (patch: Record<string, unknown>) => {
      if (table === "bookings") state.bookingUpdates.push(patch);
      const eqResult = () =>
        Promise.resolve({ data: null, error: bookingUpdateErrorHolder.value });
      return {
        eq: () => ({ eq: eqResult }),
      };
    };

    // Bare await (e.g. staff_profiles recipient lookup) resolves a list
    api.then = (
      resolve: (v: { data: unknown; error: null }) => unknown,
      reject?: (e: unknown) => unknown
    ) =>
      Promise.resolve({ data: table === "staff_profiles" ? (dbConfig.staff ?? []) : [], error: null }).then(
        resolve,
        reject
      );

    return api;
  }

  return {
    from,
    rpc: (fn: string, args: { p_booking_id: string; p_hotel_id: string; p_amount: number }) => {
      if (fn !== "add_online_payment_to_booking") {
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
      }
      state.rpcCalls.push(args);
      state.amountPaid += args.p_amount;
      return Promise.resolve({ data: state.amountPaid, error: null });
    },
  };
}

const BOOKING = {
  id: "b-1",
  hotel_id: "h-1",
  reference: "HTL-101",
  total_amount: 500,
  currency: "GHS",
  status: "pending",
  payment_status: "unpaid",
  cancellation_reason: null,
};

function reset(
  overrides: Partial<DbConfig> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  booking: any = BOOKING
) {
  dbConfig = {
    booking,
    fullBooking: { id: "b-1", reference: "HTL-101", check_in: "2026-09-01", check_out: "2026-09-02", nights: 1, total_amount: 500, guests: [{ full_name: "Kofi M", email: "k@example.com", phone: "+233" }], room_types: [{ name: "Deluxe" }] },
    hotel: { name: "Test Hotel", currency: "GHS", clerk_org_id: "org-1", check_in_time: "14:00", check_out_time: "12:00" },
    staff: [{ id: "s-1", notification_prefs: { new_booking: true } }],
    existingAlert: null,
    ...overrides,
  };
}

beforeEach(() => {
  state = recorded();
  insertErrorHolder.value = null;
  bookingUpdateErrorHolder.value = null;
  reset();
});

describe("recordOnlinePayment — idempotency & money integrity", () => {
  it("records a full payment once and confirms the booking", async () => {
    const result = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-1720000000",
      paystackId: "12345",
      amountPaid: 500,
      currency: "GHS",
    });

    expect(result.outcome).toBe("recorded");
    expect(result).toMatchObject({ fullyPaid: true, partial: false });
    expect(state.paymentInserts).toHaveLength(1);
    expect(state.paymentInserts[0]).toMatchObject({
      booking_id: "b-1",
      amount: 500,
      status: "success",
      paystack_reference: "HTL-101-1720000000",
    });
    expect(state.bookingUpdates[0]).toMatchObject({ status: "confirmed", payment_status: "paid" });
  });

  it("duplicate delivery (webhook retry racing verify) short-circuits as already_recorded", async () => {
    insertErrorHolder.value = { code: "23505", message: "duplicate key value violates unique constraint \"payments_paystack_reference_key\"" };

    const result = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-1720000000",
      amountPaid: 500,
      currency: "GHS",
    });

    expect(result.outcome).toBe("already_recorded");
    expect(state.bookingUpdates).toHaveLength(0);
    expect(state.notificationInserts).toHaveLength(0);
  });

  it("partial payment keeps booking pending and marks payment_status partial", async () => {
    const result = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-partial",
      amountPaid: 200,
      currency: "GHS",
    });

    if (result.outcome === "failed") throw new Error(result.error);
    expect(result.partial).toBe(true);
    expect(state.bookingUpdates[0]).toMatchObject({ status: "pending", payment_status: "partial" });
    expect(String(state.paymentInserts[0].notes)).toContain("Partial payment");
  });

  it("two partial payments accumulate — the second one confirms without losing the first", async () => {
    const first = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-p1",
      amountPaid: 300,
      currency: "GHS",
    });
    if (first.outcome === "failed") throw new Error(first.error);
    expect(first.partial).toBe(true);
    expect(state.bookingUpdates[0]).toMatchObject({ status: "pending", payment_status: "partial" });

    const second = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-p2",
      amountPaid: 200,
      currency: "GHS",
    });
    expect(second.outcome).toBe("recorded");
    if (second.outcome === "failed") throw new Error(second.error);
    expect(second.fullyPaid).toBe(true);
    // Cumulative money (500) drives confirmation, not the last txn's amount.
    expect(state.bookingUpdates[1]).toMatchObject({ status: "confirmed", payment_status: "paid" });
    expect(state.rpcCalls).toEqual([
      { p_booking_id: "b-1", p_hotel_id: "h-1", p_amount: 300 },
      { p_booking_id: "b-1", p_hotel_id: "h-1", p_amount: 200 },
    ]);
    // Booking update must never overwrite the accumulated total.
    expect(state.bookingUpdates.every((u) => !("amount_paid" in u))).toBe(true);
  });

  it("currency mismatch fails closed without inserting a payment", async () => {
    const result = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-usd",
      amountPaid: 500,
      currency: "USD",
    });

    expect(result.outcome).toBe("failed");
    expect(state.paymentInserts).toHaveLength(0);
    expect(state.notificationInserts.some((n) => n.type === "payment_failed")).toBe(true);
  });

  it("carries a machine-stable dedupe key on the review alert", async () => {
    await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-usd",
      amountPaid: 500,
      currency: "USD",
    });

    // The unique index is on (booking_id, dedupe_key), so the key — not the
    // title — is what makes the webhook and the verify fallback alert once.
    const alert = state.notificationInserts.find((n) => n.type === "payment_failed");
    expect(alert?.dedupe_key).toBe("payment-review:currency-mismatch");
    expect(alert?.booking_id).toBe("b-1");
  });

  it("non-positive amount is rejected outright", async () => {
    const result = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-zero",
      amountPaid: 0,
    });
    expect(result.outcome).toBe("failed");
    expect(state.paymentInserts).toHaveLength(0);
  });

  it("late webhook after hold expiry resurrects a payment_timeout cancellation", async () => {
    reset({}, { ...BOOKING, status: "cancelled", cancellation_reason: "payment_timeout" });

    const result = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-late",
      amountPaid: 500,
      currency: "GHS",
    });

    if (result.outcome === "failed") throw new Error(result.error);
    expect(result.fullyPaid).toBe(true);
    expect(state.bookingUpdates[0]).toMatchObject({
      status: "confirmed",
      payment_status: "paid",
      cancelled_at: null,
      cancellation_reason: null,
    });
  });

  it("payment landing on a staff-cancelled booking records money but never flips state", async () => {
    reset({}, { ...BOOKING, status: "cancelled", cancellation_reason: "guest_request" });

    const result = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-dead",
      amountPaid: 500,
      currency: "GHS",
    });

    expect(result.outcome).toBe("recorded");
    expect((result as { bookingStateUnchanged?: boolean }).bookingStateUnchanged).toBe(true);
    expect(state.bookingUpdates).toHaveLength(0);
    expect(state.paymentInserts).toHaveLength(1);
    expect(state.notificationInserts.some((n) => n.type === "payment_failed")).toBe(true);
  });

  it("missing booking reports failure so Paystack retries are not dropped silently", async () => {
    reset({}, null);
    const result = await recordOnlinePayment({
      bookingId: "missing",
      paystackReference: "X-1",
      amountPaid: 100,
    });
    expect(result.outcome).toBe("failed");
  });
});
