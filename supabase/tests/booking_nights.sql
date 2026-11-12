-- =============================================================================
-- Regression probe: booking_nights holds the per-night truth of a reservation,
-- the backfill reconstructs open stays and nothing else, the drift report finds
-- both missing and rewritten nights, and the manager gate really gates.
--
-- Run against a database with the migrations applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking_nights.sql
--
-- One transaction, always rolled back, so it is safe against a local stack and
-- leaves no rows behind. Exit code 0 with the PASS notices means the table and
-- its two functions behave; any FAIL raises and aborts, and ON_ERROR_STOP turns
-- that into a non-zero exit.
--
-- The backfill is exercised through public.backfill_booking_nights() rather than
-- a copy of its body, so this file cannot drift from the migration that ships
-- it. Write attempts run as the `authenticated` role because a superuser
-- bypasses RLS entirely and would make every policy look open.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on

\set hA   'd0d0d0d0-0000-4000-8000-00000000000a'
\set hB   'd0d0d0d0-0000-4000-8000-00000000000b'
\set open 'd1d1d1d1-0000-4000-8000-000000000001'
\set past 'd1d1d1d1-0000-4000-8000-000000000002'
\set canx 'd1d1d1d1-0000-4000-8000-000000000003'
\set comp 'd1d1d1d1-0000-4000-8000-000000000004'

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency) VALUES
  (:'hA', 'nights-probe-a', 'Nights Probe A', 'org_nights_probe_a', 'GHS'),
  (:'hB', 'nights-probe-b', 'Nights Probe B', 'org_nights_probe_b', 'GHS');

INSERT INTO public.staff_profiles (clerk_user_id, clerk_org_id, email, role, is_active) VALUES
  ('nprobe_front_desk', 'org_nights_probe_a', 'fd@nights.test',   'front_desk', true),
  ('nprobe_manager',    'org_nights_probe_a', 'mgr@nights.test',  'manager',    true),
  ('nprobe_manager_b',  'org_nights_probe_b', 'mgrb@nights.test', 'manager',    true);

-- Four stays, one per branch of the backfill's WHERE clause: an open stay that
-- must be reconstructed, a departed stay whose rates are history, a cancelled
-- stay, and a comped stay whose zero rate cannot satisfy rate_minor > 0.
INSERT INTO public.bookings
  (id, hotel_id, reference, check_in, check_out, room_rate, subtotal, total_amount,
   rooms_count, currency, status, cancelled_at) VALUES
  (:'open', :'hA', 'NPROBE-OPEN', current_date + 1, current_date + 4,
   450.00, 2700.00, 2700.00, 2, 'GHS', 'confirmed', NULL),
  (:'past', :'hA', 'NPROBE-PAST', current_date - 10, current_date - 7,
   300.00,  900.00,  900.00, 1, 'GHS', 'checked_out', NULL),
  (:'canx', :'hA', 'NPROBE-CANX', current_date + 1, current_date + 3,
   500.00, 1000.00, 1000.00, 1, 'GHS', 'cancelled', now()),
  (:'comp', :'hA', 'NPROBE-COMP', current_date + 1, current_date + 2,
        0,       0,       0, 1, 'GHS', 'confirmed', NULL);

-- -----------------------------------------------------------------------------
-- 1. The backfill reconstructs exactly the open, priceable, live stays.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  problems text[] := '{}';
  written  bigint;
  n        bigint;
