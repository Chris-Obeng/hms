-- Regression probe: one selected rate plan governs booking, nights, and restrictions.
-- Run after migrations; transaction always rolls back.
BEGIN;
\set ON_ERROR_STOP on

\set hotel 'e0e0e0e0-0000-4000-8000-00000000000a'
\set rt    'e1e1e1e1-0000-4000-8000-000000000001'
\set planD 'e2e2e2e2-0000-4000-8000-000000000001'
\set planS 'e2e2e2e2-0000-4000-8000-000000000002'

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency, settings)
VALUES (:'hotel', 'plan-authority-probe', 'Plan Authority Probe',
        'org_plan_authority_probe', 'GHS', '{}'::jsonb);

INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children)
VALUES (:'rt', :'hotel', 'Plan Double', 'plan-double', 500.00, 500.00, 2, 2);

INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status)
SELECT :'hotel', :'rt', 'P-' || g, 'available'
FROM generate_series(1, 8) AS g;

UPDATE public.rate_plans
SET id = :'planD', title = 'Default', code = 'PDEF', currency = 'GHS'
WHERE hotel_id = :'hotel' AND room_type_id = :'rt' AND is_default;

INSERT INTO public.rate_plans
  (id, hotel_id, room_type_id, title, code, currency, is_default, is_active)
VALUES (:'planS', :'hotel', :'rt', 'Selected', 'PSEL', 'GHS', false, true);

-- Resolver must return one selected-plan row for every requested night.
DO $$
DECLARE
  v_count integer;
  v_dates integer;
  v_plans integer;
BEGIN
  SELECT count(*)::integer,
         count(DISTINCT r.stay_date)::integer,
         count(*) FILTER (
           WHERE r.rate_plan_id IS DISTINCT FROM
             'e2e2e2e2-0000-4000-8000-000000000002'::uuid)::integer
    INTO v_count, v_dates, v_plans
    FROM public.resolve_nightly_rates(
      'e0e0e0e0-0000-4000-8000-00000000000a',
      ARRAY['e1e1e1e1-0000-4000-8000-000000000001'::uuid],
      current_date + 90, current_date + 94,
      'e2e2e2e2-0000-4000-8000-000000000002', 0) r;

  IF v_count <> 4 OR v_dates <> 4 OR v_plans <> 0 THEN
    RAISE EXCEPTION 'FAIL 1: resolver returned % rows, % dates, % wrong plans',
      v_count, v_dates, v_plans;
  END IF;
  RAISE NOTICE 'PASS 1: resolver returns one selected-plan row per night';
END $$;

-- Break caught: create_booking_atomic prices selected plan but fails to persist it
-- as booking authority, or writes nights under another plan.
DO $$
DECLARE
  v_out jsonb;
  v_bid uuid;
  v_booking_plan uuid;
  v_bad_nights integer;
BEGIN
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
    'room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
    'rate_plan_id', 'e2e2e2e2-0000-4000-8000-000000000002',
    'check_in', (current_date + 100)::text,
    'check_out', (current_date + 103)::text,
    'guest_name', 'Selected Plan Guest'));
  v_bid := (v_out->>'booking_id')::uuid;

  SELECT b.rate_plan_id INTO v_booking_plan
  FROM public.bookings b WHERE b.id = v_bid;

  SELECT count(*) FILTER (
           WHERE bn.rate_plan_id IS DISTINCT FROM v_booking_plan)
    INTO v_bad_nights
  FROM public.booking_nights bn WHERE bn.booking_id = v_bid;

  IF v_booking_plan IS DISTINCT FROM 'e2e2e2e2-0000-4000-8000-000000000002'
     OR v_bad_nights <> 0 THEN
    RAISE EXCEPTION 'FAIL 2: booking plan %, mismatched nights %',
      v_booking_plan, v_bad_nights;
  END IF;
  RAISE NOTICE 'PASS 2: selected plan is authoritative on booking and nights';
END $$;

-- Explicit unknown plan cannot silently fall back to default.
DO $$
DECLARE
  v_detail text := '<accepted>';
