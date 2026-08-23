import { describe, expect, it } from "vitest";
import { pickBestRoom } from "@/app/dashboard/calendar/_components/timeline/auto-assign";
import type { CalendarBooking, CalendarRoom } from "@/app/dashboard/calendar/actions";

function room(overrides: Partial<CalendarRoom> = {}): CalendarRoom {
  return {
    id: "r",
    roomNumber: "101",
    floor: "1",
    status: "available",
    roomTypeId: "std",
    roomTypeName: "Standard",
    roomTypeSlug: "standard",
    roomTypeSortOrder: 0,
    roomTypeBasePrice: 100,
    ...overrides,
  };
}

function booking(overrides: Partial<CalendarBooking> = {}): CalendarBooking {
  return {
    id: "b",
    reference: "BK-1",
    guestName: null,
    guestPhone: null,
    guestEmail: null,
    roomId: null,
    roomNumber: null,
    roomTypeId: "std",
    roomTypeName: null,
    checkIn: "2026-08-23",
    checkOut: "2026-08-25",
    nights: 2,
    status: "confirmed",
    paymentStatus: null,
    source: null,
    totalAmount: 0,
    adults: null,
    children: null,
    estimatedArrival: null,
    specialRequests: null,
    ...overrides,
  };
}

describe("pickBestRoom", () => {
  it("returns null when the booking has no room type", () => {
    expect(pickBestRoom(booking({ roomTypeId: null }), { rooms: [room()], bookings: [] })).toBeNull();
  });

  it("skips rooms of a different type and out-of-service rooms", () => {
    const rooms = [
      room({ id: "deluxe", roomTypeId: "dlx" }),
      room({ id: "broken", status: "maintenance" }),
      room({ id: "ok" }),
    ];
    expect(pickBestRoom(booking(), { rooms, bookings: [] })?.id).toBe("ok");
  });

  it("skips rooms with an overlapping active booking", () => {
    const rooms = [room({ id: "taken" }), room({ id: "free", roomNumber: "102" })];
    const bookings = [booking({ id: "other", roomId: "taken" })];
    expect(pickBestRoom(booking(), { rooms, bookings })?.id).toBe("free");
  });

  it("prefers clean/available rooms over rooms that are still occupied", () => {
    const rooms = [room({ id: "dirty", roomNumber: "105", status: "occupied" }), room({ id: "clean", roomNumber: "103" })];
    expect(pickBestRoom(booking(), { rooms, bookings: [] })?.id).toBe("clean");
  });

  it("breaks ties by numeric room number", () => {
    const rooms = [room({ id: "nine", roomNumber: "9" }), room({ id: "ten", roomNumber: "10" })];
    expect(pickBestRoom(booking(), { rooms, bookings: [] })?.id).toBe("nine");
  });

  it("ignores cancelled bookings when computing occupancy pressure", () => {
    const rooms = [room({ id: "with-cancelled" })];
    const bookings = [booking({ id: "ghost", roomId: "with-cancelled", status: "cancelled" })];
    expect(pickBestRoom(booking(), { rooms, bookings })?.id).toBe("with-cancelled");
  });
});
