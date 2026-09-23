-- =============================================================================
-- Regression probe: which date each rate restriction is evaluated against, and
-- who the bookings guard refuses.
--
-- Run against a database with the migrations applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rate_restrictions.sql
--
-- One transaction, always rolled back, so it is safe against a local stack and
-- leaves no rows behind. Exit code 0 with the PASS notices means the semantics
-- hold; any FAIL raises and aborts, and ON_ERROR_STOP turns that into a non-zero
-- exit.
--
-- This file is the specification for the evaluation dates. The Channex ARI
-- documentation names the fields but never says which date a restriction is read
-- on, so ours are the OTA convention and are only as durable as these assertions:
-- closed_to_arrival on the check-in date, closed_to_departure on the check-out
-- date (which is not a stay night), min_stay / min_stay_arrival / max_stay on the
-- arrival date, min_stay_through and stop_sell on every night. Getting one of them
-- wrong silently sells or refuses the wrong stay, which is why each has a case
-- here that also proves the neighbouring reading is NOT taken.
--
-- Every window sits at least 100 days out so no seed seasonality reaches it, and
-- weekend_price equals base_price so no expectation depends on the weekday the
-- probe runs on.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on

\set hotel  'd3d3d3d3-0000-4000-8000-00000000000a'
\set rt     'd4d4d4d4-0000-4000-8000-000000000001'
\set rt2    'd4d4d4d4-0000-4000-8000-000000000002'
\set planD  'd5d5d5d5-0000-4000-8000-000000000001'
\set planB  'd5d5d5d5-0000-4000-8000-000000000002'
\set planX  'd5d5d5d5-0000-4000-8000-000000000003'

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency, settings) VALUES
  (:'hotel', 'restrict-probe', 'Restrict Probe', 'org_restrict_probe', 'GHS',
   jsonb_build_object('tax_enabled', true, 'tax_percentage', 12.5));

INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  (:'rt', :'hotel', 'Restrict Double', 'restrict-double', 300.00, 300.00, 2, 2);

INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status) VALUES
  (:'hotel', :'rt', 'R-101', 'available'),
  (:'hotel', :'rt', 'R-102', 'available'),
  (:'hotel', :'rt', 'R-103', 'available'),
  (:'hotel', :'rt', 'R-104', 'available'),
  (:'hotel', :'rt', 'R-105', 'available');

-- Three plans on the one room type, so plan resolution has something to choose
-- between: planD is the default, planB is older but not default, planX is
-- inactive and only reachable by being named explicitly.
--
-- The default one is not inserted: ensure_default_rate_plan on room_types has
-- already created it, and rate_plans_one_default_per_room_type forbids a second.
-- It is renamed onto a fixed id instead so the cases below can be written as
-- literals. Nothing references it yet, so moving the key is free here.
UPDATE public.rate_plans
SET id = :'planD', title = 'Restrict Default', code = 'RSTD', currency = 'GHS'
WHERE hotel_id = :'hotel' AND room_type_id = :'rt';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rate_plans
                 WHERE id = 'd5d5d5d5-0000-4000-8000-000000000001' AND is_default) THEN
    RAISE EXCEPTION 'FIXTURE: the room type has no default rate plan to rename';
  END IF;
END $$;

INSERT INTO public.rate_plans
  (id, hotel_id, room_type_id, title, code, currency, is_default, is_active, created_at) VALUES
  (:'planB', :'hotel', :'rt', 'Restrict Base',     'RSTB', 'GHS', false, true,
   now() - interval '10 days'),
  (:'planX', :'hotel', :'rt', 'Restrict Retired',  'RSTX', 'GHS', false, false,
   now() - interval '20 days');

