import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type * as SentryModule from "@/lib/observability/sentry";

const captureIssue = vi.fn();
vi.mock("@/lib/observability/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof SentryModule>();
  return { ...actual, captureIssue: (...args: unknown[]) => captureIssue(...args) };
});

import {
  firstNameOnly,
  guestAccessSubject,
  isLegacyReference,
  maskEmail,
  resetGuestAccessReportingForTests,
  resolveGuestAccess,
  signGuestAccess,
  verifyGuestAccess,
} from "@/lib/bookings/guest-access";
import {
  GUEST_ACCESS_TOKEN_PATTERN,
  calendarPath,
  confirmationPath,
  redactGuestAccessToken,
  redactGuestAccessTokenDeep,
} from "@/lib/bookings/guest-access-link";
import {
  redactGuestAccessFromBreadcrumb,
  redactGuestAccessFromEvent,
} from "@/lib/observability/sentry";

const SECRET = "s".repeat(32);
const OTHER_SECRET = "o".repeat(40);
const HOTEL = "11111111-1111-4111-8111-111111111111";
const OTHER_HOTEL = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const OTHER_BOOKING = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  captureIssue.mockReset();
  resetGuestAccessReportingForTests();
  vi.stubEnv("BOOKING_LINK_SECRET", SECRET);
  vi.stubEnv("BOOKING_LINK_SECRET_PREVIOUS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("signGuestAccess / verifyGuestAccess", () => {
  it("produces a 22-character base64url token (128-bit HMAC-SHA256 prefix)", () => {
    const token = signGuestAccess(HOTEL, BOOKING)!;
    expect(token).toMatch(GUEST_ACCESS_TOKEN_PATTERN);
    const expected = createHmac("sha256", SECRET)
      .update(`roomline.guest-booking-access.v1\u0000${HOTEL}\u0000${BOOKING}`)
      .digest()
      .subarray(0, 16)
      .toString("base64url");
    expect(token).toBe(expected);
  });

  it("is deterministic, so any link for a booking can be rebuilt", () => {
    expect(signGuestAccess(HOTEL, BOOKING)).toBe(signGuestAccess(HOTEL, BOOKING));
  });

  it("verifies only for the same hotel and booking", () => {
    const token = signGuestAccess(HOTEL, BOOKING);
    expect(verifyGuestAccess(HOTEL, BOOKING, token)).toBe(true);
    expect(verifyGuestAccess(OTHER_HOTEL, BOOKING, token)).toBe(false);
    expect(verifyGuestAccess(HOTEL, OTHER_BOOKING, token)).toBe(false);
  });

  it("rejects tokens signed with another secret", () => {
    const token = signGuestAccess(HOTEL, BOOKING);
    vi.stubEnv("BOOKING_LINK_SECRET", OTHER_SECRET);
    expect(verifyGuestAccess(HOTEL, BOOKING, token)).toBe(false);
  });

  it("accepts the previous secret during a rotation, and signs with the new one", () => {
    const oldToken = signGuestAccess(HOTEL, BOOKING);
    vi.stubEnv("BOOKING_LINK_SECRET", OTHER_SECRET);
    vi.stubEnv("BOOKING_LINK_SECRET_PREVIOUS", SECRET);
    expect(verifyGuestAccess(HOTEL, BOOKING, oldToken)).toBe(true);
    const newToken = signGuestAccess(HOTEL, BOOKING);
    expect(newToken).not.toBe(oldToken);
    expect(verifyGuestAccess(HOTEL, BOOKING, newToken)).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["a number", 12345],
    ["too short", "abc"],
    ["too long", "A".repeat(23)],
    ["bad characters", "A".repeat(21) + "="],
    ["an array", ["A".repeat(22)]],
  ])("rejects a token that is %s", (_label, token) => {
    expect(verifyGuestAccess(HOTEL, BOOKING, token)).toBe(false);
  });

  it("rejects a token that differs in one character", () => {
    const token = signGuestAccess(HOTEL, BOOKING)!;
    const flipped = (token[0] === "A" ? "B" : "A") + token.slice(1);
    expect(verifyGuestAccess(HOTEL, BOOKING, flipped)).toBe(false);
  });

  it.each([
    ["unset", undefined],
    ["blank", "   "],
    ["shorter than 32 characters", "x".repeat(31)],
  ])("fails closed when the secret is %s, and reports it once", (_label, value) => {
    if (value === undefined) vi.stubEnv("BOOKING_LINK_SECRET", undefined as unknown as string);
    else vi.stubEnv("BOOKING_LINK_SECRET", value);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(signGuestAccess(HOTEL, BOOKING)).toBeNull();
    expect(verifyGuestAccess(HOTEL, BOOKING, "A".repeat(22))).toBe(false);
    signGuestAccess(HOTEL, BOOKING);
    expect(captureIssue).toHaveBeenCalledTimes(1);
    expect(captureIssue.mock.calls[0][1]).toMatchObject({ level: "fatal" });
  });

  it("does not let a previous secret alone verify anything", () => {
    const token = signGuestAccess(HOTEL, BOOKING);
    vi.stubEnv("BOOKING_LINK_SECRET", "");
    vi.stubEnv("BOOKING_LINK_SECRET_PREVIOUS", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(verifyGuestAccess(HOTEL, BOOKING, token)).toBe(false);
  });
});

