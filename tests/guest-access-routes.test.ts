import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Fakes ──────────────────────────────────────────────────────────

const HOTEL_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "33333333-3333-4333-8333-333333333333";

interface FakeDb {
  hotel: Record<string, unknown> | null;
  booking: Record<string, unknown> | null;
  inserts: { table: string; row: unknown }[];
}

const db: FakeDb = { hotel: null, booking: null, inserts: [] };

vi.mock("@/lib/supabase/admin", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(table: string): any {
    const api: Record<string, unknown> = {};
    const chain = () => api;
    api.select = chain;
    api.eq = chain;
    api.order = chain;
    api.limit = chain;
    const row = () =>
      table === "hotels" ? db.hotel : table === "bookings" ? db.booking : null;
    api.maybeSingle = () => Promise.resolve({ data: row(), error: null });
    api.single = () =>
      Promise.resolve(
        row()
          ? { data: row(), error: null }
          : { data: null, error: { code: "PGRST116", message: "no rows" } }
      );
    api.insert = (value: unknown) => {
      db.inserts.push({ table, row: value });
      return Promise.resolve({ error: null });
    };
    api.update = () => ({ eq: () => Promise.resolve({ error: null }) });
    return api;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 10, retryAfterSeconds: 60 })),
}));

vi.mock("@/lib/platform/fees", () => ({
  startPlatformFeeConfigRead: () => Promise.resolve({ type: "percentage", value: 0 }),
  computePlatformFeeMinor: () => 0,
}));

const initializeTransaction = vi.fn();
vi.mock("@/lib/paystack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paystack")>();
  return {
    ...actual,
    initializeTransaction: (...args: unknown[]) => initializeTransaction(...args),
    verifyTransaction: vi.fn(),
  };
});

import { GET as calendarGET } from "@/app/api/booking/[slug]/calendar/route";
import { GET as lookupGET } from "@/app/api/booking/[slug]/bookings/[reference]/route";
import { POST as retryPOST } from "@/app/api/booking/[slug]/bookings/[reference]/retry-payment/route";
import { signGuestAccess } from "@/lib/bookings/guest-access";

const SECRET = "k".repeat(48);

function hotel(extra: Record<string, unknown> = {}) {
  return {
    id: HOTEL_ID,
    name: "Test Hotel",
    address: "1 Road",
    city: "Accra",
    phone: "+233000000000",
    currency: "GHS",
    check_in_time: "14:00",
    check_out_time: "11:00",
    paystack_subaccount_code: "ACCT_test",
    paystack_domain: null,
    ...extra,
  };
}

function booking(reference: string, extra: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    group_id: null,
    reference,
    status: "pending",
    payment_status: "unpaid",
    payment_preference: "pay_now",
    source: "direct",
    check_in: "2027-01-10",
    check_out: "2027-01-12",
    nights: 2,
    total_amount: 500,
    amount_paid: 0,
    currency: "GHS",
    initiated_payment_refs: [],
    guests: { full_name: "Ama Mensah", email: "ama@example.com" },
    room_types: { name: "Deluxe" },
    ...extra,
  };
}

const slugParams = { params: Promise.resolve({ slug: "test-hotel" }) };
const refParams = (reference: string) => ({
  params: Promise.resolve({ slug: "test-hotel", reference }),
});