-- The restriction calendar, all on the default plan. Offsets from today are used
-- rather than literal dates so the probe never falls into the past.
--
--   +100  min_stay 3
--   +110  closed_to_arrival
--   +111  min_stay_arrival 4
--   +112  min_stay_through 5
--   +113  min_stay_through 2   (looser, to prove the strictest night is reported)
--   +120  closed_to_departure
--   +130  stop_sell
--   +140  max_stay 2
--   +141  max_stay 0           (the API's way of clearing the field)
INSERT INTO public.rate_restrictions
  (hotel_id, rate_plan_id, date, min_stay, min_stay_arrival, min_stay_through,
   max_stay, closed_to_arrival, closed_to_departure, stop_sell) VALUES
  (:'hotel', :'planD', current_date + 100,    3, NULL, NULL, NULL, false, false, false),
  (:'hotel', :'planD', current_date + 110, NULL, NULL, NULL, NULL, true,  false, false),
  (:'hotel', :'planD', current_date + 111, NULL,    4, NULL, NULL, false, false, false),
  (:'hotel', :'planD', current_date + 112, NULL, NULL,    5, NULL, false, false, false),
  (:'hotel', :'planD', current_date + 113, NULL, NULL,    2, NULL, false, false, false),
  (:'hotel', :'planD', current_date + 120, NULL, NULL, NULL, NULL, false, true,  false),
  (:'hotel', :'planD', current_date + 130, NULL, NULL, NULL, NULL, false, false, true),
  (:'hotel', :'planD', current_date + 140, NULL, NULL, NULL,    2, false, false, false),
  (:'hotel', :'planD', current_date + 141, NULL, NULL, NULL,    0, false, false, false);

-- ── 0: plan resolution agrees with the pricing function ──────────────────────
--
-- effective_rate_plan_id duplicates the plans LATERAL inside
-- resolve_nightly_rates. If the two ever disagree, a stay would be priced on one
-- plan and restricted by another, so this asserts they pick the same row for all
-- three ways in: nothing named, the non-default named, the inactive one named.
DO $$
DECLARE
  v_helper uuid;
  v_priced uuid;
BEGIN
  FOR v_helper, v_priced IN
    SELECT h.plan, p.rate_plan_id
    FROM (VALUES (NULL::uuid),
                 ('d5d5d5d5-0000-4000-8000-000000000002'::uuid),
                 ('d5d5d5d5-0000-4000-8000-000000000003'::uuid)) AS asked(id)
    CROSS JOIN LATERAL (
      SELECT public.effective_rate_plan_id(
        'd3d3d3d3-0000-4000-8000-00000000000a',
        'd4d4d4d4-0000-4000-8000-000000000001',
        asked.id) AS plan
    ) h
    CROSS JOIN LATERAL (
      SELECT DISTINCT r.rate_plan_id
      FROM public.resolve_nightly_rates(
        'd3d3d3d3-0000-4000-8000-00000000000a',
        ARRAY['d4d4d4d4-0000-4000-8000-000000000001'::uuid],
        current_date + 150, current_date + 153, asked.id, 0::smallint) r
    ) p
  LOOP
    IF v_helper IS DISTINCT FROM v_priced THEN
      RAISE EXCEPTION 'FAIL 0: helper picked %, pricing picked %', v_helper, v_priced;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS 0: effective_rate_plan_id agrees with resolve_nightly_rates';
END $$;

-- Every case below is one window against the default plan, so the call is worth
-- naming once. Offsets from today keep the windows in the future forever.
CREATE FUNCTION pg_temp.probe_v(p_in int, p_out int) RETURNS text[]
LANGUAGE sql STABLE AS $probe$
  SELECT public.stay_restriction_violations(
    'd5d5d5d5-0000-4000-8000-000000000001'::uuid,
    current_date + p_in,
    current_date + p_out);
$probe$;

-- ── 1: the length-of-stay codes ──────────────────────────────────────────────
DO $$
DECLARE
  c      record;
  v_got  text[];
  v_bad  int := 0;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      -- min_stay is read on the arrival date and nowhere else.
      ('1a min_stay short',          100, 102, ARRAY['min_stay:3']),
      ('1b min_stay met exactly',    100, 103, '{}'::text[]),
      ('1c min_stay only on arrival', 99, 102, '{}'::text[]),
      -- min_stay_arrival likewise, and a covered min_stay_through night is not.
      ('1d arrival minimum short',   111, 113,
        ARRAY['min_stay_arrival:4', 'min_stay_through:5']),
      ('1e both minimums met',       111, 116, '{}'::text[]),
      -- min_stay_through is read on every night, and the strictest of the
      -- violating nights is the number reported back.
      ('1f through: strictest wins', 112, 115, ARRAY['min_stay_through:5']),
      ('1g through: looser night',   113, 115, '{}'::text[]),
      ('1h through: departure day is not a night', 109, 112, '{}'::text[]),
      -- max_stay is read on the arrival date; 0 clears it rather than closing it.
      ('1i max_stay exceeded',       140, 143, ARRAY['max_stay:2']),
      ('1j max_stay met exactly',    140, 142, '{}'::text[]),
      ('1k max_stay 0 is no limit',  141, 148, '{}'::text[]),
      ('1l max_stay only on arrival', 139, 143, '{}'::text[])
    ) AS t(label, i, o, want)
  LOOP
    v_got := pg_temp.probe_v(c.i, c.o);
    IF v_got IS DISTINCT FROM c.want THEN
      RAISE WARNING 'FAIL %: got %, want %', c.label, v_got, c.want;
      v_bad := v_bad + 1;
    END IF;
  END LOOP;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL 1: % length-of-stay case(s) wrong', v_bad;
  END IF;
  RAISE NOTICE 'PASS 1: min_stay, min_stay_arrival and max_stay bind on the arrival date, min_stay_through on every night';
