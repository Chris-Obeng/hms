-- LOCAL ONLY, after the durable_business_date_close migration is applied.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/durable_business_date_close.sql
-- All fixtures, injected failures and receipts are rolled back.
-- This verifies unique-key/advisory-lock concurrency invariants in one session;
-- a real two-session race rehearsal is still a release gate (see README).
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
END;
$$;

INSERT INTO public.hotels (id, slug, name, clerk_org_id, timezone, currency, status) VALUES
  ('e4e40000-0000-4000-8000-000000000001', 'close-probe-a', 'Close A', 'org_close_a', 'UTC', 'GHS', 'active'),
  ('e4e40000-0000-4000-8000-000000000002', 'close-probe-b', 'Close B', 'org_close_b', 'UTC', 'GHS', 'active');
INSERT INTO public.staff_profiles (clerk_user_id, clerk_org_id, email, full_name, role, is_active) VALUES
  ('close_manager', 'org_close_a', 'manager@close.test', 'First manager', 'manager', true),
  ('close_frontdesk', 'org_close_a', 'desk@close.test', 'Desk', 'front_desk', true),
  ('close_inactive', 'org_close_a', 'inactive@close.test', 'Inactive', 'super_admin', false),
  ('close_manager_b', 'org_close_b', 'other@close.test', 'Other manager', 'manager', true);

-- 1,001 two-night, tax-bearing stays with unequal stored nightly prices.
-- Null room_type_id deliberately avoids unrelated inventory fixtures.
INSERT INTO public.bookings (hotel_id, reference, check_in, check_out, room_rate, subtotal, tax_amount, total_amount, status, currency)
SELECT 'e4e40000-0000-4000-8000-000000000001', 'CLOSE-' || n,
  (now() AT TIME ZONE 'UTC')::date - 3, (now() AT TIME ZONE 'UTC')::date - 1,
  200, 400, 80, 480, 'checked_out', 'GHS' FROM generate_series(1, 1001) n;
INSERT INTO public.booking_nights (hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency, source)
SELECT hotel_id, id, check_in, 1, 10001, 'GHS', 'manual' FROM public.bookings WHERE reference LIKE 'CLOSE-%'
UNION ALL
SELECT hotel_id, id, check_in + 1, 1, 29999, 'GHS', 'manual' FROM public.bookings WHERE reference LIKE 'CLOSE-%';
INSERT INTO public.payments (hotel_id, booking_id, amount, currency, method, status, paid_at)
SELECT hotel_id, id, 19.99, 'GHS', 'cash', 'success', (check_in + 1)::timestamp AT TIME ZONE 'UTC'
FROM public.bookings WHERE reference LIKE 'CLOSE-%';
-- A successful receipt exactly at next midnight is excluded, as is one before
-- the start. Payment dates are not the stay dates.
INSERT INTO public.payments (hotel_id, booking_id, amount, currency, method, status, paid_at)
SELECT hotel_id, id, 11, 'GHS', 'card', 'success', check_out::timestamp AT TIME ZONE 'UTC'
FROM public.bookings WHERE reference = 'CLOSE-1';
INSERT INTO public.payments (hotel_id, booking_id, amount, currency, method, status, paid_at)
SELECT hotel_id, id, 7, 'GHS', 'card', 'success', (check_in + 1)::timestamp AT TIME ZONE 'UTC' - interval '1 microsecond'
FROM public.bookings WHERE reference = 'CLOSE-1';

SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.business_date_closes', 'INSERT'), 'clients cannot forge close rows');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.business_date_closes', 'UPDATE'), 'clients cannot rewrite close rows');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon', 'public.close_night_audit(uuid,text,text)', 'EXECUTE'), 'anonymous execution revoked');
SELECT pg_temp.assert_true(NOT has_function_privilege('service_role', 'public.close_night_audit(uuid,text,text)', 'EXECUTE'), 'no service bypass');

