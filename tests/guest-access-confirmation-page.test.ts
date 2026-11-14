import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const HOTEL_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "33333333-3333-4333-8333-333333333333";

let bookingRow: Record<string, unknown> | null = null;
let rateLimitOk = true;

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: rateLimitOk, remaining: 0, retryAfterSeconds: 60 })),
}));

vi.mock("@/app/[slug]/_lib/get-public-hotel", () => ({
  getPublicHotel: async () => ({
    id: HOTEL_ID,
    name: "Test Hotel",
    logo_url: null,
    phone: null,
    currency: "GHS",
    check_in_time: "14:00",
    check_out_time: "11:00",
  }),
}));

vi.mock("@/lib/supabase/admin", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(): any {
    const api: Record<string, unknown> = {};
    const chain = () => api;
    api.select = chain;
    api.eq = chain;
    api.order = chain;
    api.single = () => Promise.resolve({ data: bookingRow, error: null });
    return api;
  }
  return { supabaseAdmin: { from } };
});

import ConfirmationPage from "@/app/[slug]/confirmation/page";
import { AwaitingPayment } from "@/components/booking/awaiting-payment";
import { BookingStatusHero } from "@/components/booking/booking-status-hero";
import { signGuestAccess } from "@/lib/bookings/guest-access";

function booking(reference: string, extra: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    reference,
    group_id: null,
    status: "confirmed",
    payment_status: "paid",
    payment_preference: "pay_now",
    cancellation_reason: null,
    check_in: "2027-01-10",
    check_out: "2027-01-12",
    nights: 2,
    adults: 2,
    children: 0,
    subtotal: 500,
    tax_amount: 0,
    total_amount: 500,
    currency: "GHS",
    rooms_count: 1,
    guests: { full_name: "Ama Mensah", email: "ama@example.com" },
    room_types: { name: "Deluxe", images: [] },
    ...extra,
  };
}

async function render(query: Record<string, string>) {
  return (await ConfirmationPage({
    params: Promise.resolve({ slug: "test-hotel" }),
    searchParams: Promise.resolve(query),
  })) as ReactElement;
}

/** Every element in a rendered (not mounted) tree, depth first. */
function elements(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, out);
    return out;
  }
  if (node && typeof node === "object" && "props" in node) {
    const element = node as ReactElement<{ children?: unknown }>;
    out.push(element);
    elements(element.props.children, out);
  }
  return out;
}

function propsOf<P>(tree: ReactElement, type: unknown): P[] {
  return elements(tree)
    .filter((e) => e.type === type)
    .map((e) => e.props as P);
}

function hrefs(tree: ReactElement): string[] {
  return elements(tree)
    .map((e) => (e.props as { href?: unknown }).href)
    .filter((h): h is string => typeof h === "string");
}

beforeEach(() => {
  vi.stubEnv("BOOKING_LINK_SECRET", "p".repeat(40));
  rateLimitOk = true;
  bookingRow = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("confirmation page guest access", () => {
  it("is not found for a current-format reference without a token", async () => {
    bookingRow = booking("K7MX4Q");
    await expect(render({ bref: "K7MX4Q" })).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("is not found for a current-format reference with a wrong token", async () => {
    bookingRow = booking("K7MX4Q");
    await expect(render({ bref: "K7MX4Q", t: "A".repeat(22) })).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("shows the full email and a signed calendar link with a valid token", async () => {
    bookingRow = booking("K7MX4Q");
    const t = signGuestAccess(HOTEL_ID, BOOKING_ID)!;
    const tree = await render({ bref: "K7MX4Q", t });
    const heroes = propsOf<{ subtitle?: string }>(tree, BookingStatusHero);
    expect(heroes.some((h) => h.subtitle === "Confirmation sent to ama@example.com")).toBe(true);
    expect(hrefs(tree)).toContain(`/api/booking/test-hotel/calendar?reference=K7MX4Q&t=${t}`);
  });

  it("passes the verified token to the payment flow", async () => {
    bookingRow = booking("K7MX4Q", { status: "pending", payment_status: "unpaid" });
    const t = signGuestAccess(HOTEL_ID, BOOKING_ID)!;
    const tree = await render({ bref: "K7MX4Q", t });
    const awaiting = propsOf<{ accessToken: string | null }>(tree, AwaitingPayment);
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].accessToken).toBe(t);
  });

  it("opens a legacy reference without a token, with the email masked", async () => {
    bookingRow = booking("8803962598706");
    const tree = await render({ bref: "8803962598706" });
    const heroes = propsOf<{ subtitle?: string }>(tree, BookingStatusHero);
    expect(heroes.some((h) => h.subtitle === "Confirmation sent to a***@example.com")).toBe(true);
    expect(JSON.stringify(heroes)).not.toContain("ama@example.com");
    expect(hrefs(tree)).toContain("/api/booking/test-hotel/calendar?reference=8803962598706");
  });

  it("does not forward an invalid token on a legacy booking", async () => {
    bookingRow = booking("8803962598706", { status: "pending", payment_status: "unpaid" });
    const tree = await render({ bref: "8803962598706", t: "A".repeat(22) });
    const awaiting = propsOf<{ accessToken: string | null }>(tree, AwaitingPayment);
    expect(awaiting[0].accessToken).toBeNull();
  });

  it("shows a throttle notice and skips the lookup when rate limited", async () => {
    rateLimitOk = false;
    bookingRow = booking("K7MX4Q");
    const tree = await render({ bref: "K7MX4Q" });
    expect((tree.type as { name?: string }).name).toBe("ThrottledNotice");
  });
});