END $$;

-- ── 2: the open/closed codes, and the windows that are nobody's business ─────
DO $$
DECLARE
  c      record;
  v_got  text[];
  v_bad  int := 0;
  v_cta  text := to_char(current_date + 110, 'YYYY-MM-DD');
  v_ctd  text := to_char(current_date + 120, 'YYYY-MM-DD');
  v_ss   text := to_char(current_date + 130, 'YYYY-MM-DD');
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      -- closed_to_arrival closes the date to arrivals, not to stays over it.
      ('2a arrives on a closed date', 110, 112, ARRAY['closed_to_arrival:' || v_cta]),
      ('2b passes over it',           109, 111, '{}'::text[]),
      -- closed_to_departure is the one restriction read outside the night range.
      ('2c departs on a closed date', 118, 120, ARRAY['closed_to_departure:' || v_ctd]),
      ('2d stays through it',         119, 122, '{}'::text[]),
      ('2e arrives on it',            120, 122, '{}'::text[]),
      -- stop_sell closes nights. The departure day is not one of them.
      ('2f a stopped night',          128, 132, ARRAY['stop_sell:' || v_ss]),
      ('2g stopped date is the departure day', 128, 130, '{}'::text[]),
      ('2h stopped date is the arrival night', 130, 132, ARRAY['stop_sell:' || v_ss]),
      -- A window that is not a stay is not this function's to judge:
      -- bookings_dates_valid rejects it, and a half-typed date range in a pricing
      -- preview should not come back as a restriction error.
      ('2i zero nights',              150, 150, '{}'::text[]),
      ('2j reversed',                 153, 150, '{}'::text[])
    ) AS t(label, i, o, want)
  LOOP
    v_got := pg_temp.probe_v(c.i, c.o);
    IF v_got IS DISTINCT FROM c.want THEN
      RAISE WARNING 'FAIL %: got %, want %', c.label, v_got, c.want;
      v_bad := v_bad + 1;
    END IF;
  END LOOP;

  -- A room type with no rate plan has no restrictions, not an error.
  IF public.stay_restriction_violations(NULL, current_date + 100, current_date + 102)
     IS DISTINCT FROM '{}'::text[] THEN
    RAISE WARNING 'FAIL 2k: a null rate plan produced violations';
    v_bad := v_bad + 1;
  END IF;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL 2: % open/closed case(s) wrong', v_bad;
  END IF;
  RAISE NOTICE 'PASS 2: closed_to_arrival binds the check-in date, closed_to_departure the check-out date, stop_sell every night';
END $$;

-- ── 3: the table refuses rows that would contradict themselves ───────────────
DO $$
DECLARE
  v_bad int := 0;
  v_con text;
