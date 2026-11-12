import { describe, expect, it } from "vitest";
import {
  buildCancellationEmail,
  buildConfirmationEmail,
  escapeHtml,
} from "@/lib/notifications/email-templates";
import {
  parseResendFromAddress,
  redactEmailForLog,
} from "@/lib/notifications/resend";
import type { BookingNotifyData } from "@/lib/notifications/types";

const booking: BookingNotifyData = {
  guestName: "Ama Mensah",
  guestEmail: "ama@example.com",
  reference: "BK-1234",
  roomName: "Deluxe Suite",
  checkIn: "2026-03-02",
  checkOut: "2026-03-05",
  nights: 3,
  totalAmount: 1234567,
};

describe("buildConfirmationEmail", () => {
  it("includes the core booking details", () => {
    const html = buildConfirmationEmail("Sunset Inn", booking, "GHS");
    expect(html).toContain("Sunset Inn");
    expect(html).toContain("BK-1234");
    expect(html).toContain("Deluxe Suite");
    expect(html).toContain("2026-03-02");
    expect(html).toContain("2026-03-05");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("greets the guest by first name", () => {
    expect(buildConfirmationEmail("Sunset Inn", booking, "GHS")).toContain("Hi Ama,");
    expect(
      buildConfirmationEmail("Sunset Inn", { ...booking, guestName: "Ama" }, "GHS")
    ).toContain("Hi Ama,");
  });

  it("formats the total with the currency and thousands separators", () => {
    expect(buildConfirmationEmail("Sunset Inn", booking, "GHS")).toContain(
      `GHS ${(1234567).toLocaleString()}`
    );
  });

  it("omits optional rows when the data is absent", () => {
    const html = buildConfirmationEmail("Sunset Inn", booking, "GHS");
    expect(html).not.toContain("Address");
    expect(html).not.toContain("Questions? Call us");
    expect(html).not.toMatch(/>from /);
    expect(html).not.toMatch(/>by /);
  });

  it("lists every room of a multi-room reservation with its occupancy", () => {
    const html = buildConfirmationEmail(
      "Sunset Inn",
      {
        ...booking,
        roomName: "2 rooms",
        rooms: [
          { name: "Premium Room", occupancy: "2 adults" },
          { name: "Deluxe Room", occupancy: "1 adult, 1 child" },
        ],
      },
      "GHS"
    );
    expect(html).toContain("Room 1");
    expect(html).toContain("Room 2");
    expect(html).toContain("Premium Room");
    expect(html).toContain("2 adults");
    expect(html).toContain("Deluxe Room");
    expect(html).toContain("1 adult, 1 child");
    // The generic summary label must not stand in for the rooms themselves.
    expect(html).not.toContain(">2 rooms<");
  });

  it("keeps the single Room row when no room lines are supplied", () => {
    const html = buildConfirmationEmail("Sunset Inn", booking, "GHS");
    expect(html).toContain("Deluxe Suite");
    expect(html).not.toContain("Room 1");
  });

  it("renders optional address, phone and times when supplied", () => {
    const html = buildConfirmationEmail(
      "Sunset Inn",
      {
        ...booking,
        hotelAddress: "12 Beach Rd",
        hotelPhone: "+233200000000",
        checkInTime: "14:00",
        checkOutTime: "11:00",
      },
      "GHS"
    );
    expect(html).toContain("12 Beach Rd");
    expect(html).toContain('href="tel:+233200000000"');
    expect(html).toContain("from 14:00");
    expect(html).toContain("by 11:00");
  });
});

describe("buildCancellationEmail", () => {
  it("includes the hotel, guest first name and reference", () => {
    const html = buildCancellationEmail("Sunset Inn", "Ama Mensah", "BK-1234");
    expect(html).toContain("Hi Ama,");
    expect(html).toContain("BK-1234");
    expect(html).toContain("Sunset Inn");
    expect(html).not.toContain("tel:");
  });

  it("links the hotel phone when provided", () => {
    const html = buildCancellationEmail("Sunset Inn", "Ama", "BK-1", "+233200000000");
    expect(html).toContain('href="tel:+233200000000"');
  });
});

describe("HTML entity escaping & Resend sender hygiene (HIGH-02 / HIGH-06)", () => {
  it("escapes &, <, >, quotes and apostrophes in escapeHtml", () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;"
    );
  });

  it("escapes untrusted HTML/phishing links in confirmation & cancellation emails", () => {
    const malicious = buildConfirmationEmail(
      `Grand <img src=x onerror=alert(1)> "Hotel"`,
      {
        ...booking,
        guestName: `<a href="https://evil.example">PayNow</a> Mensah`,
        roomName: `<script>steal()</script>`,
        hotelAddress: `12 <b onclick="x()">Rd</b>`,
        hotelPhone: `+233" onclick="evil()`,
        rooms: [
          {
            name: `Suite <iframe src="https://evil.example">`,
            occupancy: `2 <script>x</script>`,
          },
        ],
      },
      "GHS"
    );

    expect(malicious).not.toContain("<script>");
    expect(malicious).not.toContain('<a href="https://evil.example">');
    expect(malicious).not.toContain("<iframe");
    expect(malicious).toContain("&lt;a");
    expect(malicious).toContain("&lt;iframe");
    expect(malicious).toContain('href="tel:+233"');

    const cancelHtml = buildCancellationEmail(
      `<script>bad()</script>`,
      `<a href="https://phish.example">Click</a>`,
      `BK-"<1>`,
      `+233" onmouseover="alert(1)`
    );
    expect(cancelHtml).not.toContain("<script>");
    expect(cancelHtml).not.toContain('<a href="https://phish.example">');
    expect(cancelHtml).not.toContain('onmouseover="');
    expect(cancelHtml).toContain('href="tel:+2331"');
  });

  it("parses both bare and display-wrapped RESEND_FROM_ADDRESS safely", () => {
    expect(parseResendFromAddress("bookings@roomline.app")).toBe(
      "bookings@roomline.app"
    );
    expect(
      parseResendFromAddress('RoomLine <bookings@roomline.app>\r\nBcc: evil@x.com')
    ).toBe("bookings@roomline.app");
    expect(() => parseResendFromAddress("")).toThrow(/not set/);
    expect(() => parseResendFromAddress("not-an-email")).toThrow(/not a valid email/);
  });

  it("redacts guest PII email addresses for server stdout logs", () => {
    expect(redactEmailForLog("kwame.mensah@example.com")).toBe("kw***@example.com");
    expect(redactEmailForLog("invalid")).toBe("[redacted-email]");
  });
});
