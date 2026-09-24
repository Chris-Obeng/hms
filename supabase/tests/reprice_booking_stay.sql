-- =============================================================================
-- Regression probe: moving a booked stay re-resolves its nightly rates, its
-- money and its booking_nights in one transaction, and a rejection leaves the
-- reservation exactly as it was.
--
-- Run against a database with the migrations applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reprice_booking_stay.sql
--
-- One transaction, always rolled back, so it is safe against a local stack and
-- leaves no rows behind. Exit code 0 with the PASS notices means the function
-- behaves; any FAIL raises and aborts, and ON_ERROR_STOP turns that into a
-- non-zero exit.
--
-- weekend_price is deliberately set equal to base_price so the expected figures
-- do not depend on which weekday the probe happens to run on, and every window
-- is far enough in the future that no rate seasonality in seed data reaches it.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on

\set hotel  'd0d0d0d0-0000-4000-8000-00000000000a'
\set other  'd0d0d0d0-0000-4000-8000-00000000000b'
\set rtD    'd1d1d1d1-0000-4000-8000-000000000001'
\set rtS    'd1d1d1d1-0000-4000-8000-000000000002'
\set rtZ    'd1d1d1d1-0000-4000-8000-000000000003'
\set rmA    'd2d2d2d2-0000-4000-8000-00000000000a'
\set rmB    'd2d2d2d2-0000-4000-8000-00000000000b'
\set rmC    'd2d2d2d2-0000-4000-8000-00000000000c'
\set planS  'd4d4d4d4-0000-4000-8000-000000000001'
\set planS2 'd4d4d4d4-0000-4000-8000-000000000002'

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency, settings) VALUES
  (:'hotel', 'reprice-probe', 'Reprice Probe', 'org_reprice_probe', 'GHS',
   jsonb_build_object('tax_enabled', true, 'tax_percentage', 12.5)),
  (:'other', 'reprice-other', 'Reprice Other', 'org_reprice_other', 'GHS',
   jsonb_build_object('tax_enabled', true, 'tax_percentage', 12.5));

INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  (:'rtD', :'hotel', 'Reprice Double', 'reprice-double', 400.00, 400.00, 2, 2),
  (:'rtS', :'hotel', 'Reprice Suite',  'reprice-suite',  900.00, 900.00, 2, 2),
  (:'rtZ', :'hotel', 'Reprice Comped', 'reprice-comped',      0,      0, 2, 0);

-- Four bookable doubles so room-type inventory is never the binding constraint
-- except where a case means it to be, and one in maintenance so the
-- room_not_bookable branch has something real to reject.
INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number, status) VALUES
  (:'rmA', :'hotel', :'rtD', 'D-101', 'available'),
  (:'rmB', :'hotel', :'rtD', 'D-102', 'available'),
  (:'rmC', :'hotel', :'rtD', 'D-103', 'maintenance');

INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status) VALUES
  (:'hotel', :'rtD', 'D-104', 'available'),
  (:'hotel', :'rtD', 'D-105', 'available'),
  (:'hotel', :'rtS', 'S-201', 'available'),
  (:'hotel', :'rtS', 'S-202', 'available'),
  (:'hotel', :'rtZ', 'Z-301', 'available');

INSERT INTO public.rate_plans
  (id, hotel_id, room_type_id, title, code, currency, is_default, is_active)
VALUES
  (:'planS', :'hotel', :'rtD', 'Selected Reprice', 'RSEL', 'GHS', false, true),
  (:'planS2', :'hotel', :'rtS', 'Suite Replacement', 'SREP', 'GHS', false, true);

-- DO blocks cannot hand a value to the next one, so the reservations this probe
-- drags around are parked here by name.
CREATE TEMP TABLE reprice_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;

-- The fixture reservations are written by create_booking_atomic rather than by
-- hand, so every one of them starts with booking_nights that agree with its
-- totals. A probe that hand-rolled its rows could pass while the function under
-- test quietly disagreed with the one that creates reservations for real.
DO $$
DECLARE
  v_out jsonb;
BEGIN
  -- B1: the stay this probe drags around.
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
    'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
    'room_id',      'd2d2d2d2-0000-4000-8000-00000000000a',
    'rate_plan_id', 'd4d4d4d4-0000-4000-8000-000000000001',
    'check_in',     (current_date + 20)::text,
    'check_out',    (current_date + 23)::text,
    'adults', 2, 'rooms_count', 2, 'status', 'confirmed',
    'guest_name', 'Kofi Boateng', 'guest_email', 'kofi@example.test',
    'guest_phone', '+233200000101'));
  INSERT INTO reprice_ids VALUES ('b1', (v_out->>'booking_id')::uuid);

  -- B2: sits in room D-102 so a move onto that room has a real occupant.
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
    'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
    'room_id',      'd2d2d2d2-0000-4000-8000-00000000000b',
    'check_in',     (current_date + 40)::text,
    'check_out',    (current_date + 43)::text,
    'adults', 1, 'rooms_count', 1, 'status', 'confirmed',
    'guest_name', 'Yaa Asantewaa', 'guest_email', 'yaa@example.test',
    'guest_phone', '+233200000102'));
  INSERT INTO reprice_ids VALUES ('b2', (v_out->>'booking_id')::uuid);

  -- B3: departed, so it is closed to repricing.
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
    'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
    'check_in',     (current_date + 50)::text,
    'check_out',    (current_date + 52)::text,
    'adults', 1, 'rooms_count', 1, 'status', 'confirmed',
    'guest_name', 'Kwame Nkrumah', 'guest_email', 'kwame@example.test',
    'guest_phone', '+233200000103'));
  INSERT INTO reprice_ids VALUES ('b3', (v_out->>'booking_id')::uuid);
  UPDATE public.bookings SET status = 'checked_out'
   WHERE id = (SELECT v FROM reprice_ids WHERE k = 'b3');

  -- B4: settled in full, so a longer stay must demote it.
  --     400.00 x 2 nights x 1 room = 800.00 + 12.5% = 900.00
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
    'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
    'check_in',     (current_date + 60)::text,
    'check_out',    (current_date + 62)::text,
    'adults', 1, 'rooms_count', 1, 'status', 'confirmed',
    'guest_name', 'Efua Sutherland', 'guest_email', 'efua@example.test',
    'guest_phone', '+233200000104'));
  INSERT INTO reprice_ids VALUES ('b4', (v_out->>'booking_id')::uuid);

  UPDATE public.bookings
     SET amount_paid = 900.00, payment_status = 'paid'
   WHERE id = (SELECT v FROM reprice_ids WHERE k = 'b4');

  IF (SELECT total_amount FROM public.bookings
       WHERE id = (SELECT v FROM reprice_ids WHERE k = 'b4')) <> 900.00 THEN
    RAISE EXCEPTION 'FAIL 0: fixture B4 total is not 900.00';
  END IF;

  RAISE NOTICE 'PASS 0: fixture reservations written by create_booking_atomic';