BEGIN
  -- min_stay is Channex's virtual field: a value there is translated into one of
  -- the two specific fields, so holding all three at once is a contradiction
  -- rather than a stricter rule.
  BEGIN
    INSERT INTO public.rate_restrictions (hotel_id, rate_plan_id, date, min_stay, min_stay_arrival)
    VALUES ('d3d3d3d3-0000-4000-8000-00000000000a',
            'd5d5d5d5-0000-4000-8000-000000000001', current_date + 200, 3, 2);
    RAISE WARNING 'FAIL 3a: min_stay accepted alongside min_stay_arrival';
    v_bad := v_bad + 1;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    IF v_con <> 'rate_restrictions_min_stay_exclusive' THEN
      RAISE WARNING 'FAIL 3a: wrong constraint -- %', v_con;
      v_bad := v_bad + 1;
    END IF;
  END;

  -- A zero minimum is a null minimum written badly; 1 is the floor the API states.
  BEGIN
    INSERT INTO public.rate_restrictions (hotel_id, rate_plan_id, date, min_stay)
    VALUES ('d3d3d3d3-0000-4000-8000-00000000000a',
            'd5d5d5d5-0000-4000-8000-000000000001', current_date + 201, 0);
    RAISE WARNING 'FAIL 3b: min_stay 0 accepted';
    v_bad := v_bad + 1;
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.rate_restrictions (hotel_id, rate_plan_id, date, max_stay)
    VALUES ('d3d3d3d3-0000-4000-8000-00000000000a',
            'd5d5d5d5-0000-4000-8000-000000000001', current_date + 202, -1);
    RAISE WARNING 'FAIL 3c: negative max_stay accepted';
    v_bad := v_bad + 1;
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- One row per plan per date, so a channel push has one truth to project.
  BEGIN
    INSERT INTO public.rate_restrictions (hotel_id, rate_plan_id, date, stop_sell)
    VALUES ('d3d3d3d3-0000-4000-8000-00000000000a',
            'd5d5d5d5-0000-4000-8000-000000000001', current_date + 130, true);
    RAISE WARNING 'FAIL 3d: a second row for the same plan and date was accepted';
    v_bad := v_bad + 1;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL 3: % constraint case(s) wrong', v_bad;
  END IF;
  RAISE NOTICE 'PASS 3: contradictory and duplicate restriction rows are rejected';
END $$;

-- ── 4: who the guard refuses ─────────────────────────────────────────────────
--
-- Written through create_booking_atomic rather than by hand, because that is the
-- only path that inserts a bookings row in production and because it also proves
-- the ordering: the read-only restriction check has to reject before
-- bookings_room_type_inventory_guard takes its advisory lock.
DO $$
DECLARE
  v_out    jsonb;
  v_bad    int := 0;
  v_state  text;
  v_detail text;
  v_hint   text;
  v_con    text;
  v_clean  uuid;
