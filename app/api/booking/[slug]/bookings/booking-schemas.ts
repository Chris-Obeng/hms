/**
 * app/api/booking/[slug]/bookings/booking-schemas.ts
 *
 * Request shapes for guest booking creation. They live outside the route module
 * so the contract can be unit-tested (tests/booking-request-schema.test.ts)
 * without booting Next, Clerk, Supabase or the rate limiter.
 *
 * A body with no `lines[]` is a single-room booking; `lines[]` is a multi-room
 * cart. One line is one physical room — the funnel posts `rooms_count: 1` per
 * room — so the array ceiling is the reservation ceiling, the same constant the
 * route's expansion guard and the cart use.
 */

import { z } from "zod";

import { RESERVATION_ROOM_CAP } from "@/lib/bookings/expand-cart-lines";
import { guestEmail, isoDateParam } from "@/lib/validation/params";

/**
 * Single-room body. `rooms_count > 1` is accepted for legacy clients and fanned
 * into a reservation group by the route, so it can never write one row holding
 * N units.
 */
export const Schema = z.object({
  room_type_id: z.string().uuid(),
  check_in: isoDateParam,
  check_out: isoDateParam,
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
  rooms_count: z.coerce.number().int().min(1).max(10).default(1),
  guest_name: z.string().min(1).max(120),
  guest_email: guestEmail,
  guest_phone: z.string().min(7).max(20),
  nationality: z.string().max(80).optional(),
  payment_preference: z.enum(["pay_now", "pay_at_checkin"]),
  special_requests: z.string().max(500).optional(),
  estimated_arrival: z.string().max(50).optional(),
});

/**
 * One room line of a multi-room cart. Same per-room fields the single-room Schema
 * accepts (no rate_plan_id — the single path does not wire rate plans either), so
 * a group line prices through the exact same code as a standalone booking.
 */
export const GroupLineSchema = z.object({
  room_type_id: z.string().uuid(),
  check_in: isoDateParam,
  check_out: isoDateParam,
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
  rooms_count: z.coerce.number().int().min(1).max(10).default(1),
  special_requests: z.string().max(500).optional(),
});

/**
 * Multi-room cart: one primary guest, one payment, two to `RESERVATION_ROOM_CAP`
 * room lines. Over the ceiling the guest reads the same sentence the route's
 * expansion guard uses, never a raw Zod string.
 */
export const GroupSchema = z.object({
  lines: z
    .array(GroupLineSchema)
    .min(2)
    .max(
      RESERVATION_ROOM_CAP,
      `A reservation can hold up to ${RESERVATION_ROOM_CAP} rooms. Split this booking into two?`
    ),
  guest_name: z.string().min(1).max(120),
  guest_email: guestEmail,
  guest_phone: z.string().min(7).max(20),
  nationality: z.string().max(80).optional(),
  payment_preference: z.enum(["pay_now", "pay_at_checkin"]),
  special_requests: z.string().max(500).optional(),
  estimated_arrival: z.string().max(50).optional(),
});
