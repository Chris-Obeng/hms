import { describe, expect, it } from "vitest";
import { formatRoomLines } from "@/lib/bookings/group-room-lines";
import { occupancyText } from "@/lib/bookings/cart";

/**
 * The guest's confirmation email must name every room of a multi-room
 * reservation with its own occupancy — Mews' Booking Engine returns the same
 * shape (`Reservations[]` each with its own AdultCount/ChildCount inside one
 * reservation group), and OTA mails list each room.
 */
describe("formatRoomLines", () => {
  it("names each room with its own occupancy", () => {
    expect(
      formatRoomLines([
        { adults: 2, children: 0, room_types: { name: "Premium Room" } },
        { adults: 1, children: 1, room_types: { name: "Deluxe Room" } },
      ])
    ).toEqual([
      { name: "Premium Room", occupancy: "2 adults" },
      { name: "Deluxe Room", occupancy: "1 adult, 1 child" },
    ]);
  });

  it("falls back to a generic room name and at least one adult", () => {
    expect(formatRoomLines([{ adults: null, children: null, room_types: null }])).toEqual([
      { name: "Room", occupancy: "1 adult" },
    ]);
  });

  it("shares one occupancy phrasing with the booking cart", () => {
    expect(occupancyText(1, 0)).toBe("1 adult");
    expect(occupancyText(2, 0)).toBe("2 adults");
    expect(occupancyText(1, 1)).toBe("1 adult, 1 child");
    expect(occupancyText(2, 3)).toBe("2 adults, 3 children");
  });
});