BEGIN
  -- A public booking over a three-night minimum -- no created_by, so nobody at
  -- the hotel signed for it -- is refused, and the rejection
  -- carries the machine code in DETAIL and the reason in HINT so the widget can
  -- say what is actually wrong.
  BEGIN
    v_out := public.create_booking_atomic(jsonb_build_object(
      'hotel_id',     'd3d3d3d3-0000-4000-8000-00000000000a',
      'room_type_id', 'd4d4d4d4-0000-4000-8000-000000000001',
      'check_in',     (current_date + 100)::text,
      'check_out',    (current_date + 102)::text,
      'adults', 2, 'rooms_count', 1, 'status', 'pending', 'source', 'direct',
      'guest_name', 'Ama Serwaa', 'guest_email', 'ama@example.test',
      'guest_phone', '+233200000201'));
    RAISE WARNING 'FAIL 4a: a direct booking cleared a three-night minimum';
    v_bad := v_bad + 1;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE,
                            v_detail = PG_EXCEPTION_DETAIL,
                            v_hint = PG_EXCEPTION_HINT,
                            v_con = CONSTRAINT_NAME;
    IF v_state <> '23514' OR v_detail <> 'stay_restrictions'
       OR v_con <> 'bookings_restrictions_guard' OR v_hint <> 'min_stay:3' THEN
      RAISE WARNING 'FAIL 4a: rejection shape wrong -- % / % / % / %',
        v_state, v_detail, v_con, v_hint;
      v_bad := v_bad + 1;
    END IF;
  END;

  -- The same stay taken at the counter goes through. Restrictions are a
  -- distribution control, not a house rule.
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'd3d3d3d3-0000-4000-8000-00000000000a',
    'room_type_id', 'd4d4d4d4-0000-4000-8000-000000000001',
    'check_in',     (current_date + 100)::text,
    'check_out',    (current_date + 102)::text,
    'adults', 2, 'rooms_count', 1, 'status', 'confirmed', 'source', 'walk_in',
    'guest_name', 'Kwesi Mensah', 'guest_email', 'kwesi@example.test',
    'guest_phone', '+233200000202'));
  IF (v_out->>'booking_id') IS NULL THEN
    RAISE WARNING 'FAIL 4b: a walk-in booking was refused';
    v_bad := v_bad + 1;
  END IF;

  -- An unrestricted window is untouched by any of this.
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'd3d3d3d3-0000-4000-8000-00000000000a',
    'room_type_id', 'd4d4d4d4-0000-4000-8000-000000000001',
    'check_in',     (current_date + 150)::text,
    'check_out',    (current_date + 153)::text,
    'adults', 2, 'rooms_count', 1, 'status', 'confirmed', 'source', 'direct',
    'guest_name', 'Nana Adjei', 'guest_email', 'nana@example.test',
    'guest_phone', '+233200000203'));
  v_clean := (v_out->>'booking_id')::uuid;
  IF v_clean IS NULL THEN
    RAISE WARNING 'FAIL 4c: a direct booking on a clear window was refused';
    v_bad := v_bad + 1;
  END IF;

  -- And the guard is INSERT-only: once a reservation exists, staff can move it
  -- into a restricted window, because every path that updates a booking is
  -- staff-initiated and a restriction set after the fact must not freeze a stay
  -- the front desk needs to move.
  BEGIN
    UPDATE public.bookings
    SET check_in = current_date + 100, check_out = current_date + 102
    WHERE id = v_clean;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    RAISE WARNING 'FAIL 4d: an update into a restricted window was refused by %', v_con;
    v_bad := v_bad + 1;
  END;

  -- A desk booking recorded against the website channel is signed for by the
  -- staff profile that took it, and created_by is what the trigger reads to tell
  -- the two apart. It has to go through, or a manager could never sell a
  -- restricted stay -- that decision is gated on the actor role and audited in
  -- app/actions/bookings.ts, not here.
  INSERT INTO public.staff_profiles (id, clerk_user_id, clerk_org_id, email, role)
  VALUES ('d5d5d5d5-0000-4000-8000-00000000000f',
          'user_probe_restrictions', 'org_probe_restrictions',
          'manager@example.test', 'manager');

  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'd3d3d3d3-0000-4000-8000-00000000000a',
    'room_type_id', 'd4d4d4d4-0000-4000-8000-000000000001',
    'check_in',     (current_date + 100)::text,
    'check_out',    (current_date + 102)::text,
    'adults', 2, 'rooms_count', 1, 'status', 'confirmed', 'source', 'direct',
    'created_by',   'd5d5d5d5-0000-4000-8000-00000000000f',
    'guest_name', 'Efua Boateng', 'guest_email', 'efua@example.test',
    'guest_phone', '+233200000204'));
  IF (v_out->>'booking_id') IS NULL THEN
    RAISE WARNING 'FAIL 4e: a staff-attributed direct booking was refused';
    v_bad := v_bad + 1;
  END IF;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL 4: % guard case(s) wrong', v_bad;
  END IF;
  RAISE NOTICE 'PASS 4: the guard refuses an unattributed direct insert only, with the code in DETAIL and the reason in HINT';
END $$;

-- A second room type, with no restrictions of its own, so the batch read has to
-- prove it answers per room type: one closed room must not close the hotel. Its
-- default plan comes from ensure_default_rate_plan, same as the first.
INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  (:'rt2', :'hotel', 'Restrict Single', 'restrict-single', 200.00, 200.00, 1, 0);

-- 5. room_type_stay_restrictions: the widget's one round trip
--
-- It must agree with the scalar function per room type, resolve each room type's
-- own plan, and return nothing for ids that are not this hotel's.
DO $$
DECLARE
  v_bad  int := 0;
  v_rows int;
  c      record;