END $$;

-- =============================================================================
-- 1. A plain move: four nights instead of three, priced from the resolver, with
--    booking_nights spanning exactly the new window and nothing else.
--    400.00 x 4 = 1600.00 per room; x 2 rooms = 3200.00; +12.5% = 3600.00
-- =============================================================================
DO $$
DECLARE
  v_id   uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_out  jsonb;
  v_row  public.bookings;
  v_n    integer;
  v_lo   date;
  v_hi   date;
  v_off  integer;
BEGIN
  v_out := public.reprice_booking_stay(jsonb_build_object(
    'booking_id', v_id,
    'hotel_id',   'd0d0d0d0-0000-4000-8000-00000000000a',
    'check_in',   (current_date + 25)::text,
    'check_out',  (current_date + 29)::text));

  IF (v_out->>'night_count')::integer <> 4
     OR (v_out->>'nights_kept')::integer <> 0
     OR (v_out->>'type_changed')::boolean IS NOT FALSE
     OR v_out->>'currency' <> 'GHS' THEN
    RAISE EXCEPTION 'FAIL 1a: shape wrong -- %', v_out - 'nights' - 'before' - 'after';
  END IF;

  IF (v_out->>'subtotal_minor')::bigint <> 320000
     OR (v_out->>'tax_minor')::bigint <> 40000
     OR (v_out->>'total_minor')::bigint <> 360000 THEN
    RAISE EXCEPTION 'FAIL 1b: minor units wrong -- subtotal %, tax %, total %',
      v_out->>'subtotal_minor', v_out->>'tax_minor', v_out->>'total_minor';
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;

  IF v_row.check_in <> current_date + 25 OR v_row.check_out <> current_date + 29
     OR v_row.nights <> 4 OR v_row.subtotal <> 3200.00
     OR v_row.tax_amount <> 400.00 OR v_row.total_amount <> 3600.00
     OR v_row.room_rate <> 400.00 THEN
    RAISE EXCEPTION 'FAIL 1c: booking row wrong -- % to %, % nights, subtotal %, tax %, total %, rate %',
      v_row.check_in, v_row.check_out, v_row.nights, v_row.subtotal,
      v_row.tax_amount, v_row.total_amount, v_row.room_rate;
  END IF;

  -- amount_paid is zero, so the stay stays unpaid: a longer window is not a
  -- payment event and must not be reported as one.
  IF v_row.payment_status <> 'unpaid' OR v_row.amount_paid <> 0 THEN
    RAISE EXCEPTION 'FAIL 1d: payment state moved -- % / %',
      v_row.payment_status, v_row.amount_paid;
  END IF;

  SELECT count(*), min(stay_date), max(stay_date),
         count(*) FILTER (WHERE rate_minor <> 40000 OR rooms_count <> 2
                             OR currency <> 'GHS' OR source <> 'base')
    INTO v_n, v_lo, v_hi, v_off
    FROM public.booking_nights WHERE booking_id = v_id;

  IF v_n <> 4 OR v_lo <> current_date + 25 OR v_hi <> current_date + 28 OR v_off <> 0 THEN
    RAISE EXCEPTION 'FAIL 1e: nights wrong -- % rows spanning % to %, % odd',
      v_n, v_lo, v_hi, v_off;
  END IF;

  IF v_row.rate_plan_id IS DISTINCT FROM
       'd4d4d4d4-0000-4000-8000-000000000001'::uuid
     OR EXISTS (
       SELECT 1 FROM public.booking_nights bn
       WHERE bn.booking_id = v_id
         AND bn.rate_plan_id IS DISTINCT FROM v_row.rate_plan_id) THEN
    RAISE EXCEPTION 'FAIL 1f: ordinary repricing changed selected plan or night authority';
  END IF;

  RAISE NOTICE 'PASS 1: a moved stay retains its plan and is re-resolved, re-priced and re-nighted';
END $$;

-- =============================================================================
-- 2. A night a human priced by hand survives a move within the same room type,
--    and only the nights around it are re-resolved.
--    100.00 (kept) + 400.00 + 400.00 = 900.00 per room; x 2 = 1800.00;
--    +12.5% = 2025.00; room_rate = 900.00 / 3 nights = 300.00
-- =============================================================================
DO $$
DECLARE
  v_id  uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_out jsonb;
  v_row public.bookings;
  v_manual bigint;
  v_rest   bigint;