BEGIN
  written := public.backfill_booking_nights('d0d0d0d0-0000-4000-8000-00000000000a');
  IF written <> 3 THEN
    problems := problems || format('backfill wrote %s rows, expected 3', written);
  END IF;

  SELECT count(*) INTO n FROM public.booking_nights
   WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000001';
  IF n <> 3 THEN problems := problems || format('open stay holds %s nights, expected 3', n); END IF;

  -- 450.00 GHS is 45000 minor units; the night carries the per-room rate and the
  -- room count separately, never a pre-multiplied total.
  IF NOT EXISTS (
    SELECT 1 FROM public.booking_nights
     WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000001'
       AND rate_minor = 45000 AND rooms_count = 2 AND currency = 'GHS'
       AND source = 'reconstructed' AND occupancy = 0
       AND rate_plan_id IS NULL AND seasonal_rate_id IS NULL
  ) THEN
    problems := problems || 'reconstructed night lost the minor-unit rate, the room count, or its provenance';
  END IF;

  -- [check_in, check_out): the departure date is not a night.
  IF EXISTS (
    SELECT 1 FROM public.booking_nights
     WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000001'
       AND stay_date NOT BETWEEN current_date + 1 AND current_date + 3
  ) THEN
    problems := problems || 'night series is not half-open: the checkout date was written as a night';
  END IF;

  IF EXISTS (SELECT 1 FROM public.booking_nights
              WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000002') THEN
    problems := problems || 'a departed stay was backfilled; its real rates are unrecoverable and must stay absent';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_nights
              WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000003') THEN
    problems := problems || 'a cancelled stay was backfilled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_nights
              WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000004') THEN
    problems := problems || 'a comped stay was backfilled despite the rate_minor > 0 constraint';
  END IF;

  written := public.backfill_booking_nights('d0d0d0d0-0000-4000-8000-00000000000a');
  IF written <> 0 THEN
    problems := problems || format('backfill is not idempotent: a second run wrote %s rows', written);
  END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION 'FAIL backfill: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'PASS backfill reconstructs open stays only, in minor units, marked reconstructed, and is idempotent';
END
$$;

-- -----------------------------------------------------------------------------
-- 2. The drift report. Deliberately a report and not a constraint: manual
--    discounts and comped nights are legitimate reasons for the nights and the
--    booking subtotal to disagree, so a human reviews the list in Night Audit.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  problems text[] := '{}';
  hotel    uuid := 'd0d0d0d0-0000-4000-8000-00000000000a';
  refs     text[];
  diff     bigint;
BEGIN
  -- The reconstructed stay reconciles; the two the backfill skipped do not.
  SELECT array_agg(reference ORDER BY reference) INTO refs
    FROM public.booking_nights_drift(hotel);
  IF refs IS DISTINCT FROM ARRAY['NPROBE-COMP', 'NPROBE-PAST'] THEN
    problems := problems || format('drift reported %s; expected only the stays with no nights',
                                   coalesce(refs::text, 'nothing'));
  END IF;

  -- A rewritten invoice line is exactly what the report exists to surface.
  UPDATE public.booking_nights SET rate_minor = 40000
   WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000001'
     AND stay_date = current_date + 1;

  SELECT difference_minor INTO diff
    FROM public.booking_nights_drift(hotel) WHERE reference = 'NPROBE-OPEN';
  IF diff IS DISTINCT FROM -10000 THEN
    problems := problems || format('a night discounted by 100.00 reported drift of %s, expected -10000',
                                   coalesce(diff::text, 'no row'));
  END IF;

  IF EXISTS (SELECT 1 FROM public.booking_nights_drift(hotel) WHERE reference = 'NPROBE-CANX') THEN
    problems := problems || 'drift reported a cancelled booking, which nobody needs to reconcile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_nights_drift('d0d0d0d0-0000-4000-8000-00000000000b')) THEN
    problems := problems || 'drift leaked rows into another hotel report';
  END IF;

  UPDATE public.booking_nights SET rate_minor = 45000
   WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000001'
     AND stay_date = current_date + 1;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION 'FAIL drift: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'PASS booking_nights_drift finds missing and rewritten nights, per hotel, ignoring cancellations';
END
$$;

-- -----------------------------------------------------------------------------
-- 3. RLS. A booking night is an invoice line, so every direct write from a
--    browser session -- INSERT, UPDATE, or DELETE -- takes a manager; nights are
--    created for the front desk through the server workflow. A denied UPDATE or
--    DELETE is a zero-row no-op, not an error -- that is what a RESTRICTIVE
--    policy does -- while a denied INSERT trips the WITH CHECK and raises 42501.
-- -----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"nprobe_front_desk"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  problems text[] := '{}';
  seen     bigint;
  touched  bigint;
BEGIN
  SELECT count(*) INTO seen FROM public.booking_nights;
  IF seen <> 3 THEN
    problems := problems || format('front desk sees %s of its own 3 nights', seen);
  END IF;

  BEGIN
    INSERT INTO public.booking_nights
      (hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency, source)
    VALUES ('d0d0d0d0-0000-4000-8000-00000000000a', 'd1d1d1d1-0000-4000-8000-000000000004',
            current_date + 1, 1, 100, 'GHS', 'manual');
    problems := problems || 'front desk inserted a night; INSERT is manager-only';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.booking_nights SET rate_minor = 1
   WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000001';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 0 THEN
    problems := problems || format('front desk rewrote %s night(s); UPDATE is manager-only', touched);
  END IF;

  DELETE FROM public.booking_nights
   WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000001';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 0 THEN
    problems := problems || format('front desk deleted %s night(s); DELETE is manager-only', touched);
  END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION 'FAIL front desk: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'PASS front desk can read nights but cannot add, rewrite, or delete one';
END
$$;

RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"nprobe_manager"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  problems text[] := '{}';
  touched  bigint;
BEGIN
  INSERT INTO public.booking_nights
    (hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency, source)
  VALUES ('d0d0d0d0-0000-4000-8000-00000000000a', 'd1d1d1d1-0000-4000-8000-000000000004',
          current_date + 1, 1, 100, 'GHS', 'manual');

  UPDATE public.booking_nights SET rate_minor = 46000
   WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000001'
     AND stay_date = current_date + 1;
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    problems := problems || format('manager rewrote %s night(s), expected 1', touched);
  END IF;

  DELETE FROM public.booking_nights
   WHERE booking_id = 'd1d1d1d1-0000-4000-8000-000000000004';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    problems := problems || format('manager deleted %s night(s), expected the 1 the manager added', touched);
  END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION 'FAIL manager: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'PASS manager clears all three restrictive gates: a night can be added, rewritten, and removed';
END
$$;

RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"nprobe_manager_b"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  problems text[] := '{}';
  seen     bigint;
BEGIN
  SELECT count(*) INTO seen FROM public.booking_nights;
  IF seen <> 0 THEN
    problems := problems || format('a manager of another hotel sees %s night(s) of hotel A', seen);
  END IF;

  BEGIN
    INSERT INTO public.booking_nights
      (hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency, source)
    VALUES ('d0d0d0d0-0000-4000-8000-00000000000a', 'd1d1d1d1-0000-4000-8000-000000000001',
            current_date + 9, 1, 100, 'GHS', 'manual');
    problems := problems || 'a manager of another hotel inserted a night into hotel A';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- The drift report is SECURITY INVOKER, so passing someone else's hotel id has
  -- to come back empty: the caller's own RLS on bookings is what scopes it.
  SELECT count(*) INTO seen
    FROM public.booking_nights_drift('d0d0d0d0-0000-4000-8000-00000000000a');
  IF seen <> 0 THEN
    problems := problems
      || format('the drift report leaked %s of hotel A''s booking(s) to another hotel''s manager', seen);
  END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION 'FAIL tenancy: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'PASS org isolation holds: another hotel''s manager can neither see, write, nor pull these nights through the drift report';
END
$$;

RESET ROLE;

ROLLBACK;