SELECT set_config('request.jwt.claims', '{"sub":"close_manager","org_id":"org_close_a"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  h uuid := 'e4e40000-0000-4000-8000-000000000001';
  d text := ((now() AT TIME ZONE 'UTC')::date - 2)::text;
  preview jsonb;
  closed jsonb;
  replay jsonb;
BEGIN
  preview := public.get_night_audit_summary(h, d);
  PERFORM pg_temp.assert_true((preview#>>'{summary,roomNights}')::int = 1001, 'aggregate is not capped at 1000');
  PERFORM pg_temp.assert_true((preview#>>'{summary,roomRevenueMinor}')::bigint = 30028999, 'variable net nightly revenue excludes tax');
  PERFORM pg_temp.assert_true((preview#>>'{summary,collectionsMinor}')::bigint = 2000999, 'half-open local payment boundaries');
  PERFORM pg_temp.assert_true((preview#>>'{summary,rateIssues}')::int = 0, 'full stay reconciles');
  PERFORM pg_temp.assert_true((public.get_night_audit_summary(h, ((now() AT TIME ZONE 'UTC')::date - 1)::text)#>>'{summary,roomNights}')::int = 0, 'checkout is exclusive');
  closed := public.close_night_audit(h, d, 'first notes');
  replay := public.close_night_audit(h, d, 'replacement notes');
  PERFORM pg_temp.assert_true(closed->>'closeId' = replay->>'closeId', 'replay returns same receipt');
  PERFORM pg_temp.assert_true((replay->>'replayed')::boolean AND replay->>'notes' = 'first notes', 'first-writer notes preserved');
  PERFORM pg_temp.assert_true(closed->>'businessDate' = d AND (closed->>'closedAt')::timestamptz::date > d::date, 'business date is distinct from actor date');
  PERFORM pg_temp.assert_true(closed->'summary' = replay->'summary', 'idempotent summary');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.business_date_closes WHERE hotel_id = h AND business_date = d::date), 'single unique hotel/date receipt');
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM pg_catalog.pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted), 'transaction-scoped close lock held');
END;
$$;
RESET ROLE;

-- Unique key remains the final concurrency invariant even for another writer.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.business_date_closes (hotel_id, business_date, source, summary)
    VALUES ('e4e40000-0000-4000-8000-000000000001', (now() AT TIME ZONE 'UTC')::date - 2, 'legacy_audit_log', '{}');
    RAISE EXCEPTION 'FAIL: duplicate close accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.business_date_closes SET notes = 'rewrite' WHERE hotel_id = 'e4e40000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL: receipt rewritten';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$$;

-- Later source changes must not alter historical receipts.
UPDATE public.booking_nights SET rate_minor = 1
  WHERE booking_id = (SELECT id FROM public.bookings WHERE reference = 'CLOSE-1');
SELECT set_config('request.jwt.claims', '{"sub":"close_manager"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  (public.get_night_audit_summary('e4e40000-0000-4000-8000-000000000001', ((now() AT TIME ZONE 'UTC')::date - 2)::text)#>>'{summary,roomRevenueMinor}')::bigint = 30028999,
  'historical read uses saved snapshot; sub-only Clerk JWT still requires staff membership'
);
RESET ROLE;

-- Foreign tenant, non-manager and inactive staff must all fail in the RPC even
-- when server-action authorization is bypassed.
DO $$
DECLARE claims text;
BEGIN
  FOREACH claims IN ARRAY ARRAY[
    '{"sub":"close_manager_b","org_id":"org_close_b"}',
    '{"sub":"close_frontdesk","org_id":"org_close_a"}',
    '{"sub":"close_inactive","org_id":"org_close_a"}',
    '{"sub":"close_manager","org_id":"org_close_b"}'
  ] LOOP
    PERFORM set_config('request.jwt.claims', claims, true);
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.close_night_audit('e4e40000-0000-4000-8000-000000000001', ((now() AT TIME ZONE 'UTC')::date - 1)::text);
      RAISE EXCEPTION 'FAIL: unauthorized close allowed: %', claims;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
END;
$$;
SELECT set_config('request.jwt.claims', '{"sub":"close_manager_b","org_id":"org_close_b"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.business_date_closes WHERE hotel_id = 'e4e40000-0000-4000-8000-000000000001'), 'RLS hides foreign receipt');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"close_manager","org_id":"org_close_a"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE d text;
BEGIN
  FOREACH d IN ARRAY ARRAY['2026-02-30', '2026-13-01', 'not-a-date', '1999-12-31', '9999-01-01', ((now() AT TIME ZONE 'UTC')::date)::text] LOOP
    BEGIN
      PERFORM public.close_night_audit('e4e40000-0000-4000-8000-000000000001', d);
      RAISE EXCEPTION 'FAIL: invalid/unended date allowed: %', d;
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
END;
$$;
RESET ROLE;

-- Both due arrivals and overdue departures block; no implicit exception policy.
INSERT INTO public.bookings (id, hotel_id, reference, check_in, check_out, room_rate, subtotal, total_amount, status)
VALUES ('e4e40000-0000-4000-8000-000000000010', 'e4e40000-0000-4000-8000-000000000001', 'CLOSE-UNRESOLVED',
  (now() AT TIME ZONE 'UTC')::date - 5, (now() AT TIME ZONE 'UTC')::date - 4, 100, 100, 100, 'confirmed');
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['confirmed', 'checked_in'] LOOP
    UPDATE public.bookings SET status = s WHERE id = 'e4e40000-0000-4000-8000-000000000010';
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.close_night_audit('e4e40000-0000-4000-8000-000000000001', ((now() AT TIME ZONE 'UTC')::date - 1)::text);
      RAISE EXCEPTION 'FAIL: unresolved % accepted', s;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
END;
$$;
UPDATE public.bookings SET status = 'checked_out' WHERE id = 'e4e40000-0000-4000-8000-000000000010';

-- An unreconciled stayed date fails instead of storing partial/net estimates.
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.close_night_audit('e4e40000-0000-4000-8000-000000000001', ((now() AT TIME ZONE 'UTC')::date - 3)::text);
    RAISE EXCEPTION 'FAIL: mismatched nightly charges accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Simulate both an INSERT exception and a trigger suppressing persistence.
CREATE FUNCTION night_audit_private.close_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.notes = 'test-raise' THEN RAISE EXCEPTION 'Injected persistence failure' USING ERRCODE = '55000'; END IF;
  IF NEW.notes = 'test-suppress' THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER close_test_failure BEFORE INSERT ON public.business_date_closes
  FOR EACH ROW EXECUTE FUNCTION night_audit_private.close_test_failure();
SET LOCAL ROLE authenticated;
DO $$
DECLARE n text; d text := ((now() AT TIME ZONE 'UTC')::date - 1)::text;
BEGIN
  FOREACH n IN ARRAY ARRAY['test-raise', 'test-suppress'] LOOP
    BEGIN
      PERFORM public.close_night_audit('e4e40000-0000-4000-8000-000000000001', d, n);
      RAISE EXCEPTION 'FAIL: failed persistence reported success';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
    PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.business_date_closes WHERE business_date = d::date), 'failed write leaves no receipt');
  END LOOP;
  PERFORM pg_temp.assert_true((public.close_night_audit('e4e40000-0000-4000-8000-000000000001', d)->>'isClosed')::boolean, 'explicit retry succeeds after failed insert');
END;
$$;
RESET ROLE;

-- Missing nights and mixed-currency payments are blockers, not silent zeroes.
INSERT INTO public.bookings (id, hotel_id, reference, check_in, check_out, room_rate, subtotal, total_amount, status, currency)
VALUES ('e4e40000-0000-4000-8000-000000000020', 'e4e40000-0000-4000-8000-000000000002', 'CLOSE-B-MISSING',
  (now() AT TIME ZONE 'UTC')::date - 2, (now() AT TIME ZONE 'UTC')::date - 1, 100, 100, 100, 'checked_out', 'GHS');
SELECT set_config('request.jwt.claims', '{"sub":"close_manager_b","org_id":"org_close_b"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE p jsonb; d text := ((now() AT TIME ZONE 'UTC')::date - 2)::text;
BEGIN
  p := public.get_night_audit_summary('e4e40000-0000-4000-8000-000000000002', d);
  PERFORM pg_temp.assert_true((p#>>'{summary,rateIssues}')::int = 1 AND p#>>'{summary,roomRevenueMinor}' IS NULL, 'missing nightly rows withheld');
  BEGIN
    PERFORM public.close_night_audit('e4e40000-0000-4000-8000-000000000002', d);
    RAISE EXCEPTION 'FAIL: missing nightly rows accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
RESET ROLE;
INSERT INTO public.booking_nights (hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency, source)
SELECT hotel_id, id, check_in, 1, 10000, 'GHS', 'manual' FROM public.bookings WHERE reference = 'CLOSE-B-MISSING';
INSERT INTO public.payments (hotel_id, booking_id, amount, currency, method, status, paid_at)
SELECT hotel_id, id, 5, 'USD', 'cash', 'success', check_in::timestamp AT TIME ZONE 'UTC' FROM public.bookings WHERE reference = 'CLOSE-B-MISSING';
SET LOCAL ROLE authenticated;
DO $$
DECLARE p jsonb; d text := ((now() AT TIME ZONE 'UTC')::date - 2)::text;
BEGIN
  p := public.get_night_audit_summary('e4e40000-0000-4000-8000-000000000002', d);
  PERFORM pg_temp.assert_true((p#>>'{summary,paymentIssues}')::int = 1 AND p#>>'{summary,collectionsMinor}' IS NULL, 'mixed currency total withheld');
  BEGIN
    PERFORM public.close_night_audit('e4e40000-0000-4000-8000-000000000002', d);
    RAISE EXCEPTION 'FAIL: mixed currency close accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Timezone validation and local-day default, without relying on the test host TZ.
UPDATE public.hotels SET timezone = 'America/Los_Angeles' WHERE id = 'e4e40000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims', '{"sub":"close_manager_b","o":{"id":"org_close_b"}}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.get_night_audit_summary('e4e40000-0000-4000-8000-000000000002')->>'businessDate' = ((now() AT TIME ZONE 'America/Los_Angeles')::date - 1)::text, 'property-zone default date with Clerk v2 org claim');
RESET ROLE;
-- The reporting inventory trigger rejects invalid timezone writes so that a
-- partial baseline is never captured. Temporarily bypass that trigger inside
-- this rollback-only test to model a legacy/pre-existing invalid row and prove
-- the close RPC still fails closed when it encounters one.
ALTER TABLE public.hotels DISABLE TRIGGER reports_inventory_hotel_capture;
UPDATE public.hotels SET timezone = 'Invalid/Zone' WHERE id = 'e4e40000-0000-4000-8000-000000000002';
ALTER TABLE public.hotels ENABLE TRIGGER reports_inventory_hotel_capture;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_night_audit_summary('e4e40000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'FAIL: invalid property timezone silently accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'PASS durable_business_date_close: aggregates, money, boundaries, history, replay, lock, uniqueness, roles/RLS, validation, blockers, failed persistence.'; END; $$;
ROLLBACK;