BEGIN
  BEGIN
    PERFORM public.create_booking_atomic(jsonb_build_object(
      'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
      'room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
      'rate_plan_id', 'e2e2e2e2-0000-4000-8000-0000000000ff',
      'check_in', (current_date + 104)::text,
      'check_out', (current_date + 105)::text,
      'guest_name', 'Unknown Plan Guest'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail IS DISTINCT FROM 'rate_plan_not_found' THEN
    RAISE EXCEPTION 'FAIL 3: unknown selected plan produced %', v_detail;
  END IF;
  RAISE NOTICE 'PASS 3: unknown selected plan cannot fall back to default';
END $$;

-- Explicit inactive plan cannot be selected for a new booking.
DO $$
DECLARE
  v_detail text := '<accepted>';
  v_before_bookings bigint;
  v_before_guests bigint;
BEGIN
  SELECT count(*) INTO v_before_bookings FROM public.bookings;
  SELECT count(*) INTO v_before_guests FROM public.guests;
  UPDATE public.rate_plans SET is_active = false
  WHERE id = 'e2e2e2e2-0000-4000-8000-000000000002';

  BEGIN
    PERFORM public.create_booking_atomic(jsonb_build_object(
      'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
      'room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
      'rate_plan_id', 'e2e2e2e2-0000-4000-8000-000000000002',
      'check_in', (current_date + 105)::text,
      'check_out', (current_date + 106)::text,
      'guest_name', 'Inactive Plan Guest'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail IS DISTINCT FROM 'rate_plan_not_found'
     OR (SELECT count(*) FROM public.bookings) <> v_before_bookings
     OR (SELECT count(*) FROM public.guests) <> v_before_guests THEN
    RAISE EXCEPTION 'FAIL 4: inactive selected plan produced % or wrote rows', v_detail;
  END IF;

  UPDATE public.rate_plans SET is_active = true
  WHERE id = 'e2e2e2e2-0000-4000-8000-000000000002';
  RAISE NOTICE 'PASS 4: inactive plan cannot be selected for creation';
END $$;

-- Missing pricing must be rejected before any booking or guest is written.
DO $$
DECLARE
  v_detail text := '<accepted>';
  v_before_bookings bigint;
  v_before_guests bigint;
BEGIN
  SELECT count(*) INTO v_before_bookings FROM public.bookings;
  SELECT count(*) INTO v_before_guests FROM public.guests;

  UPDATE public.room_types SET base_price = 0, weekend_price = 0
  WHERE id = 'e1e1e1e1-0000-4000-8000-000000000001';

  BEGIN
    PERFORM public.create_booking_atomic(jsonb_build_object(
      'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
      'room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
      'rate_plan_id', 'e2e2e2e2-0000-4000-8000-000000000002',
      'check_in', (current_date + 105)::text,
      'check_out', (current_date + 107)::text,
      'guest_name', 'Unpriced Guest'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail IS DISTINCT FROM 'unpriced_stay'
     OR (SELECT count(*) FROM public.bookings) <> v_before_bookings
     OR (SELECT count(*) FROM public.guests) <> v_before_guests THEN
    RAISE EXCEPTION 'FAIL 5: incomplete pricing produced % or wrote rows', v_detail;
  END IF;

  UPDATE public.room_types SET base_price = 500, weekend_price = 500
  WHERE id = 'e1e1e1e1-0000-4000-8000-000000000001';
  RAISE NOTICE 'PASS 5: incomplete pricing is rejected without writes';
END $$;

-- Exact date-set validation seam: transaction-local temp overload shadows only
-- calls that explicitly opt into pg_temp. Production privileges stay unchanged.
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

-- Duplicate first date masks missing second date while total row count stays exact.
DO $$
DECLARE
  v_detail text := '<accepted>';
  v_before_bookings bigint;
  v_before_guests bigint;
BEGIN
  SELECT count(*) INTO v_before_bookings FROM public.bookings;
  SELECT count(*) INTO v_before_guests FROM public.guests;
  PERFORM set_config('roomline.rate_resolver',
                     'pg_temp.malformed_nightly_rates', true);

  BEGIN
    PERFORM public.create_booking_atomic(jsonb_build_object(
      'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
      'room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
      'rate_plan_id', 'e2e2e2e2-0000-4000-8000-000000000002',
      'check_in', (current_date + 108)::text,
      'check_out', (current_date + 111)::text,
      'guest_name', 'Malformed Resolver Guest'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;
  PERFORM set_config('roomline.rate_resolver', '', true);

  IF v_detail IS DISTINCT FROM 'unpriced_stay'
     OR (SELECT count(*) FROM public.bookings) <> v_before_bookings
     OR (SELECT count(*) FROM public.guests) <> v_before_guests THEN
    RAISE EXCEPTION 'FAIL 6: malformed date set produced % or wrote rows', v_detail;
  END IF;
  RAISE NOTICE 'PASS 6: creation rejects duplicate/missing resolver dates without writes';
END $$;

INSERT INTO public.rate_restrictions
  (hotel_id, rate_plan_id, date, closed_to_arrival, closed_to_departure,
   min_stay, max_stay)
VALUES
  (:'hotel', :'planS', current_date + 110, true,  false, NULL, NULL),
  (:'hotel', :'planS', current_date + 122, false, true,  NULL, NULL),
  (:'hotel', :'planS', current_date + 130, false, false, 3,    NULL),
  (:'hotel', :'planS', current_date + 140, false, false, NULL, 2);

-- Break caught: booking trigger independently chooses default plan instead of
-- checking selected plan. Default plan must remain sellable on same dates.
DO $$
DECLARE
  v record;
  v_detail text;
  v_hint text;
  v_default jsonb;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('closed_to_arrival', current_date + 110, current_date + 112),
      ('closed_to_departure', current_date + 120, current_date + 122),
      ('min_stay', current_date + 130, current_date + 132),
      ('max_stay', current_date + 140, current_date + 143)
    ) AS x(code, check_in, check_out)
  LOOP
    v_detail := '<accepted>';
    v_hint := NULL;
    BEGIN
      PERFORM public.create_booking_atomic(jsonb_build_object(
        'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
        'room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
        'rate_plan_id', 'e2e2e2e2-0000-4000-8000-000000000002',
        'check_in', v.check_in::text, 'check_out', v.check_out::text,
        'guest_name', 'Restricted ' || v.code));
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL,
                              v_hint = PG_EXCEPTION_HINT;
    END;

    IF v_detail IS DISTINCT FROM 'stay_restrictions'
       OR split_part(COALESCE(v_hint, ''), ':', 1) <> v.code THEN
      RAISE EXCEPTION 'FAIL 7: % selected plan produced % / %',
        v.code, v_detail, v_hint;
    END IF;

    v_default := public.create_booking_atomic(jsonb_build_object(
      'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
      'room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
      'rate_plan_id', 'e2e2e2e2-0000-4000-8000-000000000001',
      'check_in', v.check_in::text, 'check_out', v.check_out::text,
      'guest_name', 'Default ' || v.code));

    IF v_default->>'booking_id' IS NULL THEN
      RAISE EXCEPTION 'FAIL 7: default plan was not sellable for %', v.code;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 7: restrictions apply only to selected plan';
END $$;

ROLLBACK;
