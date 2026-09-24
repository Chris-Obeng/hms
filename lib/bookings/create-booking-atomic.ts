/**
 * lib/bookings/create-booking-atomic.ts
 *
 * The two seams through which a reservation is written and later re-priced.
 *
 * Before this existed, both the guest-facing route and the staff action ran the
 * same five-step sequence by hand — resolve the guest, generate a reference,
 * price the stay, insert the booking, insert the nights — with a network hop
 * between every step. Each gap was a window in which a crash or a rejection
 * could leave a half-built reservation behind: an orphan guest row, a booking
 * with no nights, a quote that no longer matched the stored rate.
 *
 * `create_booking_atomic` does all of it inside one transaction, so the whole
 * reservation either exists or does not, and the quote and the persisted
 * nightly rates are the same numbers by construction.
 *
 * `reprice_booking_stay` is the same idea one step later in a stay's life. A
 * drag-move or a room-type change on the calendar used to rewrite the dates and
 * stop there, leaving `booking_nights` rows describing dates the stay no longer
 * occupied and a total priced for a window that no longer existed. It
 * re-resolves the nights, recomputes the money with the same formula and
 * replaces both together, or rejects and leaves every one of them as it was.
 *
 * Failure model. These functions raise rather than returning an error object, so
 * Postgres rolls the transaction back for us:
 * - Policy rejections use SQLSTATE P0001 and carry a stable machine code in
 *   DETAIL (`no_availability`, `unpriced_stay`, …). Guest-facing copy is the
 *   caller's business; this module only classifies.
 * - Integrity rejections keep their native SQLSTATE. `23P01` — from the
 *   `bookings_room_type_inventory_guard` trigger, or from either room-overlap
 *   EXCLUDE constraint — is a lost race for a room and is surfaced as
 *   `inventory_conflict`.
 * - `23514` is shared: the `bookings_restrictions_guard` trigger raises it for a
 *   stay that breaks the rate plan's length-of-stay or open/closed controls, and
 *   so does every ordinary CHECK on the table. Only DETAIL tells the two apart,
 *   so that is what is read; a real CHECK violation carries no machine code
 *   there and falls through to `unknown`.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

/** Keys `create_booking_atomic` reads. Anything omitted takes its SQL default. */
export type CreateBookingPayload = {
  hotel_id: string;
  room_type_id: string;
  /** First night, inclusive. */
  check_in: string;
  /** Departure day, exclusive — not a stay night. */
  check_out: string;
  adults?: number;
  children?: number;
  rooms_count?: number;
  rate_plan_id?: string | null;
  occupancy?: number;
  status?: string;
  payment_status?: string;
  payment_preference?: string;
  source?: string;
  /** Pick the lowest-numbered free room of the type. Never fatal if none is. */
  assign_room?: boolean;
  room_id?: string | null;
  /** Skips the email/phone lookup and uses this guest directly. */
  guest_id?: string | null;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  nationality?: string | null;
  special_requests?: string | null;
  internal_notes?: string | null;
  /** Free text; anything Postgres cannot read as a time is rejected by name. */
  estimated_arrival?: string | null;
  created_by?: string | null;
};

/** One row of `booking_nights` as the function resolved and stored it. */
export type ResolvedNight = {
  stay_date: string;
  rate_minor: number;
  currency: string;
  rate_plan_id: string | null;
  occupancy: number;
  source: string;
  seasonal_rate_id: string | null;
  season_name: string | null;
};

export type CreateBookingResult = {
  booking_id: string;
  /** Bare 13-digit OTA-style number generated in the database. */
  reference: string;
  guest_id: string;
  guest_created: boolean;
  room_id: string | null;
  currency: string;
  night_count: number;
  room_rate: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  /** Minor units, safe to hand to a payment processor without re-rounding. */
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  nights: ResolvedNight[];
};

/**
 * Machine codes the SQL raises in DETAIL. Kept in one place so a caller that
 * switches on them cannot invent a code the function never emits.
 */