describe("resolveGuestAccess", () => {
  const current = { id: BOOKING, group_id: null, reference: "K7MX4Q" };

  it("gives full access with a valid token", () => {
    expect(resolveGuestAccess(HOTEL, current, signGuestAccess(HOTEL, BOOKING))).toBe("full");
  });

  it("denies a current-format reference without a valid token", () => {
    expect(resolveGuestAccess(HOTEL, current, null)).toBe("denied");
    expect(resolveGuestAccess(HOTEL, current, signGuestAccess(OTHER_HOTEL, BOOKING))).toBe(
      "denied"
    );
  });

  it.each(["8803962598706", "HOP-2026-00001", "RL-8H2K91", "K7MX4"])(
    "gives limited access to legacy reference %s without a token",
    (reference) => {
      expect(resolveGuestAccess(HOTEL, { ...current, reference }, null)).toBe("limited");
    }
  );

  it("gives full access to a legacy reference with a valid token", () => {
    const legacy = { ...current, reference: "8803962598706" };
    expect(resolveGuestAccess(HOTEL, legacy, signGuestAccess(HOTEL, BOOKING))).toBe("full");
  });

  it("binds a reservation's rooms to the anchor, so one token covers the group", () => {
    const anchorId = BOOKING;
    const token = signGuestAccess(HOTEL, anchorId);
    const anchor = { id: anchorId, group_id: anchorId, reference: "K7MX4Q" };
    const sibling = { id: OTHER_BOOKING, group_id: anchorId, reference: "B2C3D4" };
    expect(guestAccessSubject(sibling)).toBe(anchorId);
    expect(resolveGuestAccess(HOTEL, anchor, token)).toBe("full");
    expect(resolveGuestAccess(HOTEL, sibling, token)).toBe("full");
    expect(resolveGuestAccess(HOTEL, sibling, signGuestAccess(HOTEL, OTHER_BOOKING))).toBe(
      "denied"
    );
  });
});

describe("isLegacyReference", () => {
  it("treats only 6-character codes from the current alphabet as current", () => {
    expect(isLegacyReference("K7MX4Q")).toBe(false);
    expect(isLegacyReference("23456Z")).toBe(false);
    for (const ref of ["K7MX4O", "K7MX4A", "k7mx4q", "K7MX4Q1", "8803962598706", ""]) {
      expect(isLegacyReference(ref)).toBe(true);
    }
  });
});

