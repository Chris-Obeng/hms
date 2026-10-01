/**
 * lib/bookings/cart.ts
 *
 * The guest cart's arithmetic and API shape.
 *
 * One room = one occupancy: a guest who books two rooms sets adults/children
 * per room, and the booking engine posts one line per room (`rooms_count: 1`).
 * That is the model the industry leaders use — Mews' Booking Engine returns one
 * reservation group whose `Reservations[]` each carry their own AdultCount /
 * ChildCount — and it is what the server writer stores: one bookings row per
 * room sharing a group_id.
 *
 * Pricing is per room as well, because the server prices and ROUNDS TAX PER ROOM
 * (`create_booking_atomic` runs once per room after the cart is expanded). The
 * arithmetic runs in integer minor units and mirrors the SQL exactly —
 * `toMinor` → `percentToBps` → `applyBps` is `round(subtotal_minor * bps / 10000)`.
 * Doing it in floats loses a pesewa at half-cent ties (161.70 at 5% is 8.085),
 * and the guest then sees a total the charge does not match.
 */

import { RESERVATION_ROOM_CAP } from "@/lib/bookings/expand-cart-lines";
import { applyBps, DEFAULT_CURRENCY, fromMinor, percentToBps, sumMinor, toMinor } from "@/lib/money";

/** One physical room on a cart line, with its own occupancy. */
export interface CartRoom {
  /** Stable list key. */
  key: string;
  adults: number;
  children: number;
}

/** Product caps: up to 4 distinct room types, 5 rooms of each, 10 per reservation. */
export const MAX_ROOM_TYPES = 4;
export const MAX_ROOMS_PER_TYPE = 5;
/**
 * Product cap: one reservation never exceeds the group writer's own line
 * ceiling, so the cart can never assemble a body the API would refuse.
 * Sourced from RESERVATION_ROOM_CAP so the two cannot drift apart.
 */
export const MAX_ROOMS_PER_RESERVATION = RESERVATION_ROOM_CAP;

export function makeRoom(key: string, adults: number, children: number): CartRoom {
  return { key, adults: Math.max(1, adults), children: Math.max(0, children) };
}

/**
 * "2 adults" / "1 adult, 1 child" — one room's occupancy. Single source for the
 * booking engine, the reservation panels and the confirmation email, so a guest
 * never reads two different descriptions of the same room.
 */
export function occupancyText(adults: number, children: number): string {
  const a = Math.max(1, adults);
  const c = Math.max(0, children);
  const base = `${a} adult${a === 1 ? "" : "s"}`;
  return c > 0 ? `${base}, ${c} child${c === 1 ? "" : "ren"}` : base;
}

export interface PricedRoom extends CartRoom {
  subtotal: number;
  tax: number;
  total: number;
}

/**
 * Price one room: the resolved per-room subtotal, then tax on it. Both steps run
 * in integer minor units, matching `create_booking_atomic` exactly —
 * `bps = round(pct * 100)`, then `round(subtotal_minor * bps / 10000)`.
 *
 * The float form of this calculation rounds *down* at half-cent ties: 161.70 at
 * 5% is 8.085, `Math.round(8.085 * 100)` is 808, while Postgres stores 809 — the
 * guest would be shown a total one pesewa below the amount charged. `currency`
 * carries the exponent (UGX has none).
 */
export function priceRoom(
  room: CartRoom,
  unitSubtotal: number,
  taxPercentage: number,
  currency: string = DEFAULT_CURRENCY
): PricedRoom {
  const subtotalMinor = toMinor(unitSubtotal, currency);
  const taxMinor = taxPercentage > 0 ? applyBps(subtotalMinor, percentToBps(taxPercentage)) : 0;
  return {
    ...room,
    subtotal: fromMinor(subtotalMinor, currency),
    tax: fromMinor(taxMinor, currency),
    total: fromMinor(subtotalMinor + taxMinor, currency),
  };
}

/** Totals across rooms, summed in minor units so the money never drifts. */
export function sumRooms(
  rooms: PricedRoom[],
  currency: string
): { subtotal: number; tax: number; total: number } {
  const subtotalMinor = sumMinor(rooms.map((r) => toMinor(r.subtotal, currency)));
  const taxMinor = sumMinor(rooms.map((r) => toMinor(r.tax, currency)));
  return {
    subtotal: fromMinor(subtotalMinor, currency),
    tax: fromMinor(taxMinor, currency),
    total: fromMinor(subtotalMinor + taxMinor, currency),
  };
}

/** One room as the booking API takes it: `rooms_count: 1`, its own occupancy. */
export interface CartApiLine {
  room_type_id: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  rooms_count: number;
}

/**
 * The `lines[]` payload for POST /api/booking/[slug]/bookings: one entry per
 * room, in cart order. The server expands `rooms_count > 1` lines into separate
 * rows anyway; sending one line per room keeps occupancy per room intact.
 */
export function buildCartLines(
  lines: { roomTypeId: string; rooms: CartRoom[] }[],
  stay: { checkIn: string; checkOut: string }
): CartApiLine[] {
  return lines.flatMap((line) =>
    line.rooms.map((room) => ({
      room_type_id: line.roomTypeId,
      check_in: stay.checkIn,
      check_out: stay.checkOut,
      adults: room.adults,
      children: room.children,
      rooms_count: 1,
    }))
  );
}

/** Rooms the cart holds, across every line. */
export function countCartRooms(lines: { rooms: CartRoom[] }[]): number {
  return lines.reduce((sum, line) => sum + line.rooms.length, 0);
}

/** How many more rooms may be added overall. */
export function remainingRoomAllowance(lines: { rooms: CartRoom[] }[]): number {
  return Math.max(0, MAX_ROOMS_PER_RESERVATION - countCartRooms(lines));
}