const REJECTION_CODES = [
  "invalid_payload",
  "invalid_payload: keep_rates",
  "invalid_date_range",
  "invalid_rooms_count",
  "invalid_guest_name",
  "invalid_estimated_arrival",
  "hotel_not_found",
  "room_type_not_found",
  "guest_not_found",
  "booking_not_found",
  "booking_not_open",
  "no_availability",
  "unpriced_stay",
  "rate_plan_not_found",
  "room_not_bookable",
  "room_conflict",
  "booking_paid",
  "stay_restrictions",
] as const;

export type BookingRejectionCode =
  | (typeof REJECTION_CODES)[number]
  /** 23P01 from the inventory guard — two guests raced for the last room. */
  | "inventory_conflict"
  /** Anything else: a broken migration, a missing grant, a bug. */
  | "unknown";

export type BookingRejection = {
  code: BookingRejectionCode;
  /** Postgres SQLSTATE, so callers can tell policy from integrity. */
  sqlstate: string;
  /** The function's own sentence. Written for staff, not for guests. */
  message: string;
  /**
   * Extra detail where the code carries one: the number of free rooms for
   * `no_availability`, the occupying guest's name for `room_conflict`.
   */
  hint: string | null;
};

type RpcError = {
  message: string;
  details: string | null;
  hint: string | null;
  code: string;
};

function classify(error: RpcError): BookingRejection {
  const detail = (error.details ?? "").trim();
  const known = (REJECTION_CODES as readonly string[]).includes(detail);
  return {
    code:
      error.code === "23P01"
        ? "inventory_conflict"
        : (error.code === "P0001" || error.code === "23514") && known
          ? (detail as BookingRejectionCode)
          : "unknown",
    sqlstate: error.code,
    message: error.message,
    hint: error.hint,
  };
}

/**
 * `types/database.types.ts` is generated against the remote project, which has
 * not been migrated yet, so its Functions map knows none of these functions.
 * The three casts below are the whole cost of that gap: delete them and call
 * `supabaseAdmin.rpc(...)` directly once db:types has been regenerated from a
 * project carrying migrations 20260901120000 and 20260902120000.
 */
export async function createBookingAtomic(
  payload: CreateBookingPayload
): Promise<
  { ok: true; booking: CreateBookingResult } | { ok: false; rejection: BookingRejection }
> {
  // Bound explicitly: `supabaseAdmin.rpc` uses `this.rest` internally, so a
  // detached reference crashes with `undefined.rest` at call time.
  const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
    fn: "create_booking_atomic",
    params: { p_payload: CreateBookingPayload }
  ) => Promise<{ data: CreateBookingResult | null; error: RpcError | null }>;

  const { data, error } = await rpc("create_booking_atomic", { p_payload: payload });

  if (error) return { ok: false, rejection: classify(error) };
  if (!data) {
    // A SECURITY DEFINER function that reached its RETURN cannot produce this;
    // it means the RPC shape changed under us.
    return {
      ok: false,
      rejection: {
        code: "unknown",
        sqlstate: "",
        message: "create_booking_atomic returned no row",
        hint: null,
      },
    };
  }
  return { ok: true, booking: data };
}

/**
 * Removes an unpaid reservation and everything created with it — nights by
 * cascade, the guest row only if this booking was its reason to exist — and
 * writes a `booking.aborted_unpaid` audit row. Idempotent: aborting a booking
 * that is already gone succeeds. Refuses with `booking_paid` if money has
 * landed, so a failed payment init can never delete a paid stay.
 */
export async function abortUnpaidBooking(
  bookingId: string,
  reason: string
): Promise<{ ok: true } | { ok: false; rejection: BookingRejection }> {
  // Bound explicitly: `supabaseAdmin.rpc` uses `this.rest` internally, so a
  // detached reference crashes with `undefined.rest` at call time.
  const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
    fn: "abort_unpaid_booking",
    params: { p_booking_id: string; p_reason: string }
  ) => Promise<{ data: null; error: RpcError | null }>;

  const { error } = await rpc("abort_unpaid_booking", {
    p_booking_id: bookingId,
    p_reason: reason,
  });

  return error ? { ok: false, rejection: classify(error) } : { ok: true };
}

