-- =============================================================================
-- Regression probe: a reservation is written in one transaction, the money on
-- public.bookings equals the money in public.booking_nights by construction,
-- and an aborted payment hold leaves nothing behind.
--
-- Run against a database with the migrations applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/create_booking_atomic.sql
--
-- One transaction, always rolled back, so it is safe against a local stack and
-- leaves no rows behind. Exit code 0 with the PASS notices means the two
-- functions behave; any FAIL raises and aborts, and ON_ERROR_STOP turns that
-- into a non-zero exit.
--
-- weekend_price is deliberately set equal to base_price so the expected figures
-- do not depend on which weekday the probe happens to run on.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on

\set hotel 'c0c0c0c0-0000-4000-8000-00000000000a'
\set rt    'c1c1c1c1-0000-4000-8000-000000000001'
\set rtz   'c1c1c1c1-0000-4000-8000-000000000002'
\set rmA   'c2c2c2c2-0000-4000-8000-00000000000a'
\set rmB   'c2c2c2c2-0000-4000-8000-00000000000b'

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency, settings) VALUES
  (:'hotel', 'atomic-probe', 'Atomic Probe', 'org_atomic_probe', 'GHS',
   jsonb_build_object('tax_enabled', true, 'tax_percentage', 12.5));

INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  (:'rt',  :'hotel', 'Atomic Double', 'atomic-double', 450.00, 450.00, 2, 2),
  (:'rtz', :'hotel', 'Atomic Comped', 'atomic-comped',      0,      0, 2, 0);

INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number, status) VALUES
  (:'rmA', :'hotel', :'rt', 'A-101', 'available'),
  (:'rmB', :'hotel', :'rt', 'A-102', 'available');

-- The comped type needs sellable inventory too, otherwise the availability gate
-- fires before the unpriced-stay gate this probe means to exercise.
INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status) VALUES
  (:'hotel', :'rtz', 'Z-101', 'available');

-- -----------------------------------------------------------------------------
-- 1. The happy path: one call writes the booking and its nights, and the two
--    agree to the minor unit.
--
--    450.00 GHS a night, 3 nights, 2 rooms, 12.5% tax:
--      subtotal 2700.00, tax 337.50, total 3037.50, room_rate 450.00
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_out     jsonb;
  v_bid     uuid;
  v_nights  integer;
  v_sum     bigint;
  v_row     public.bookings;
BEGIN
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',           'c0c0c0c0-0000-4000-8000-00000000000a',
    'room_type_id',       'c1c1c1c1-0000-4000-8000-000000000001',
    'check_in',           (current_date + 10)::text,
    'check_out',          (current_date + 13)::text,
    'adults',             2,
    'rooms_count',        2,
    'guest_name',         'Ama Mensah',
    'guest_email',        'Ama@Example.test',
    'guest_phone',        '+233200000001',
    'status',             'pending',
    'payment_status',     'unpaid',
    'payment_preference', 'pay_now',
    'estimated_arrival',  '2:30 PM',
    'reference_prefix',   'AP'));
  -- The prefix is accepted and ignored: generate_booking_reference() has issued
  -- 6-character references since 20261114140000. Asserted so the format is
  -- pinned rather than assumed.

  v_bid := (v_out->>'booking_id')::uuid;
  SELECT * INTO v_row FROM public.bookings WHERE id = v_bid;

  IF v_row.subtotal <> 2700.00 OR v_row.tax_amount <> 337.50
     OR v_row.total_amount <> 3037.50 OR v_row.room_rate <> 450.00 THEN
    RAISE EXCEPTION 'FAIL 1a: money wrong — subtotal %, tax %, total %, rate %',
      v_row.subtotal, v_row.tax_amount, v_row.total_amount, v_row.room_rate;
  END IF;

  -- generate_booking_reference accepts a prefix argument and ignores it: the body
  -- draws a random 6-character code until it is unused within the hotel, using
  -- only 23456789BCDFGHJKMNPQRSTVWXYZ. Assert that shape to keep the contract pinned.
  IF v_row.nights <> 3 OR v_row.outstanding_balance <> 3037.50
     OR v_row.currency <> 'GHS' OR v_row.estimated_arrival <> '14:30'::time
     OR v_row.reference !~ '^[23456789BCDFGHJKMNPQRSTVWXYZ]{6}$' OR v_row.room_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1b: booking shape wrong — % / % / % / %',
      v_row.nights, v_row.outstanding_balance, v_row.estimated_arrival, v_row.reference;
  END IF;

  SELECT count(*)::integer, sum(bn.rate_minor * bn.rooms_count)
    INTO v_nights, v_sum
    FROM public.booking_nights bn WHERE bn.booking_id = v_bid;

  IF v_nights <> 3 OR v_sum <> public.to_minor(v_row.subtotal, 'GHS') THEN
    RAISE EXCEPTION 'FAIL 1c: nights % rows summing % do not match subtotal %',
      v_nights, v_sum, v_row.subtotal;
  END IF;

  IF jsonb_array_length(v_out->'nights') <> 3
     OR (v_out->>'total_minor')::bigint <> 303750 THEN
    RAISE EXCEPTION 'FAIL 1d: returned payload wrong — %', v_out;
  END IF;

  RAISE NOTICE 'PASS 1: one call writes booking and nights that agree to the minor unit';
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Rejections. Every one must raise its own machine code, and none may leave
--    a guest or a booking behind — the whole point of one transaction.
--
--    The outcome is collected in a variable rather than raised inside the block:
--    a bare RAISE EXCEPTION is itself P0001 and would be caught by this very
--    handler, turning a real failure into a confusing one.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_base   jsonb := jsonb_build_object(
    'hotel_id',     'c0c0c0c0-0000-4000-8000-00000000000a',
    'room_type_id', 'c1c1c1c1-0000-4000-8000-000000000001',
    'check_in',     (current_date + 40)::text,
    'check_out',    (current_date + 42)::text,
    'guest_name',   'Reject Probe',
    'guest_email',  'reject@example.test');
  v_case   text;
  v_detail text;
  v_before bigint;
  v_after  bigint;