describe("maskEmail / firstNameOnly", () => {
  it("masks the local part", () => {
    expect(maskEmail("chris@example.com")).toBe("c***@example.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });

  it("masks malformed addresses completely and passes empty values through", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
    expect(maskEmail("chris@")).toBe("***");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("")).toBeNull();
  });

  it("keeps the first word of a name", () => {
    expect(firstNameOnly("  Ama  Mensah ")).toBe("Ama");
    expect(firstNameOnly("")).toBeNull();
    expect(firstNameOnly(null)).toBeNull();
  });
});

describe("guest link paths", () => {
  it("builds the confirmation path with the token and payment reference", () => {
    expect(
      confirmationPath("my-hotel", "K7MX4Q", {
        accessToken: "abc_DEF-123",
        paymentReference: "K7MX4Q-1794644482272-3fa9c01b2e7d",
      })
    ).toBe(
      "/my-hotel/confirmation?bref=K7MX4Q&t=abc_DEF-123&trxref=K7MX4Q-1794644482272-3fa9c01b2e7d"
    );
  });

  it("omits absent values", () => {
    expect(confirmationPath("my-hotel", "K7MX4Q")).toBe("/my-hotel/confirmation?bref=K7MX4Q");
    expect(confirmationPath("my-hotel", "K7MX4Q", { accessToken: null })).toBe(
      "/my-hotel/confirmation?bref=K7MX4Q"
    );
  });

  it("builds the calendar path", () => {
    expect(calendarPath("my-hotel", "K7MX4Q", "tok")).toBe(
      "/api/booking/my-hotel/calendar?reference=K7MX4Q&t=tok"
    );
    expect(calendarPath("my-hotel", "K7MX4Q", null)).toBe(
      "/api/booking/my-hotel/calendar?reference=K7MX4Q"
    );
  });
});

describe("token redaction", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUv";

  it("removes the token from URLs and leaves other parameters", () => {
    expect(redactGuestAccessToken(`/h/confirmation?bref=K7MX4Q&t=${token}&trxref=x`)).toBe(
      "/h/confirmation?bref=K7MX4Q&t=[redacted]&trxref=x"
    );
    expect(redactGuestAccessToken(`https://x.test/a?t=${token}#frag`)).toBe(
      "https://x.test/a?t=[redacted]#frag"
    );
    expect(redactGuestAccessToken("/a?start=2026-01-01&at=1&tt=2")).toBe(
      "/a?start=2026-01-01&at=1&tt=2"
    );
  });

  it("keeps serialised JSON valid", () => {
    const json = JSON.stringify({ href: `/h/confirmation?bref=K&t=${token}`, nested: { a: 1 } });
    const parsed = JSON.parse(redactGuestAccessToken(json));
    expect(parsed.href).toBe("/h/confirmation?bref=K&t=[redacted]");
  });

  it("walks nested values", () => {
    const value = { a: [`?t=${token}`, { b: `&t=${token}` }], n: 1 };
    expect(redactGuestAccessTokenDeep(value)).toEqual({
      a: ["?t=[redacted]", { b: "&t=[redacted]" }],
      n: 1,
    });
  });

  it("scrubs Sentry events and breadcrumbs", () => {
    const event = redactGuestAccessFromEvent({
      message: `failed /h/confirmation?bref=K&t=${token}`,
      request: {
        url: `https://x.test/h/confirmation?bref=K&t=${token}`,
        query_string: `bref=K&t=${token}`,
        headers: { referer: `https://x.test/h/confirmation?bref=K&t=${token}` },
      },
      breadcrumbs: [{ category: "navigation", data: { from: "/", to: `/h/c?t=${token}` } }],
      exception: { values: [{ type: "Error", value: `GET /api?t=${token}` }] },
    });
    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain(token);
    expect(event.request?.query_string).toBe("bref=K&t=[redacted]");

    const tupleEvent = redactGuestAccessFromEvent({
      request: { query_string: [["bref", "K"], ["t", token]] },
    });
    expect(tupleEvent.request?.query_string).toEqual([["bref", "K"], ["t", "[redacted]"]]);

    const objectEvent = redactGuestAccessFromEvent({
      request: { query_string: { bref: "K", t: token } },
    });
    expect(objectEvent.request?.query_string).toEqual({ bref: "K", t: "[redacted]" });

    const crumb = redactGuestAccessFromBreadcrumb({
      category: "fetch",
      data: { url: `/api/booking/h/calendar?reference=K&t=${token}` },
    });
    expect(JSON.stringify(crumb)).not.toContain(token);
  });
});
