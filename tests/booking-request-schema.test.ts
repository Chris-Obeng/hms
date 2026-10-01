import { describe, expect, it } from "vitest";

import { GroupSchema, Schema } from "@/app/api/booking/[slug]/bookings/booking-schemas";
import { RESERVATION_ROOM_CAP } from "@/lib/bookings/expand-cart-lines";

/**
 * The group body's line ceiling is the reservation ceiling: the funnel posts one
 * line per room, so a cart the wizard can build (up to 10 rooms) must not be
 * refused by the request schema. Before this contract existed, `lines` was capped
 * at 4 and a five-room cart died with a raw Zod string.
 */
const roomTypeId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const line = (index: number) => ({
  room_type_id: roomTypeId(index),
  check_in: "2026-10-05",
  check_out: "2026-10-07",
  adults: 2,
  children: 0,
  rooms_count: 1,
});

const group = (rooms: number) => ({
  lines: Array.from({ length: rooms }, (_, i) => line(i)),
  guest_name: "Ama Mensah",
  guest_email: "ama@example.com",
  guest_phone: "+233244000000",
  payment_preference: "pay_at_checkin",
});

describe("GroupSchema line ceiling", () => {
  it("accepts the five-room same-type cart the wizard can build", () => {
    expect(GroupSchema.safeParse(group(5)).success).toBe(true);
  });

  it("accepts a cart exactly at the reservation cap", () => {
    expect(GroupSchema.safeParse(group(RESERVATION_ROOM_CAP)).success).toBe(true);
  });

  it("rejects one room over the cap with guest copy, not a Zod string", () => {
    const parsed = GroupSchema.safeParse(group(RESERVATION_ROOM_CAP + 1));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("Split this booking into two?");
    }
  });

  it("still requires two lines for a group body", () => {
    expect(GroupSchema.safeParse(group(1)).success).toBe(false);
  });
});

describe("single-room Schema", () => {
  it("keeps accepting a legacy multi-unit body for the route to fan out", () => {
    const parsed = Schema.safeParse({
      room_type_id: roomTypeId(1),
      check_in: "2026-10-05",
      check_out: "2026-10-07",
      rooms_count: 3,
      guest_name: "Ama Mensah",
      guest_email: "ama@example.com",
      guest_phone: "+233244000000",
      payment_preference: "pay_now",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.rooms_count).toBe(3);
  });
});