BEGIN
  SELECT count(*) INTO v_before FROM public.guests
   WHERE hotel_id = 'c0c0c0c0-0000-4000-8000-00000000000a';

  FOREACH v_case IN ARRAY ARRAY[
    'invalid_date_range', 'no_availability', 'unpriced_stay',
    'room_not_bookable', 'invalid_estimated_arrival'
  ] LOOP
    v_detail := '<accepted>';
    BEGIN
      PERFORM public.create_booking_atomic(
        CASE v_case
          WHEN 'invalid_date_range' THEN
            v_base || jsonb_build_object('check_out', (current_date + 40)::text)
          WHEN 'no_availability' THEN
            v_base || jsonb_build_object('rooms_count', 3)
          WHEN 'unpriced_stay' THEN
            v_base || jsonb_build_object('room_type_id', 'c1c1c1c1-0000-4000-8000-000000000002')
          WHEN 'room_not_bookable' THEN
            v_base || jsonb_build_object('room_id', gen_random_uuid()::text)
          ELSE
            v_base || jsonb_build_object('estimated_arrival', 'sometime after lunch')
        END);
    EXCEPTION WHEN sqlstate 'P0001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    END;

    IF v_detail IS DISTINCT FROM v_case THEN
      RAISE EXCEPTION 'FAIL 2: % produced %', v_case, COALESCE(v_detail, '<no detail>');
    END IF;
  END LOOP;

  SELECT count(*) INTO v_after FROM public.guests
   WHERE hotel_id = 'c0c0c0c0-0000-4000-8000-00000000000a';
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FAIL 2: rejections left % orphan guest row(s) behind', v_after - v_before;
  END IF;

  RAISE NOTICE 'PASS 2: five rejections raise their own code and create no orphan guests';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Room assignment: the staff path gets a free room picked for it, and asking
--    for an occupied room is refused with the occupant named in the hint.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_out    jsonb;
  v_detail text;
  v_hint   text;