BEGIN
  UPDATE public.booking_nights
     SET source = 'manual', rate_minor = 10000
   WHERE booking_id = v_id AND stay_date = current_date + 26;

  v_out := public.reprice_booking_stay(jsonb_build_object(
    'booking_id', v_id,
    'hotel_id',   'd0d0d0d0-0000-4000-8000-00000000000a',
    'check_in',   (current_date + 26)::text,
    'check_out',  (current_date + 29)::text));

  IF (v_out->>'night_count')::integer <> 3
     OR (v_out->>'nights_kept')::integer <> 1
     OR (v_out->>'subtotal_minor')::bigint <> 180000
     OR (v_out->>'tax_minor')::bigint <> 22500
     OR (v_out->>'total_minor')::bigint <> 202500 THEN
    RAISE EXCEPTION 'FAIL 2a: manual night not honoured -- %',
      v_out - 'nights' - 'before' - 'after';
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;

  IF v_row.total_amount <> 2025.00 OR v_row.room_rate <> 300.00 THEN
    RAISE EXCEPTION 'FAIL 2b: booking row wrong -- total %, rate %',
      v_row.total_amount, v_row.room_rate;
  END IF;

  SELECT sum(rate_minor) FILTER (WHERE source = 'manual'),
         sum(rate_minor) FILTER (WHERE source <> 'manual')
    INTO v_manual, v_rest
    FROM public.booking_nights WHERE booking_id = v_id;

  -- One hand-priced night at 100.00 kept verbatim, two nights re-resolved at
  -- the room type's own rate.
  IF v_manual <> 10000 OR v_rest <> 80000 THEN
    RAISE EXCEPTION 'FAIL 2c: night provenance wrong -- manual %, resolved %',
      v_manual, v_rest;
  END IF;

  IF v_row.rate_plan_id IS DISTINCT FROM
       'd4d4d4d4-0000-4000-8000-000000000001'::uuid
     OR EXISTS (
       SELECT 1 FROM public.booking_nights bn
       WHERE bn.booking_id = v_id
         AND bn.rate_plan_id IS DISTINCT FROM v_row.rate_plan_id) THEN
    RAISE EXCEPTION 'FAIL 2d: same-type move changed booking or manual-night plan authority';
  END IF;

  RAISE NOTICE 'PASS 2: a hand-priced night survives a same-type move under the stored plan';
END $$;

-- =============================================================================
-- 3. A room-type change re-resolves every night, hand-priced ones included --
--    the price of a suite is not the price of a double, however it was set --
--    while `room_id: null` unassigns and the absent date keys leave the window
--    where it is.
--    900.00 x 3 = 2700.00 per room; x 2 = 5400.00; +12.5% = 6075.00
-- =============================================================================
DO $$
DECLARE
  v_id  uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_out jsonb;
  v_row public.bookings;
  v_off integer;
  v_new_plan uuid;
BEGIN
  SELECT rp.id INTO v_new_plan
  FROM public.rate_plans rp
  WHERE rp.hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
    AND rp.room_type_id = 'd1d1d1d1-0000-4000-8000-000000000002'
    AND rp.is_default;

  v_out := public.reprice_booking_stay(jsonb_build_object(
    'booking_id',   v_id,
    'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
    'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000002',
    'rate_plan_id', v_new_plan,
    'room_id',      NULL));

  IF (v_out->>'type_changed')::boolean IS NOT TRUE
     OR (v_out->>'nights_kept')::integer <> 0
     OR (v_out->>'night_count')::integer <> 3
     OR (v_out->>'subtotal_minor')::bigint <> 540000
     OR (v_out->>'tax_minor')::bigint <> 67500
     OR (v_out->>'total_minor')::bigint <> 607500 THEN
    RAISE EXCEPTION 'FAIL 3a: type change wrong -- %',
      v_out - 'nights' - 'before' - 'after';
  END IF;

  -- before/after are what the caller audits, so they have to describe the move
  -- rather than merely exist.
  IF (v_out->'before'->>'room_type_id')::uuid <> 'd1d1d1d1-0000-4000-8000-000000000001'
     OR (v_out->'after'->>'room_type_id')::uuid <> 'd1d1d1d1-0000-4000-8000-000000000002'
     OR v_out->'after'->>'room_id' IS NOT NULL
     OR (v_out->'after'->>'total_amount')::numeric <> 6075.00 THEN
    RAISE EXCEPTION 'FAIL 3b: audit blocks wrong -- before %, after %',
      v_out->'before', v_out->'after';
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;

  IF v_row.room_id IS NOT NULL
     OR v_row.check_in <> current_date + 26 OR v_row.check_out <> current_date + 29
     OR v_row.total_amount <> 6075.00
     OR v_row.rate_plan_id IS DISTINCT FROM v_new_plan THEN
    RAISE EXCEPTION 'FAIL 3c: booking row wrong -- room %, % to %, total %, plan %',
      v_row.room_id, v_row.check_in, v_row.check_out, v_row.total_amount,
      v_row.rate_plan_id;
  END IF;

  SELECT count(*) FILTER (
           WHERE source <> 'base' OR rate_minor <> 90000
              OR rate_plan_id IS DISTINCT FROM v_new_plan)
    INTO v_off FROM public.booking_nights WHERE booking_id = v_id;

  IF v_off <> 0 THEN
    RAISE EXCEPTION 'FAIL 3d: % night(s) kept old type pricing or plan authority', v_off;
  END IF;

  RAISE NOTICE 'PASS 3: a type change re-resolves every night and unassigns the room';
END $$;

-- =============================================================================
-- 4. Repricing moves the total, so a settled stay can quietly become underpaid.
--    B4 is paid in full at 900.00. A third night takes it to 1350.00, which must
--    demote it to partial; moving back must restore paid. A refund is a decision
--    someone made, not arithmetic, so 'refunded' is left where it is.
-- =============================================================================
DO $$
DECLARE
  v_id  uuid := (SELECT v FROM reprice_ids WHERE k = 'b4');
  v_row public.bookings;
