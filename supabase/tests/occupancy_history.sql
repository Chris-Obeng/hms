-- Assertion harness for 20261114170000_occupancy_history.sql: the triggers
-- that record room status periods and availability block versions, their
-- privileges and their RLS. (The one-time rebuild from audit_logs runs at
-- migration time against real data and is not replayable here.)
--
-- One transaction, always rolled back, with its own fixture. Every write is
-- its own statement, so clock_timestamp() gives each change its own instant.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
END;
$$;

-- ── Privileges: read-only through the API, trigger code private ──────────
SELECT pg_temp.assert_true(has_table_privilege('authenticated', 'public.room_status_history', 'SELECT'), 'staff can read room status history');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.room_status_history', 'INSERT'), 'clients cannot insert room status history');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.room_status_history', 'UPDATE'), 'clients cannot rewrite room status history');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.room_status_history', 'DELETE'), 'clients cannot delete room status history');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.availability_block_history', 'INSERT'), 'clients cannot insert block history');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.availability_block_history', 'UPDATE'), 'clients cannot rewrite block history');
SELECT pg_temp.assert_true(NOT has_table_privilege('anon', 'public.room_status_history', 'SELECT'), 'anonymous cannot read room status history');
SELECT pg_temp.assert_true(NOT has_table_privilege('anon', 'public.availability_block_history', 'SELECT'), 'anonymous cannot read block history');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated', 'reports_private.record_room_status()', 'EXECUTE'), 'trigger function is private');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated', 'reports_private.record_availability_block()', 'EXECUTE'), 'trigger function is private');

-- ── Fixture ──────────────────────────────────────────────────────────────
INSERT INTO public.hotels (id, slug, name, clerk_org_id, timezone, currency, status) VALUES
  ('a7a70000-0000-4000-8000-00000000000a', 'occ-history-a', 'Occupancy A', 'org_occ_a', 'UTC', 'GHS', 'active'),
  ('a7a70000-0000-4000-8000-00000000000b', 'occ-history-b', 'Occupancy B', 'org_occ_b', 'UTC', 'GHS', 'active');
INSERT INTO public.staff_profiles (clerk_user_id, clerk_org_id, email, full_name, role, is_active) VALUES
  ('occ_reader_a', 'org_occ_a', 'reader@occ.test', 'Reader A', 'read_only', true);
INSERT INTO public.room_types (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  ('a7a70001-0000-4000-8000-00000000000a', 'a7a70000-0000-4000-8000-00000000000a', 'Occ Double', 'occ-double', 200, 200, 2, 0),
  ('a7a70001-0000-4000-8000-00000000000b', 'a7a70000-0000-4000-8000-00000000000b', 'Occ Double', 'occ-double', 200, 200, 2, 0);

-- ── Room status periods ──────────────────────────────────────────────────
INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number, status, is_active) VALUES
  ('a7a70002-0000-4000-8000-000000000001', 'a7a70000-0000-4000-8000-00000000000a', 'a7a70001-0000-4000-8000-00000000000a', 'OCC-1', 'available', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 AND bool_and(valid_to IS NULL AND status = 'available' AND source = 'recorded')
     FROM public.room_status_history WHERE room_id = 'a7a70002-0000-4000-8000-000000000001'),
  'a new active room opens one recorded period');

UPDATE public.rooms SET status = 'maintenance' WHERE id = 'a7a70002-0000-4000-8000-000000000001';
UPDATE public.rooms SET status = 'maintenance' WHERE id = 'a7a70002-0000-4000-8000-000000000001';
UPDATE public.rooms SET notes = 'leak' WHERE id = 'a7a70002-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.room_status_history WHERE room_id = 'a7a70002-0000-4000-8000-000000000001'),
  'a status change adds a period; a no-op or unrelated update adds none');
SELECT pg_temp.assert_true(
  (SELECT status = 'maintenance' FROM public.room_status_history
    WHERE room_id = 'a7a70002-0000-4000-8000-000000000001' AND valid_to IS NULL),
  'the open period holds the current status');

UPDATE public.rooms SET is_active = false WHERE id = 'a7a70002-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.room_status_history
               WHERE room_id = 'a7a70002-0000-4000-8000-000000000001' AND valid_to IS NULL),
  'deactivating a room closes its period (inactive rooms are outside capacity)');
