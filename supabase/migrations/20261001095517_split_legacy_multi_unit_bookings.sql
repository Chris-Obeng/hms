-- One row per room: split legacy multi-unit bookings into reservation groups.
--
-- Before create_booking_group_atomic() a multi-room booking was ONE bookings row
-- holding rooms_count > 1: it could only be checked in or out as a block, listed
-- as a single line and virtualised into N strips on the rack. The product now
-- writes one row per room (group_id shared, rooms_count = 1) - the model the
-- industry leaders use (Mews: one reservation per space with its own state,
-- linked by a reservation group; Cloudbeds: postRoomCheckOut() per room and the
-- reservation only flips to "Checked Out" once every room has left).
--
-- This migration brings existing rows onto that model, preserving every total:
--   * the row becomes the anchor (group_id = its own id, rooms_count = 1);
--   * N-1 siblings get a fresh reference, rooms_count = 1, room_id NULL (the
--     legacy row only ever assigned one physical room; inventing a second
--     assignment could collide with another stay);
--   * money splits in integer cents with the rounding remainder kept on the
--     anchor, so SUM over the group is unchanged; payment_status is recomputed;
--   * booking_nights: the anchor's rows drop to 1 unit and each sibling gets a
--     mirrored row per night, so SUM(rooms_count) is unchanged;
--   * payments stay on the anchor - no payment row is invented, so payouts and
--     folios keep their original amounts (the group view aggregates siblings).
--
-- Statement order is load-bearing: the anchor must drop to 1 unit BEFORE the
-- siblings are inserted, because assert_room_type_inventory() excludes the row
-- being written and needs a free unit for each insert.
--
-- GENERATED columns are never written: bookings.nights (= check_out - check_in)
-- and bookings.outstanding_balance (= total_amount - amount_paid) derive
-- themselves from the split amounts.
--
-- Idempotent: only rooms_count > 1 AND group_id IS NULL rows are touched, and
-- each becomes rooms_count = 1, so a re-run is a no-op.

ALTER TABLE public.bookings DISABLE TRIGGER bookings_restrictions_guard;

DO $split$
DECLARE
  v_b         record;
  v_sibling   uuid;
  v_i         int;
  v_n         int;
  v_total_c   bigint;
  v_sub_c     bigint;
  v_tax_c     bigint;
  v_paid_c    bigint;
  v_s_total_c bigint;
  v_s_sub_c   bigint;
  v_s_tax_c   bigint;
  v_s_paid_c  bigint;
  v_split     int := 0;
BEGIN
  FOR v_b IN
    SELECT * FROM public.bookings
     WHERE rooms_count > 1 AND group_id IS NULL
     ORDER BY created_at, id
  LOOP
    v_n := v_b.rooms_count;
    v_total_c := round(coalesce(v_b.total_amount, 0) * 100)::bigint;
    v_sub_c   := round(coalesce(v_b.subtotal, 0) * 100)::bigint;
    v_tax_c   := round(coalesce(v_b.tax_amount, 0) * 100)::bigint;
    v_paid_c  := round(coalesce(v_b.amount_paid, 0) * 100)::bigint;

    -- Per-room share in integer cents; the anchor keeps the remainder.
    v_s_total_c := v_total_c / v_n;
    v_s_sub_c   := v_sub_c / v_n;
    v_s_tax_c   := v_tax_c / v_n;
    v_s_paid_c  := v_paid_c / v_n;

    -- 1. Anchor first: one room, own share of the money, linked as the group's
    --    first row. This also frees the unit each sibling insert needs.
    UPDATE public.bookings
       SET rooms_count = 1,
           group_id = v_b.id,
           subtotal = (v_sub_c - v_s_sub_c * (v_n - 1)) / 100.0,
           tax_amount = (v_tax_c - v_s_tax_c * (v_n - 1)) / 100.0,
           total_amount = (v_total_c - v_s_total_c * (v_n - 1)) / 100.0,
           amount_paid = (v_paid_c - v_s_paid_c * (v_n - 1)) / 100.0,
           payment_status = CASE
             WHEN v_b.payment_status = 'refunded' THEN 'refunded'
             WHEN (v_total_c - v_paid_c) <= 0 THEN 'paid'
             WHEN v_paid_c > 0 THEN 'partial'
             ELSE 'unpaid'
           END,
           updated_at = now()
     WHERE id = v_b.id;

    UPDATE public.booking_nights
       SET rooms_count = 1, updated_at = now()
     WHERE booking_id = v_b.id AND rooms_count <> 1;

    -- 2. One sibling per remaining room, with a mirrored room-night ledger.
    FOR v_i IN 2..v_n LOOP
      INSERT INTO public.bookings (
        id, hotel_id, reference, guest_id, room_id, room_type_id, check_in, check_out,
        adults, children, room_rate, subtotal, tax_amount, total_amount,
        amount_paid, currency, status, payment_status,
        payment_preference, source, special_requests, estimated_arrival,
        internal_notes, check_in_at, check_out_at, cancelled_at, cancellation_reason,
        created_by, created_at, rooms_count, rate_plan_id, channel_provider, group_id
      ) VALUES (
        gen_random_uuid(), v_b.hotel_id, public.generate_booking_reference(v_b.hotel_id),
        v_b.guest_id, NULL, v_b.room_type_id, v_b.check_in, v_b.check_out,
        coalesce(v_b.adults, 1), coalesce(v_b.children, 0), v_b.room_rate,
        v_s_sub_c / 100.0, v_s_tax_c / 100.0, v_s_total_c / 100.0, v_s_paid_c / 100.0,
        v_b.currency, v_b.status,
        CASE
          WHEN v_b.payment_status = 'refunded' THEN 'refunded'
          WHEN v_s_paid_c >= v_s_total_c THEN 'paid'
          WHEN v_s_paid_c > 0 THEN 'partial'
          ELSE 'unpaid'
        END,
        v_b.payment_preference, v_b.source, v_b.special_requests, v_b.estimated_arrival,
        v_b.internal_notes, v_b.check_in_at, v_b.check_out_at,
        CASE WHEN v_b.status = 'cancelled' THEN v_b.cancelled_at END,
        CASE WHEN v_b.status = 'cancelled' THEN v_b.cancellation_reason END,
        v_b.created_by, v_b.created_at, 1, v_b.rate_plan_id, v_b.channel_provider,
        v_b.id
      )
      RETURNING id INTO v_sibling;

      INSERT INTO public.booking_nights (
        hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency,
        rate_plan_id, occupancy, source, seasonal_rate_id, season_name
      )
      SELECT bn.hotel_id, v_sibling, bn.stay_date, 1, bn.rate_minor, bn.currency,
             bn.rate_plan_id, bn.occupancy, bn.source, bn.seasonal_rate_id, bn.season_name
        FROM public.booking_nights bn
       WHERE bn.booking_id = v_b.id;
    END LOOP;

    -- 3. Self-healing room-night ledger for rows that never had nights written.
    PERFORM public.backfill_booking_nights(v_b.hotel_id);

    v_split := v_split + 1;
  END LOOP;

  RAISE NOTICE 'split % legacy multi-unit booking(s) into one row per room', v_split;
END
$split$;

ALTER TABLE public.bookings ENABLE TRIGGER bookings_restrictions_guard;