BEGIN
  PERFORM public.reprice_booking_stay(jsonb_build_object(
    'booking_id', v_id,
    'hotel_id',   'd0d0d0d0-0000-4000-8000-00000000000a',
    'check_out',  (current_date + 63)::text));

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;

  IF v_row.total_amount <> 1350.00 OR v_row.payment_status <> 'partial'
     OR v_row.amount_paid <> 900.00 OR v_row.outstanding_balance <> 450.00 THEN
    RAISE EXCEPTION 'FAIL 4a: not demoted -- total %, %, paid %, outstanding %',
      v_row.total_amount, v_row.payment_status, v_row.amount_paid,
      v_row.outstanding_balance;
  END IF;

  PERFORM public.reprice_booking_stay(jsonb_build_object(
    'booking_id', v_id,
    'hotel_id',   'd0d0d0d0-0000-4000-8000-00000000000a',
    'check_out',  (current_date + 62)::text));

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;

  IF v_row.total_amount <> 900.00 OR v_row.payment_status <> 'paid'
     OR v_row.outstanding_balance <> 0 THEN
    RAISE EXCEPTION 'FAIL 4b: not restored -- total %, %, outstanding %',
      v_row.total_amount, v_row.payment_status, v_row.outstanding_balance;
  END IF;

  UPDATE public.bookings SET payment_status = 'refunded' WHERE id = v_id;

  PERFORM public.reprice_booking_stay(jsonb_build_object(
    'booking_id', v_id,
    'hotel_id',   'd0d0d0d0-0000-4000-8000-00000000000a',
    'check_out',  (current_date + 63)::text));

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;

  IF v_row.payment_status <> 'refunded' THEN
    RAISE EXCEPTION 'FAIL 4c: a refund was overwritten with %', v_row.payment_status;
  END IF;

  RAISE NOTICE 'PASS 4: payment status follows the total, and a refund is left alone';
END $$;

-- =============================================================================
-- 5. Rejections. Every payload here differs from a valid one in exactly one
--    field, so the code it raises names the field that made it invalid, and the
--    two rejections that carry a hint must carry a useful one.
--
--    The outcome is collected in a variable rather than raised inside the block:
--    a bare RAISE EXCEPTION is itself P0001 and would be caught by this very
--    handler, turning a real failure into a confusing one.
-- =============================================================================
DO $$
DECLARE
  v_base jsonb := jsonb_build_object(
    'booking_id', (SELECT v FROM reprice_ids WHERE k = 'b1'),
    'hotel_id',   'd0d0d0d0-0000-4000-8000-00000000000a');
  v_case   text;
  v_want   text;
  v_detail text;
  v_hint   text;
  v_double_plan uuid;
  v_zero_plan uuid;
BEGIN
  SELECT rp.id INTO v_double_plan
  FROM public.rate_plans rp
  WHERE rp.hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
    AND rp.room_type_id = 'd1d1d1d1-0000-4000-8000-000000000001'
    AND rp.is_default;

  SELECT rp.id INTO v_zero_plan
  FROM public.rate_plans rp
  WHERE rp.hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
    AND rp.room_type_id = 'd1d1d1d1-0000-4000-8000-000000000003'
    AND rp.is_default;

  FOREACH v_case IN ARRAY ARRAY[
    'invalid_payload', 'invalid_date_range', 'invalid_rooms_count',
    'room_type_not_found', 'booking_not_found', 'cross_tenant',
    'booking_not_open', 'room_not_bookable', 'stale_room_on_new_type',
    'room_conflict', 'unpriced_stay'
  ] LOOP
    v_detail := '<accepted>';
    v_hint   := NULL;
    BEGIN
      PERFORM public.reprice_booking_stay(
        CASE v_case
          WHEN 'invalid_payload' THEN
            v_base || jsonb_build_object('check_in', 'not-a-date')
          WHEN 'invalid_date_range' THEN
            v_base || jsonb_build_object('check_out', (current_date + 26)::text)
          WHEN 'invalid_rooms_count' THEN
            v_base || jsonb_build_object('rooms_count', 0)
          WHEN 'room_type_not_found' THEN
            v_base || jsonb_build_object('room_type_id', 'd1d1d1d1-0000-4000-8000-0000000000ff')
          WHEN 'booking_not_found' THEN
            v_base || jsonb_build_object('booking_id', 'd3d3d3d3-0000-4000-8000-0000000000ff')
          -- A stay under another property is missing, not forbidden: the
          -- distinction is itself information the caller has no right to.
          WHEN 'cross_tenant' THEN
            v_base || jsonb_build_object('hotel_id', 'd0d0d0d0-0000-4000-8000-00000000000b')
          WHEN 'booking_not_open' THEN
            v_base || jsonb_build_object(
              'booking_id', (SELECT v FROM reprice_ids WHERE k = 'b3'))
          WHEN 'room_not_bookable' THEN
            v_base || jsonb_build_object(
              'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
              'rate_plan_id', v_double_plan,
              'room_id',      'd2d2d2d2-0000-4000-8000-00000000000c')
          -- The room the stay sat in before its type changed belongs to the old
          -- type, so keeping it is refused rather than silently accepted.
          WHEN 'stale_room_on_new_type' THEN
            v_base || jsonb_build_object('room_id', 'd2d2d2d2-0000-4000-8000-00000000000a')
          WHEN 'room_conflict' THEN
            v_base || jsonb_build_object(
              'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
              'rate_plan_id', v_double_plan,
              'room_id',      'd2d2d2d2-0000-4000-8000-00000000000b',
              'check_in',     (current_date + 40)::text,
              'check_out',    (current_date + 43)::text)
          ELSE
            v_base || jsonb_build_object(
              'booking_id',   (SELECT v FROM reprice_ids WHERE k = 'b4'),
              'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000003',
              'rate_plan_id', v_zero_plan)
        END);
    EXCEPTION WHEN sqlstate 'P0001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    END;

    v_want := CASE v_case
                WHEN 'cross_tenant'           THEN 'booking_not_found'
                WHEN 'stale_room_on_new_type' THEN 'room_not_bookable'
                ELSE v_case
              END;

    IF v_detail IS DISTINCT FROM v_want THEN
      RAISE EXCEPTION 'FAIL 5: % produced %', v_case, COALESCE(v_detail, '<no detail>');
    END IF;

    -- Staff need to know which state blocked the edit, not just that one did.
    IF v_case = 'booking_not_open' AND v_hint IS DISTINCT FROM 'checked_out' THEN
      RAISE EXCEPTION 'FAIL 5: booking_not_open hinted % instead of the status',
        COALESCE(v_hint, '<none>');
    END IF;

    -- And who is in the room, so the front desk can go and ask them.
    IF v_case = 'room_conflict' AND v_hint IS DISTINCT FROM 'Yaa Asantewaa' THEN
      RAISE EXCEPTION 'FAIL 5: room_conflict hinted % instead of the occupant',
        COALESCE(v_hint, '<none>');
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS 5: eleven bad payloads are each refused by their own name';
END;
$$;