BEGIN
  -- 5a: one row per requested room type, each carrying its own plan, and the
  -- restricted room type closed while the unrestricted one stays sellable.
  FOR c IN
    SELECT * FROM public.room_type_stay_restrictions(
      'd3d3d3d3-0000-4000-8000-00000000000a',
      ARRAY['d4d4d4d4-0000-4000-8000-000000000001'::uuid,
            'd4d4d4d4-0000-4000-8000-000000000002'::uuid],
      current_date + 100, current_date + 102)
  LOOP
    IF c.room_type_id = 'd4d4d4d4-0000-4000-8000-000000000001' THEN
      IF c.rate_plan_id IS DISTINCT FROM 'd5d5d5d5-0000-4000-8000-000000000001'::uuid
         OR c.violations IS DISTINCT FROM ARRAY['min_stay:3'] THEN
        RAISE WARNING 'FAIL 5a: restricted room type gave plan % violations %',
          c.rate_plan_id, c.violations;
        v_bad := v_bad + 1;
      END IF;
    ELSE
      IF c.rate_plan_id IS NULL OR c.violations <> '{}'::text[] THEN
        RAISE WARNING 'FAIL 5a: unrestricted room type gave plan % violations %',
          c.rate_plan_id, c.violations;
        v_bad := v_bad + 1;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_rows
  FROM public.room_type_stay_restrictions(
    'd3d3d3d3-0000-4000-8000-00000000000a',
    ARRAY['d4d4d4d4-0000-4000-8000-000000000001'::uuid,
          'd4d4d4d4-0000-4000-8000-000000000002'::uuid],
    current_date + 100, current_date + 102);
  IF v_rows <> 2 THEN
    RAISE WARNING 'FAIL 5a: expected 2 rows, got %', v_rows;
    v_bad := v_bad + 1;
  END IF;

  -- 5b: the batch answer is the scalar answer, window by window, so the widget
  -- and the INSERT guard can never disagree about the same stay.
  FOR c IN
    SELECT * FROM (VALUES
      ('5c short',   100, 102),
      ('5c clear',   100, 103),
      ('5c arrival', 110, 112),
      ('5c through', 112, 115),
      ('5c stopped', 128, 132),
      ('5c long',    140, 143)
    ) AS t(label, i, o)
  LOOP
    IF (SELECT violations FROM public.room_type_stay_restrictions(
          'd3d3d3d3-0000-4000-8000-00000000000a',
          ARRAY['d4d4d4d4-0000-4000-8000-000000000001'::uuid],
          current_date + c.i, current_date + c.o))
       IS DISTINCT FROM pg_temp.probe_v(c.i, c.o)
    THEN
      RAISE WARNING 'FAIL %: batch and scalar disagree', c.label;
      v_bad := v_bad + 1;
    END IF;
  END LOOP;

  -- 5d: a room type of another hotel is absent rather than an error, so a
  -- tampered id in the widget's query string reveals nothing about it.
  SELECT count(*) INTO v_rows
  FROM public.room_type_stay_restrictions(
    'd3d3d3d3-0000-4000-8000-00000000000b',
    ARRAY['d4d4d4d4-0000-4000-8000-000000000001'::uuid],
    current_date + 100, current_date + 102);
  IF v_rows <> 0 THEN
    RAISE WARNING 'FAIL 5d: a foreign hotel id returned % row(s)', v_rows;
    v_bad := v_bad + 1;
  END IF;

  -- 5e: an unknown room type id is absent too, and an empty array is not an
  -- error either — the widget calls this before the guest has picked a room.
  SELECT count(*) INTO v_rows
  FROM public.room_type_stay_restrictions(
    'd3d3d3d3-0000-4000-8000-00000000000a',
    ARRAY['d4d4d4d4-0000-4000-8000-0000000000ff'::uuid],
    current_date + 100, current_date + 102);
  IF v_rows <> 0 THEN
    RAISE WARNING 'FAIL 5e: an unknown room type returned % row(s)', v_rows;
    v_bad := v_bad + 1;
  END IF;

  SELECT count(*) INTO v_rows
  FROM public.room_type_stay_restrictions(
    'd3d3d3d3-0000-4000-8000-00000000000a', '{}'::uuid[],
    current_date + 100, current_date + 102);
  IF v_rows <> 0 THEN
    RAISE WARNING 'FAIL 5e: an empty id list returned % row(s)', v_rows;
    v_bad := v_bad + 1;
  END IF;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL 5: % batch case(s) wrong', v_bad;
  END IF;
  RAISE NOTICE 'PASS 5: room_type_stay_restrictions answers per room type and matches the scalar function';