BEGIN
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'c0c0c0c0-0000-4000-8000-00000000000a',
    'room_type_id', 'c1c1c1c1-0000-4000-8000-000000000001',
    'check_in',     (current_date + 20)::text,
    'check_out',    (current_date + 22)::text,
    'guest_name',   'Kojo Boateng',
    'guest_email',  'kojo@example.test',
    'source',       'walk_in',
    'assign_room',  true));

  IF (v_out->>'room_id')::uuid <> 'c2c2c2c2-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'FAIL 3a: expected room A-101, got %', v_out->>'room_id';
  END IF;

  v_detail := '<accepted>';
  BEGIN
    PERFORM public.create_booking_atomic(jsonb_build_object(
      'hotel_id',     'c0c0c0c0-0000-4000-8000-00000000000a',
      'room_type_id', 'c1c1c1c1-0000-4000-8000-000000000001',
      'check_in',     (current_date + 21)::text,
      'check_out',    (current_date + 23)::text,
      'guest_name',   'Yaa Asantewaa',
      'room_id',      'c2c2c2c2-0000-4000-8000-00000000000a'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  END;

  IF v_detail <> 'room_conflict' OR v_hint <> 'Kojo Boateng' THEN
    RAISE EXCEPTION 'FAIL 3b: overlapping room gave % / %', v_detail, v_hint;
  END IF;

  RAISE NOTICE 'PASS 3: a free room is assigned and an occupied one is refused by name';
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Aborting a hold: the booking, its nights and the guest it created all go,
--    one audit row explains why, a second call is a no-op, and a guest with
--    another reservation survives.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_one   jsonb;
  v_two   jsonb;
  v_gid   uuid;
  v_audit jsonb;
  v_n     bigint;
BEGIN
  v_one := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'c0c0c0c0-0000-4000-8000-00000000000a',
    'room_type_id', 'c1c1c1c1-0000-4000-8000-000000000001',
    'check_in',     (current_date + 60)::text,
    'check_out',    (current_date + 62)::text,
    'guest_name',   'Hold Probe',
    'guest_email',  'hold@example.test'));

  v_gid := (v_one->>'guest_id')::uuid;
  IF (v_one->>'guest_created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 4a: first booking should have created the guest';
  END IF;

  PERFORM public.abort_unpaid_booking((v_one->>'booking_id')::uuid, 'paystack_init_failed');

  SELECT count(*) INTO v_n FROM public.bookings WHERE id = (v_one->>'booking_id')::uuid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 4b: booking survived the abort'; END IF;

  SELECT count(*) INTO v_n FROM public.booking_nights
   WHERE booking_id = (v_one->>'booking_id')::uuid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 4c: % night row(s) survived the abort', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.guests WHERE id = v_gid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 4d: the created guest survived the abort'; END IF;

  SELECT a.after_state INTO v_audit FROM public.audit_logs a
   WHERE a.entity_id = (v_one->>'booking_id')::uuid
     AND a.action = 'booking.aborted_unpaid';
  IF v_audit IS NULL OR v_audit->>'reason' <> 'paystack_init_failed'
     OR (v_audit->>'nights_deleted')::integer <> 2
     OR (v_audit->>'guest_deleted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 4e: audit row wrong — %', v_audit;
  END IF;

  -- Idempotent: a retrying caller must not be handed an error.
  PERFORM public.abort_unpaid_booking((v_one->>'booking_id')::uuid, 'retry');

  -- A guest with a second reservation is not collateral damage.
  v_one := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'c0c0c0c0-0000-4000-8000-00000000000a',
    'room_type_id', 'c1c1c1c1-0000-4000-8000-000000000001',
    'check_in',     (current_date + 70)::text,
    'check_out',    (current_date + 71)::text,
    'guest_name',   'Shared Guest',
    'guest_email',  'shared@example.test'));
  v_two := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'c0c0c0c0-0000-4000-8000-00000000000a',
    'room_type_id', 'c1c1c1c1-0000-4000-8000-000000000001',
    'check_in',     (current_date + 80)::text,
    'check_out',    (current_date + 81)::text,
    'guest_name',   'Shared Guest',
    'guest_email',  'SHARED@example.test'));

  IF v_two->>'guest_id' <> v_one->>'guest_id'
     OR (v_two->>'guest_created')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 4f: the second booking did not reuse the guest';
  END IF;

  PERFORM public.abort_unpaid_booking((v_two->>'booking_id')::uuid, 'paystack_init_failed');
  SELECT count(*) INTO v_n FROM public.guests WHERE id = (v_one->>'guest_id')::uuid;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 4g: a guest with another booking was deleted'; END IF;

  RAISE NOTICE 'PASS 4: an aborted hold leaves no booking, no nights, no orphan guest';
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. A booking that has taken money is a refund problem, not a delete problem.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_out    jsonb;
  v_detail text;
  v_n      bigint;
BEGIN
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'c0c0c0c0-0000-4000-8000-00000000000a',
    'room_type_id', 'c1c1c1c1-0000-4000-8000-000000000001',
    'check_in',     (current_date + 90)::text,
    'check_out',    (current_date + 91)::text,
    'guest_name',   'Paid Probe',
    'guest_email',  'paid@example.test'));

  UPDATE public.bookings SET amount_paid = 100.00, payment_status = 'partial'
   WHERE id = (v_out->>'booking_id')::uuid;

  v_detail := '<accepted>';
  BEGIN
    PERFORM public.abort_unpaid_booking((v_out->>'booking_id')::uuid, 'should_refuse');
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail <> 'booking_paid' THEN
    RAISE EXCEPTION 'FAIL 5a: aborting a paid booking gave %', v_detail;
  END IF;

  SELECT count(*) INTO v_n FROM public.bookings WHERE id = (v_out->>'booking_id')::uuid;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 5b: the paid booking was deleted anyway'; END IF;

  RAISE NOTICE 'PASS 5: a paid booking cannot be aborted';
END;
$$;

ROLLBACK;