-- =============================================================================
-- 6. A refused edit changes nothing. The rejection used here is the deepest one
--    reachable in a single session: the stay is priced in full and only then
--    refused, so every statement the function would have run before its own
--    RAISE has to come back out. `updated_at` is part of the snapshot because a
--    touch trigger firing is itself evidence the row was written.
-- =============================================================================
DO $$
DECLARE
  v_id            uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_before_row    jsonb;
  v_after_row     jsonb;
  v_before_nights text;
  v_after_nights  text;
  v_detail        text;
  v_zero_plan     uuid;
BEGIN
  SELECT rp.id INTO v_zero_plan
  FROM public.rate_plans rp
  WHERE rp.hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
    AND rp.room_type_id = 'd1d1d1d1-0000-4000-8000-000000000003'
    AND rp.is_default;

  SELECT to_jsonb(x) INTO v_before_row FROM (
    SELECT b.check_in, b.check_out, b.room_id, b.room_type_id, b.rooms_count,
           b.nights, b.currency, b.room_rate, b.subtotal, b.tax_amount,
           b.total_amount, b.amount_paid, b.payment_status, b.updated_at
      FROM public.bookings b WHERE b.id = v_id) x;

  SELECT string_agg(bn.stay_date::text || ':' || bn.rate_minor::text || ':' ||
                    bn.rooms_count::text || ':' || bn.source, '|' ORDER BY bn.stay_date)
    INTO v_before_nights
    FROM public.booking_nights bn WHERE bn.booking_id = v_id;

  -- Without this, an empty digest on both sides would let 6c pass by comparing
  -- nothing to nothing.
  IF v_before_nights IS NULL THEN
    RAISE EXCEPTION 'FAIL 6: the stay has no nights to protect';
  END IF;

  v_detail := '<accepted>';
  BEGIN
    PERFORM public.reprice_booking_stay(jsonb_build_object(
      'booking_id',   v_id,
      'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
      'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000003',
      'rate_plan_id', v_zero_plan));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail IS DISTINCT FROM 'unpriced_stay' THEN
    RAISE EXCEPTION 'FAIL 6a: expected unpriced_stay, got %',
      COALESCE(v_detail, '<no detail>');
  END IF;

  SELECT to_jsonb(x) INTO v_after_row FROM (
    SELECT b.check_in, b.check_out, b.room_id, b.room_type_id, b.rooms_count,
           b.nights, b.currency, b.room_rate, b.subtotal, b.tax_amount,
           b.total_amount, b.amount_paid, b.payment_status, b.updated_at
      FROM public.bookings b WHERE b.id = v_id) x;

  SELECT string_agg(bn.stay_date::text || ':' || bn.rate_minor::text || ':' ||
                    bn.rooms_count::text || ':' || bn.source, '|' ORDER BY bn.stay_date)
    INTO v_after_nights
    FROM public.booking_nights bn WHERE bn.booking_id = v_id;

  IF v_after_row IS DISTINCT FROM v_before_row THEN
    RAISE EXCEPTION 'FAIL 6b: the refused edit altered the reservation: % -> %',
      v_before_row, v_after_row;
  END IF;

  IF v_after_nights IS DISTINCT FROM v_before_nights THEN
    RAISE EXCEPTION 'FAIL 6c: the refused edit altered the nights: % -> %',
      COALESCE(v_before_nights, '<none>'), COALESCE(v_after_nights, '<none>');
  END IF;

  RAISE NOTICE 'PASS 6: a refused edit leaves the reservation and its nights untouched';
END;
$$;

-- =============================================================================
-- 7. Plan changes are explicit and validated. Ordinary repricing retains the
--    booking authority; an explicit compatible plan updates booking and nights.
-- =============================================================================
DO $$
DECLARE
  v_id uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_replacement_plan uuid := 'd4d4d4d4-0000-4000-8000-000000000002';
  v_old_plan uuid;
  v_row public.bookings;
  v_detail text;
  v_manual_date date;
  v_expected_rate bigint;
  v_expected_source text;