beforeEach(() => {
  vi.stubEnv("BOOKING_LINK_SECRET", SECRET);
  db.hotel = hotel();
  db.booking = null;
  db.inserts = [];
  initializeTransaction.mockReset();
  initializeTransaction.mockResolvedValue({
    authorization_url: "https://checkout.paystack.com/x",
    access_code: "x",
    reference: "r",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("calendar route", () => {
  const url = (query: string) =>
    new NextRequest(`https://app.test/api/booking/test-hotel/calendar?${query}`);

  it("404s a current-format reference without a token", async () => {
    db.booking = booking("K7MX4Q");
    const res = await calendarGET(url("reference=K7MX4Q"), slugParams);
    expect(res.status).toBe(404);
  });

  it("404s a current-format reference with a wrong token", async () => {
    db.booking = booking("K7MX4Q");
    const res = await calendarGET(url(`reference=K7MX4Q&t=${"A".repeat(22)}`), slugParams);
    expect(res.status).toBe(404);
  });

  it("returns the file with the guest's name for a valid token", async () => {
    db.booking = booking("K7MX4Q");
    const t = signGuestAccess(HOTEL_ID, BOOKING_ID)!;
    const res = await calendarGET(url(`reference=K7MX4Q&t=${t}`), slugParams);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Guest: Ama Mensah");
  });

  it("returns a legacy booking without a token but leaves the name out", async () => {
    db.booking = booking("8803962598706");
    const res = await calendarGET(url("reference=8803962598706"), slugParams);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Guest: Guest");
    expect(body).not.toContain("Ama");
  });
});

describe("booking lookup route", () => {
  const req = (reference: string, init?: { query?: string; header?: string }) =>
    new NextRequest(
      `https://app.test/api/booking/test-hotel/bookings/${reference}${init?.query ? `?${init.query}` : ""}`,
      init?.header ? { headers: { "x-booking-access": init.header } } : undefined
    );

  it("404s a current-format reference without a token", async () => {
    db.booking = booking("K7MX4Q");
    const res = await lookupGET(req("K7MX4Q"), refParams("K7MX4Q"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Booking not found" });
  });

  it("returns full details with the token in the header or the query", async () => {
    db.booking = booking("K7MX4Q");
    const t = signGuestAccess(HOTEL_ID, BOOKING_ID)!;
    for (const init of [{ header: t }, { query: `t=${t}` }]) {
      const res = await lookupGET(req("K7MX4Q", init), refParams("K7MX4Q"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.booking.guestName).toBe("Ama Mensah");
      expect(body.booking.guestEmail).toBe("ama@example.com");
    }
  });

  it("masks contact details for a legacy reference without a token", async () => {
    db.booking = booking("HOP-2026-00001");
    const res = await lookupGET(req("HOP-2026-00001"), refParams("HOP-2026-00001"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.guestName).toBe("Ama");
    expect(body.booking.guestEmail).toBe("a***@example.com");
  });
});

describe("retry-payment route", () => {
  const req = (reference: string, token?: string) =>
    new NextRequest(
      `https://app.test/api/booking/test-hotel/bookings/${reference}/retry-payment`,
      { method: "POST", headers: token ? { "x-booking-access": token } : undefined }
    );

  it("404s without a token and never reaches Paystack", async () => {
    db.booking = booking("K7MX4Q");
    const res = await retryPOST(req("K7MX4Q"), refParams("K7MX4Q"));
    expect(res.status).toBe(404);
    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(db.inserts).toHaveLength(0);
  });

  it("404s with a token for another booking", async () => {
    db.booking = booking("K7MX4Q");
    const other = signGuestAccess(HOTEL_ID, "44444444-4444-4444-8444-444444444444")!;
    const res = await retryPOST(req("K7MX4Q", other), refParams("K7MX4Q"));
    expect(res.status).toBe(404);
    expect(initializeTransaction).not.toHaveBeenCalled();
  });

  it("starts a payment with a valid token and signs the callback link", async () => {
    db.booking = booking("K7MX4Q");
    const t = signGuestAccess(HOTEL_ID, BOOKING_ID)!;
    const res = await retryPOST(req("K7MX4Q", t), refParams("K7MX4Q"));
    expect(res.status).toBe(200);
    expect(initializeTransaction).toHaveBeenCalledTimes(1);
    const { callback_url } = initializeTransaction.mock.calls[0][0] as { callback_url: string };
    expect(callback_url).toBe(`https://app.test/test-hotel/confirmation?bref=K7MX4Q&t=${t}`);
  });

  it("still allows a legacy booking without a token (links issued before signing)", async () => {
    db.booking = booking("8803962598706");
    const res = await retryPOST(req("8803962598706"), refParams("8803962598706"));
    expect(res.status).toBe(200);
    expect(initializeTransaction).toHaveBeenCalledTimes(1);
  });
});