UPDATE public.rooms SET status = 'out_of_service' WHERE id = 'a7a70002-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.room_status_history
               WHERE room_id = 'a7a70002-0000-4000-8000-000000000001' AND valid_to IS NULL),
  'a status change on an inactive room opens nothing');
UPDATE public.rooms SET is_active = true WHERE id = 'a7a70002-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT status = 'out_of_service' FROM public.room_status_history
    WHERE room_id = 'a7a70002-0000-4000-8000-000000000001' AND valid_to IS NULL),
  'reactivating opens a period with the current status');

INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number, status, is_active) VALUES
  ('a7a70002-0000-4000-8000-000000000002', 'a7a70000-0000-4000-8000-00000000000a', 'a7a70001-0000-4000-8000-00000000000a', 'OCC-2', 'maintenance', false);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.room_status_history WHERE room_id = 'a7a70002-0000-4000-8000-000000000002'),
  'an inactive new room has no period');

-- ── Availability block versions ──────────────────────────────────────────
INSERT INTO public.availability_blocks (id, hotel_id, room_id, start_date, end_date, reason) VALUES
  ('a7a70003-0000-4000-8000-000000000001', 'a7a70000-0000-4000-8000-00000000000a', 'a7a70002-0000-4000-8000-000000000001',
   current_date + 400, current_date + 403, 'Repairs');
UPDATE public.availability_blocks SET reason = 'Painting' WHERE id = 'a7a70003-0000-4000-8000-000000000001';
UPDATE public.availability_blocks SET end_date = current_date + 405 WHERE id = 'a7a70003-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 FROM public.availability_block_history WHERE block_id = 'a7a70003-0000-4000-8000-000000000001'),
  'a range change adds a version; a reason change adds none');
SELECT pg_temp.assert_true(
  (SELECT end_date = current_date + 405 FROM public.availability_block_history
    WHERE block_id = 'a7a70003-0000-4000-8000-000000000001' AND valid_to IS NULL),
  'the open version holds the current range');

-- ── RLS: staff read their own hotel only ─────────────────────────────────
INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number, status) VALUES
  ('a7a70002-0000-4000-8000-000000000003', 'a7a70000-0000-4000-8000-00000000000b', 'a7a70001-0000-4000-8000-00000000000b', 'OCC-B', 'maintenance');
SELECT set_config('request.jwt.claims', '{"sub":"occ_reader_a","org_id":"org_occ_a"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
  (SELECT count(*) > 0 FROM public.room_status_history WHERE hotel_id = 'a7a70000-0000-4000-8000-00000000000a'),
  'staff read their own hotel''s room status history');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.room_status_history WHERE hotel_id = 'a7a70000-0000-4000-8000-00000000000b'),
  'staff cannot read another hotel''s room status history');
SELECT pg_temp.assert_true(
  (SELECT count(*) > 0 FROM public.availability_block_history WHERE hotel_id = 'a7a70000-0000-4000-8000-00000000000a'),
  'staff read their own hotel''s block history');
RESET ROLE;

-- ── Deletes ──────────────────────────────────────────────────────────────
DELETE FROM public.availability_blocks WHERE id = 'a7a70003-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 AND bool_and(valid_to IS NOT NULL) FROM public.availability_block_history
    WHERE block_id = 'a7a70003-0000-4000-8000-000000000001'),
  'a deleted block keeps its versions, all closed');
DELETE FROM public.rooms WHERE id = 'a7a70002-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*) > 0 AND bool_and(valid_to IS NOT NULL) FROM public.room_status_history
    WHERE room_id = 'a7a70002-0000-4000-8000-000000000001'),
  'a deleted room keeps its periods, all closed');

-- ── Period invariants across everything written above ────────────────────
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.room_status_history a
      JOIN public.room_status_history b ON a.room_id = b.room_id AND a.id < b.id
     WHERE a.hotel_id IN ('a7a70000-0000-4000-8000-00000000000a', 'a7a70000-0000-4000-8000-00000000000b')
       AND a.valid_from < coalesce(b.valid_to, 'infinity') AND b.valid_from < coalesce(a.valid_to, 'infinity')),
  'room status periods never overlap');
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.availability_block_history a
      JOIN public.availability_block_history b ON a.block_id = b.block_id AND a.id < b.id
     WHERE a.hotel_id = 'a7a70000-0000-4000-8000-00000000000a'
       AND a.valid_from < coalesce(b.valid_to, 'infinity') AND b.valid_from < coalesce(a.valid_to, 'infinity')),
  'block versions never overlap');

ROLLBACK;