/**
 * Keys `reprice_booking_stay` reads. Every field but the two ids is optional in
 * a stronger sense than usual: the SQL branches on each key's *presence*, not
 * its value, so an absent key means "leave this as it is" while an explicit
 * `room_id: null` means "unassign the room". `JSON.stringify` omits `undefined`
 * properties, which is exactly that mapping — pass `undefined` to leave a field
 * alone, `null` only when clearing it is the instruction.
 */
export type RepriceBookingPayload = {
  booking_id: string;
  hotel_id: string;
  /** First night, inclusive. */
  check_in?: string;
  /** Departure day, exclusive — not a stay night. */
  check_out?: string;
  room_type_id?: string;
  room_id?: string | null;
  rooms_count?: number;
  rate_plan_id?: string | null;
  occupancy?: number;
  /**
   * The one value-read key: `true` freezes the booked price through the move —
   * every night inside the new window carries across at its current rate as a
   * hand-priced row on the stay's (re-anchored) plan. Absent and false are the
   * same default: reprice.
   */
  keep_rates?: boolean;
};

/**
 * The stay's window and money either side of the write. The function writes no
 * audit row of its own — resolving a Clerk user to a staff profile is beyond a
 * SECURITY DEFINER function — so it hands the caller both halves to fold into
 * the audit row the caller was already writing.
 */
export type BookingStaySnapshot = {
  check_in: string;
  check_out: string;
  room_id: string | null;
  room_type_id: string;
  rooms_count: number;
  nights: number;
  currency: string;
  room_rate: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  payment_status: string;
};

export type RepriceBookingResult = {
  booking_id: string;
  night_count: number;
  /**
   * Nights that kept their booked price: hand-priced nights (`source =
   * 'manual'`) that still fell inside the new window, plus — under
   * `keep_rates` — every in-window night, which becomes hand-priced.
   */
  nights_kept: number;
  /**
   * True when the room type moved, which re-resolves every night. The room is
   * not dropped implicitly: the payload must name a target-type room or
   * `room_id: null`, or the call rejects `room_not_bookable`.
   */
  type_changed: boolean;
  currency: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  nights: ResolvedNight[];
  before: BookingStaySnapshot;
  after: BookingStaySnapshot;
};

/**
 * Re-dates, re-types or re-sizes a booked stay and rewrites its nightly rates,
 * its totals and its `booking_nights` in the transaction that moves the booking
 * row, so the stored nights can never describe a window the stay no longer
 * occupies. `payment_status` follows the new total for a stay that has been paid
 * against; `unpaid` and `refunded` are left alone.
 *
 * A rejection leaves the reservation exactly as it was, down to `updated_at`, so
 * a caller can surface `rejection.code` and stop without a compensating write.
 */
export async function repriceBookingStay(
  payload: RepriceBookingPayload
): Promise<
  { ok: true; stay: RepriceBookingResult } | { ok: false; rejection: BookingRejection }
> {
  // Bound explicitly: `supabaseAdmin.rpc` uses `this.rest` internally, so a
  // detached reference crashes with `undefined.rest` at call time.
  const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
    fn: "reprice_booking_stay",
    params: { p_payload: RepriceBookingPayload }
  ) => Promise<{ data: RepriceBookingResult | null; error: RpcError | null }>;

  const { data, error } = await rpc("reprice_booking_stay", { p_payload: payload });

  if (error) return { ok: false, rejection: classify(error) };
  if (!data) {
    return {
      ok: false,
      rejection: {
        code: "unknown",
        sqlstate: "",
        message: "reprice_booking_stay returned no row",
        hint: null,
      },
    };
  }
  return { ok: true, stay: data };
}