BEGIN
  SELECT b.rate_plan_id, b.check_in
    INTO v_old_plan, v_manual_date
  FROM public.bookings b
  WHERE b.id = v_id;

  IF v_old_plan IS NULL OR v_old_plan = v_replacement_plan THEN
    RAISE EXCEPTION 'FIXTURE 7: replacement plan does not change authority';
  END IF;

  UPDATE public.booking_nights
     SET source = 'manual', rate_minor = 12345
   WHERE booking_id = v_id AND stay_date = v_manual_date;

  IF NOT EXISTS (
       SELECT 1 FROM public.booking_nights bn
       WHERE bn.booking_id = v_id
         AND bn.stay_date = v_manual_date
         AND bn.rate_minor = 12345
         AND bn.source = 'manual'
         AND bn.rate_plan_id = v_old_plan) THEN
    RAISE EXCEPTION 'FIXTURE 7: manual night was not established under old plan';
  END IF;

  SELECT r.rate_minor, r.source
    INTO v_expected_rate, v_expected_source
  FROM public.resolve_nightly_rates(
    'd0d0d0d0-0000-4000-8000-00000000000a',
    ARRAY['d1d1d1d1-0000-4000-8000-000000000002'::uuid],
    v_manual_date, v_manual_date + 1, v_replacement_plan, 0) r;

  IF v_expected_rate IS NULL OR v_expected_source IS NULL
     OR v_expected_source = 'manual' THEN
    RAISE EXCEPTION 'FIXTURE 7: replacement plan returned no usable resolver row';
  END IF;

  PERFORM public.reprice_booking_stay(jsonb_build_object(
    'booking_id', v_id,
    'hotel_id', 'd0d0d0d0-0000-4000-8000-00000000000a',
    'rate_plan_id', v_replacement_plan));

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;
  IF v_row.room_type_id IS DISTINCT FROM
       'd1d1d1d1-0000-4000-8000-000000000002'::uuid
     OR v_row.rate_plan_id IS DISTINCT FROM v_replacement_plan
     OR EXISTS (
       SELECT 1 FROM public.booking_nights bn
       WHERE bn.booking_id = v_id
         AND bn.rate_plan_id IS DISTINCT FROM v_replacement_plan) THEN
    RAISE EXCEPTION 'FAIL 7a: same-type plan change did not update booking and nights';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.booking_nights bn
       WHERE bn.booking_id = v_id
         AND bn.stay_date = v_manual_date
         AND bn.rate_minor = v_expected_rate
         AND bn.source = v_expected_source
         AND bn.source <> 'manual'
         AND bn.rate_plan_id = v_replacement_plan) THEN
    RAISE EXCEPTION 'FAIL 7b: replacement plan did not re-resolve manual night';
  END IF;

  v_detail := '<accepted>';
  BEGIN
    PERFORM public.reprice_booking_stay(jsonb_build_object(
      'booking_id', v_id,
      'hotel_id', 'd0d0d0d0-0000-4000-8000-00000000000a',
      'rate_plan_id', 'e2e2e2e2-0000-4000-8000-0000000000ff'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail IS DISTINCT FROM 'rate_plan_not_found' THEN
    RAISE EXCEPTION 'FAIL 7c: invalid plan produced %', v_detail;
  END IF;
  RAISE NOTICE 'PASS 7: same-type plan replacement re-resolves manual nights under new authority';
END $$;

-- =============================================================================
-- 8. An inactive stored plan remains historical authority whether omitted or
--    repeated explicitly. Changing authority still requires an active plan.
-- =============================================================================
DO $$
DECLARE
  v_id uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_plan uuid;
  v_other_plan uuid;
  v_detail text := '<accepted>';
BEGIN
  SELECT b.rate_plan_id INTO v_plan FROM public.bookings b WHERE b.id = v_id;
  SELECT rp.id INTO v_other_plan
  FROM public.rate_plans rp
  WHERE rp.hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
    AND rp.room_type_id = 'd1d1d1d1-0000-4000-8000-000000000002'
    AND rp.id <> v_plan
  ORDER BY rp.is_default DESC, rp.id
  LIMIT 1;

  IF v_plan IS NULL OR v_other_plan IS NULL THEN
    RAISE EXCEPTION 'FIXTURE 8: inactive-plan authorities are missing';
  END IF;

  UPDATE public.rate_plans SET is_active = false
  WHERE id IN (v_plan, v_other_plan);

  PERFORM public.reprice_booking_stay(jsonb_build_object(
    'booking_id', v_id,
    'hotel_id', 'd0d0d0d0-0000-4000-8000-00000000000a'));

  IF (SELECT b.rate_plan_id FROM public.bookings b WHERE b.id = v_id)
       IS DISTINCT FROM v_plan
     OR EXISTS (SELECT 1 FROM public.booking_nights bn
                WHERE bn.booking_id = v_id
                  AND bn.rate_plan_id IS DISTINCT FROM v_plan) THEN
    RAISE EXCEPTION 'FAIL 8a: omitted inactive stored plan lost authority';
  END IF;

  PERFORM public.reprice_booking_stay(jsonb_build_object(
    'booking_id', v_id,
    'hotel_id', 'd0d0d0d0-0000-4000-8000-00000000000a',
    'rate_plan_id', v_plan));

  IF (SELECT b.rate_plan_id FROM public.bookings b WHERE b.id = v_id)
       IS DISTINCT FROM v_plan
     OR EXISTS (SELECT 1 FROM public.booking_nights bn
                WHERE bn.booking_id = v_id
                  AND bn.rate_plan_id IS DISTINCT FROM v_plan) THEN
    RAISE EXCEPTION 'FAIL 8b: repeated inactive stored plan lost authority';
  END IF;

  BEGIN
    PERFORM public.reprice_booking_stay(jsonb_build_object(
      'booking_id', v_id,
      'hotel_id', 'd0d0d0d0-0000-4000-8000-00000000000a',
      'rate_plan_id', v_other_plan));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail IS DISTINCT FROM 'rate_plan_not_found' THEN
    RAISE EXCEPTION 'FAIL 8c: changed inactive plan produced %', v_detail;
  END IF;

  UPDATE public.rate_plans SET is_active = true
  WHERE id IN (v_plan, v_other_plan);
  RAISE NOTICE 'PASS 8: inactive stored authority survives omission and explicit repetition';
END $$;

-- =============================================================================
-- 9. Duplicate/missing resolver dates are rejected as unpriced_stay. Temporary
--    resolver seam leaves public resolver object and privileges untouched.
-- =============================================================================
CREATE FUNCTION pg_temp.malformed_nightly_rates(
  p_hotel_id uuid, p_room_type_ids uuid[], p_from date, p_to date,
  p_rate_plan_id uuid, p_occupancy smallint
)
RETURNS TABLE (
  room_type_id uuid, rate_plan_id uuid, stay_date date, occupancy smallint,
  rate_minor bigint, currency text, source text, seasonal_rate_id uuid,
  season_name text, is_weekend boolean, active_seasonal_rate_id uuid,
  active_season_name text
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT r.room_type_id, r.rate_plan_id,
         CASE WHEN r.stay_date = p_from + 1 THEN p_from ELSE r.stay_date END,
         r.occupancy, r.rate_minor, r.currency, r.source, r.seasonal_rate_id,
         r.season_name, r.is_weekend, r.active_seasonal_rate_id,
         r.active_season_name
  FROM public.resolve_nightly_rates(
    p_hotel_id, p_room_type_ids, p_from, p_to, p_rate_plan_id, p_occupancy) r
$fn$;

DO $$
DECLARE
  v_id uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_detail text := '<accepted>';
  v_before_row jsonb;
  v_after_row jsonb;
  v_before_nights text;
  v_after_nights text;
BEGIN
  SELECT to_jsonb(b) INTO v_before_row FROM public.bookings b WHERE b.id = v_id;
  SELECT string_agg(row_to_json(bn)::text, '|' ORDER BY bn.stay_date)
    INTO v_before_nights
  FROM public.booking_nights bn WHERE bn.booking_id = v_id;
  PERFORM set_config('roomline.rate_resolver',
                     'pg_temp.malformed_nightly_rates', true);

  BEGIN
    PERFORM public.reprice_booking_stay(jsonb_build_object(
      'booking_id', v_id,
      'hotel_id', 'd0d0d0d0-0000-4000-8000-00000000000a'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  PERFORM set_config('roomline.rate_resolver', '', true);

  SELECT to_jsonb(b) INTO v_after_row FROM public.bookings b WHERE b.id = v_id;
  SELECT string_agg(row_to_json(bn)::text, '|' ORDER BY bn.stay_date)
    INTO v_after_nights
  FROM public.booking_nights bn WHERE bn.booking_id = v_id;

  IF v_detail IS DISTINCT FROM 'unpriced_stay'
     OR v_after_row IS DISTINCT FROM v_before_row
     OR v_after_nights IS DISTINCT FROM v_before_nights THEN
    RAISE EXCEPTION 'FAIL 8: malformed date set produced % or changed booking', v_detail;
  END IF;
  RAISE NOTICE 'PASS 9: repricing rejects duplicate/missing resolver dates without writes';
END $$;

-- =============================================================================
-- 10. A type move cannot keep the booking's own plan -- plans name one type --
--     so when the payload does not name one, authority re-anchors through the
--     same resolver the quote path uses and lands on the new type's default.
--     Before the re-anchor this exact payload rejected as rate_plan_not_found,
--     which is the bug the calendar's cross-section drag surfaced.
--     b1 sits on the suite's non-default replacement plan from section 7, so
--     nothing it carries is sellable for a double.
--     400.00 x 3 = 1200.00 per room; x 2 = 2400.00; +12.5% = 2700.00
-- =============================================================================
DO $$
DECLARE
  v_id          uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_out         jsonb;
  v_row         public.bookings;
  v_off         integer;
  v_double_plan uuid;
BEGIN
  SELECT rp.id INTO v_double_plan
  FROM public.rate_plans rp
  WHERE rp.hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
    AND rp.room_type_id = 'd1d1d1d1-0000-4000-8000-000000000001'
    AND rp.is_default;

  v_out := public.reprice_booking_stay(jsonb_build_object(
    'booking_id',   v_id,
    'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
    'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001'));

  IF (v_out->>'type_changed')::boolean IS NOT TRUE
     OR (v_out->>'nights_kept')::integer <> 0
     OR (v_out->>'night_count')::integer <> 3
     OR (v_out->>'subtotal_minor')::bigint <> 240000
     OR (v_out->>'tax_minor')::bigint <> 30000
     OR (v_out->>'total_minor')::bigint <> 270000 THEN
    RAISE EXCEPTION 'FAIL 10a: re-anchored type change wrong -- %',
      v_out - 'nights' - 'before' - 'after';
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;

  IF v_row.room_type_id <> 'd1d1d1d1-0000-4000-8000-000000000001'
     OR v_row.rate_plan_id IS DISTINCT FROM v_double_plan
     OR v_row.room_id IS NOT NULL
     OR v_row.total_amount <> 2700.00 THEN
    RAISE EXCEPTION 'FAIL 10b: booking row wrong -- type %, plan %, room %, total %',
      v_row.room_type_id, v_row.rate_plan_id, v_row.room_id, v_row.total_amount;
  END IF;

  SELECT count(*) FILTER (
           WHERE source <> 'base' OR rate_minor <> 40000
              OR rate_plan_id IS DISTINCT FROM v_double_plan)
    INTO v_off FROM public.booking_nights WHERE booking_id = v_id;

  IF v_off <> 0 THEN
    RAISE EXCEPTION 'FAIL 10c: % night(s) kept suite pricing or plan authority', v_off;
  END IF;

  RAISE NOTICE 'PASS 10: a type change without a plan re-anchors to the new type''s default';
END;
$$;

-- =============================================================================
-- 11. The re-anchor names a real gap rather than papering over it: a type with
--     no active plan has nothing to sell on, and the move is still refused as
--     rate_plan_not_found instead of being repriced against nothing. The comped
--     type's plan is switched off for the attempt and back on in the same block,
--     so the refusal changes nothing.
-- =============================================================================
DO $$
DECLARE
  v_id     uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_detail text;
BEGIN
  UPDATE public.rate_plans SET is_active = false
   WHERE hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
     AND room_type_id = 'd1d1d1d1-0000-4000-8000-000000000003';

  BEGIN
    PERFORM public.reprice_booking_stay(jsonb_build_object(
      'booking_id',   v_id,
      'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
      'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000003'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  UPDATE public.rate_plans SET is_active = true
   WHERE hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
     AND room_type_id = 'd1d1d1d1-0000-4000-8000-000000000003';

  IF v_detail IS DISTINCT FROM 'rate_plan_not_found' THEN
    RAISE EXCEPTION 'FAIL 11: type with no active plan produced %',
      COALESCE(v_detail, '<no detail>');
  END IF;

  RAISE NOTICE 'PASS 11: a type with no active plan still rejects as rate_plan_not_found';
END;
$$;

-- =============================================================================
-- 12. `keep_rates` freezes the agreed price through a type change: b1, sitting
--     on the double at 400.00/night after section 10, moves to the suite
--     (900.00/night) and keeps 400.00 -- every in-window night carries across
--     as a hand-priced row stamped with the suite's re-anchored plan, so the
--     one-plan gate still sees a single authority.
--     400.00 x 3 x 2 = 2400.00; +12.5% = 2700.00. A plain reprice would land
--     on 5400.00 + 12.5% = 6075.00, so the frozen figures prove the freeze.
-- =============================================================================
DO $$
DECLARE
  v_id         uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_out        jsonb;
  v_row        public.bookings;
  v_off        integer;
  v_suite_plan uuid;
BEGIN
  v_suite_plan := public.effective_rate_plan_id(
    'd0d0d0d0-0000-4000-8000-00000000000a',
    'd1d1d1d1-0000-4000-8000-000000000002', NULL);

  v_out := public.reprice_booking_stay(jsonb_build_object(
    'booking_id',   v_id,
    'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
    'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000002',
    'keep_rates',   true));

  IF (v_out->>'type_changed')::boolean IS NOT TRUE
     OR (v_out->>'nights_kept')::integer <> 3
     OR (v_out->>'night_count')::integer <> 3
     OR (v_out->>'subtotal_minor')::bigint <> 240000
     OR (v_out->>'tax_minor')::bigint <> 30000
     OR (v_out->>'total_minor')::bigint <> 270000 THEN
    RAISE EXCEPTION 'FAIL 12a: frozen type change wrong -- %',
      v_out - 'nights' - 'before' - 'after';
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = v_id;

  IF v_row.room_type_id <> 'd1d1d1d1-0000-4000-8000-000000000002'
     OR v_row.rate_plan_id IS DISTINCT FROM v_suite_plan
     OR v_row.room_id IS NOT NULL
     OR v_row.total_amount <> 2700.00 THEN
    RAISE EXCEPTION 'FAIL 12b: booking row wrong -- type %, plan %, room %, total %',
      v_row.room_type_id, v_row.rate_plan_id, v_row.room_id, v_row.total_amount;
  END IF;

  SELECT count(*) FILTER (
           WHERE source <> 'manual' OR rate_minor <> 40000
              OR rate_plan_id IS DISTINCT FROM v_suite_plan)
    INTO v_off FROM public.booking_nights WHERE booking_id = v_id;

  IF v_off <> 0 THEN
    RAISE EXCEPTION 'FAIL 12c: % night(s) not frozen as manual on the suite plan', v_off;
  END IF;

  RAISE NOTICE 'PASS 12: keep_rates freezes the agreed price through a type change';
END;
$$;

-- =============================================================================
-- 13. Two boundaries of the flag. (a) It is the one value-read key, so a
--     non-boolean is a caller bug named invalid_payload -- and the booking is
--     untouched. (b) The freeze is one move, not a permanent state: a later
--     plain reprice re-resolves the hand-priced rows back onto the plan's
--     rates, because a type change re-resolves every night.
-- =============================================================================
DO $$
DECLARE
  v_id           uuid := (SELECT v FROM reprice_ids WHERE k = 'b1');
  v_detail       text;
  v_before_row   jsonb;
  v_after_row    jsonb;
  v_before_night text;
  v_after_night  text;
  v_out          jsonb;
  v_off          integer;
  v_double_plan  uuid;
BEGIN
  SELECT to_jsonb(b) INTO v_before_row FROM public.bookings b WHERE b.id = v_id;
  SELECT string_agg(row_to_json(bn)::text, '|' ORDER BY bn.stay_date)
    INTO v_before_night
  FROM public.booking_nights bn WHERE bn.booking_id = v_id;

  BEGIN
    PERFORM public.reprice_booking_stay(jsonb_build_object(
      'booking_id', v_id,
      'hotel_id',   'd0d0d0d0-0000-4000-8000-00000000000a',
      'keep_rates', 'yes'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  SELECT to_jsonb(b) INTO v_after_row FROM public.bookings b WHERE b.id = v_id;
  SELECT string_agg(row_to_json(bn)::text, '|' ORDER BY bn.stay_date)
    INTO v_after_night
  FROM public.booking_nights bn WHERE bn.booking_id = v_id;

  IF v_detail IS DISTINCT FROM 'invalid_payload: keep_rates'
     OR v_after_row IS DISTINCT FROM v_before_row
     OR v_after_night IS DISTINCT FROM v_before_night THEN
    RAISE EXCEPTION 'FAIL 13a: non-boolean keep_rates produced % or changed booking', v_detail;
  END IF;

  SELECT rp.id INTO v_double_plan
  FROM public.rate_plans rp
  WHERE rp.hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
    AND rp.room_type_id = 'd1d1d1d1-0000-4000-8000-000000000001'
    AND rp.is_default;

  v_out := public.reprice_booking_stay(jsonb_build_object(
    'booking_id',   v_id,
    'hotel_id',     'd0d0d0d0-0000-4000-8000-00000000000a',
    'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001'));

  IF (v_out->>'type_changed')::boolean IS NOT TRUE
     OR (v_out->>'nights_kept')::integer <> 0
     OR (v_out->>'total_minor')::bigint <> 270000 THEN
    RAISE EXCEPTION 'FAIL 13b: thaw wrong -- %', v_out - 'nights' - 'before' - 'after';
  END IF;

  SELECT count(*) FILTER (
           WHERE source <> 'base' OR rate_minor <> 40000
              OR rate_plan_id IS DISTINCT FROM v_double_plan)
    INTO v_off FROM public.booking_nights WHERE booking_id = v_id;

  IF v_off <> 0 THEN
    RAISE EXCEPTION 'FAIL 13c: % night(s) stayed frozen after a plain reprice', v_off;
  END IF;

  RAISE NOTICE 'PASS 13: a non-boolean keep_rates rejects by name, and a later reprice thaws the freeze';
END;
$$;

ROLLBACK;
