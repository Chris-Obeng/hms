import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: makeDb() }));
vi.mock("@/lib/notifications/send-booking-confirmation", () => ({
  sendBookingConfirmation: vi.fn(async () => ({ success: true, channel: "email" })),
}));

import { recordOnlinePayment } from "@/lib/bookings/confirm-online-payment";
import { sendBookingConfirmation } from "@/lib/notifications/send-booking-confirmation";

// ── Fake supabaseAdmin ─────────────────────────────────────────────

interface DbConfig {
  booking?: Record<string, unknown> | null;
  fullBooking?: Record<string, unknown>;
  hotel?: Record<string, unknown>;
  staff?: { id: string; notification_prefs: unknown }[];
  existingAlert?: { id: string } | null;
}

let dbConfig: DbConfig = {};

interface SettlementCall {
  p_booking_id: string;
  p_hotel_id: string;
  p_paystack_reference: string;
  p_paystack_id: string;
  p_amount_minor: number;
  p_currency: string;
  p_subaccount_code: string;
  p_metadata: Record<string, string>;
}

function recorded() {
  return {
    notificationInserts: [] as Record<string, unknown>[],
    amountPaidMinor: 0,
    settledReferences: new Set<string>(),
    rpcFunctions: [] as string[],
    rpcCalls: [] as SettlementCall[],
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
      if (table === "notifications") state.notificationInserts.push(...list);
      return { error: null };
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
    rpc: (fn: string, args: SettlementCall) => {
      state.rpcFunctions.push(fn);
      if (fn !== "settle_online_payment_atomic") {
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
      }

      state.rpcCalls.push(args);
      const alreadyRecorded = state.settledReferences.has(args.p_paystack_reference);
      if (!alreadyRecorded) {
        state.settledReferences.add(args.p_paystack_reference);
        state.amountPaidMinor += args.p_amount_minor;
      }

      const activeBooking =
        dbConfig.booking?.status === "pending" ||
        (dbConfig.booking?.status === "cancelled" &&
          dbConfig.booking?.cancellation_reason === "payment_timeout");
      const totalMinor = Number(dbConfig.booking?.total_amount ?? 0) * 100;
      const paid = state.amountPaidMinor >= totalMinor;

      return Promise.resolve({
        data: [{
          result: alreadyRecorded ? "already_recorded" : "recorded",
          booking_id: args.p_booking_id,
          amount_paid_minor: state.amountPaidMinor,
          payment_status: paid ? "paid" : "partial",
          booking_status: activeBooking ? (paid ? "confirmed" : "pending") : dbConfig.booking?.status,
          partial_payment: !paid,
          already_recorded: alreadyRecorded,
        }],
        error: null,
      });
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
  vi.mocked(sendBookingConfirmation).mockClear();
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
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toMatchObject({
      p_booking_id: "b-1",
      p_hotel_id: "h-1",
      p_paystack_reference: "HTL-101-1720000000",
      p_paystack_id: "12345",
      p_amount_minor: 50000,
      p_currency: "GHS",
      p_metadata: {
        booking_id: "b-1",
        hotel_id: "h-1",
        booking_reference: "HTL-101",
      },
    });
  });

  it("duplicate delivery still settles so stale booking projections can be repaired", async () => {
    const payment = {
      bookingId: "b-1",
      paystackReference: "HTL-101-1720000000",
      paystackId: "12345",
      amountPaid: 500,
      currency: "GHS",
    };
    await recordOnlinePayment(payment);
    vi.mocked(sendBookingConfirmation).mockClear();

    const result = await recordOnlinePayment(payment);

    expect(result.outcome).toBe("already_recorded");
    expect(state.rpcFunctions).toEqual([
      "settle_online_payment_atomic",
      "settle_online_payment_atomic",
    ]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
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
    expect(state.rpcCalls[0]).toMatchObject({ p_amount_minor: 20000 });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
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

    const second = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-p2",
      amountPaid: 200,
      currency: "GHS",
    });
    expect(second.outcome).toBe("recorded");
    if (second.outcome === "failed") throw new Error(second.error);
    expect(second.fullyPaid).toBe(true);
    expect(state.rpcCalls.map((call) => call.p_amount_minor)).toEqual([30000, 20000]);
    expect(sendBookingConfirmation).toHaveBeenCalledTimes(1);
  });

  it("currency mismatch fails closed without inserting a payment", async () => {
    const result = await recordOnlinePayment({
      bookingId: "b-1",
      paystackReference: "HTL-101-usd",
      amountPaid: 500,
      currency: "USD",
    });

    expect(result.outcome).toBe("failed");
    expect(state.rpcCalls).toHaveLength(0);
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
    expect(state.rpcCalls).toHaveLength(0);
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
    expect(state.rpcCalls).toHaveLength(1);
    expect(sendBookingConfirmation).toHaveBeenCalledTimes(1);
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
    expect(state.rpcCalls).toHaveLength(1);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
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
