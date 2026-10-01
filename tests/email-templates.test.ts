import { describe, expect, it } from "vitest";
import { buildCancellationEmail, buildConfirmationEmail } from "@/lib/notifications/email-templates";
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