END $$;

-- ── 6: the availability grid's restriction key ───────────────────────────────
--
-- getResolvedRates in app/actions/pricing.ts keys every priced cell
-- "<rate_plan_id>_<stay_date>" and looks fetchRestrictionFlags' map up with that
-- exact string. Nothing in TypeScript breaks when the two halves drift; the
-- badges just stop appearing, on a screen whose whole job is to show them. So the
-- join is asserted here, against the plan the resolver actually priced with.
--
-- Note the two window conventions the action reconciles: resolve_nightly_rates
-- takes p_to exclusive, while the restriction read is an inclusive BETWEEN. The
-- action passes nextDay(endDate) to the first and endDate to the second, so both
-- cover the same inclusive grid. Case 6d is that boundary.
DO $$
DECLARE
  v_hotel uuid := 'd3d3d3d3-0000-4000-8000-00000000000a';
  v_rt    uuid := 'd4d4d4d4-0000-4000-8000-000000000001';
  v_plan  uuid := 'd5d5d5d5-0000-4000-8000-000000000001';
  v_from  date := current_date + 100;
  v_last  date := current_date + 141;
  v_nights int := 42;
  v_null  int;
  v_set   int;
  v_hit   int;
  v_edge  int;
BEGIN
  -- 6a: a night with no plan cannot be keyed at all, and the cell would show a
  -- rate with its controls silently missing.
  SELECT count(*) INTO v_null
  FROM public.resolve_nightly_rates(v_hotel, ARRAY[v_rt], v_from, v_last + 1, NULL, 0::smallint) r
  WHERE r.rate_plan_id IS NULL;
  IF v_null <> 0 THEN
    RAISE EXCEPTION 'FAIL 6a: % resolved night(s) carry no rate_plan_id to key on', v_null;
  END IF;

  -- 6b: every restriction in the window meets the cell that priced its date,
  -- through the same concatenation the action performs in JavaScript.
  SELECT count(*) INTO v_set
  FROM public.rate_restrictions x
  WHERE x.hotel_id = v_hotel AND x.rate_plan_id = v_plan
    AND x.date BETWEEN v_from AND v_last;

  SELECT count(*) INTO v_hit
  FROM public.resolve_nightly_rates(v_hotel, ARRAY[v_rt], v_from, v_last + 1, NULL, 0::smallint) r
  JOIN public.rate_restrictions x
    ON x.hotel_id = v_hotel
   AND (x.rate_plan_id::text || '_' || x.date::text)
     = (r.rate_plan_id::text || '_' || r.stay_date::text);
  IF v_hit <> v_set THEN
    RAISE EXCEPTION 'FAIL 6b: % of % restriction(s) met a priced cell', v_hit, v_set;
  END IF;

  -- 6c: and no other night is decorated. A key loose enough to match everything
  -- would pass 6b while painting a badge on all 42 columns.
  IF v_hit >= v_nights THEN
    RAISE EXCEPTION 'FAIL 6c: % match(es) across % night(s) — the key is too loose',
      v_hit, v_nights;
  END IF;

  -- 6d: the last inclusive column is priced, so a restriction on the grid's final
  -- day is not dropped by the exclusive p_to.
  SELECT count(*) INTO v_edge
  FROM public.resolve_nightly_rates(v_hotel, ARRAY[v_rt], v_from, v_last + 1, NULL, 0::smallint) r
  WHERE r.stay_date = v_last;
  IF v_edge <> 1 THEN
    RAISE EXCEPTION 'FAIL 6d: the grid''s last column resolved % row(s)', v_edge;
  END IF;

  RAISE NOTICE 'PASS 6: % restriction(s) key onto the cells that priced their dates, edges included',
    v_hit;
END $$;

ROLLBACK;
