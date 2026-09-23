-- =============================================================================
-- Regression probe: the room-type inventory guard cannot be talked into an
-- oversell.
--
-- Run against a database with the migrations applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/oversell_guard.sql
--
-- Everything happens inside one transaction that always rolls back, so it is
-- safe against a local stack and leaves no rows behind. It is deliberately SQL
-- rather than Vitest: the behaviour under test lives in a trigger and a set of
-- SQL functions, and asserting it from application code would prove only that
-- the application still calls them.
--
-- Exit code 0 with five PASS notices means the guard holds. Any FAIL raises and
-- aborts, so ON_ERROR_STOP turns a regression into a non-zero exit.
--
-- Fixture: one hotel, one room type, two sellable rooms.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on
\set h  '11111111-1111-1111-1111-111111111111'
\set rt '22222222-2222-2222-2222-222222222222'
\set bA '33333333-3333-3333-3333-333333333333'
\set bC '44444444-4444-4444-4444-444444444444'

INSERT INTO public.hotels (id, slug, name, clerk_org_id)
VALUES (:'h', 'oversell-probe', 'Oversell Probe', 'org_oversell_probe');

INSERT INTO public.room_types (id, hotel_id, name, slug, base_price)
VALUES (:'rt', :'h', 'Standard', 'standard', 100);

INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status)
VALUES (:'h', :'rt', '101', 'available'),
       (:'h', :'rt', '102', 'available'),
       -- Out of service AND blocked below: capacity must exclude it once, not twice.
       (:'h', :'rt', '103', 'out_of_service');

INSERT INTO public.availability_blocks (hotel_id, room_id, start_date, end_date, reason)
SELECT r.hotel_id, r.id, '2026-09-10', '2026-09-30', 'other'
  FROM public.rooms r
 WHERE r.hotel_id = :'h' AND r.room_number = '103';

-- One booking taking BOTH rooms. The pre-fix guard counted booking rows, so it
-- read this as 1 room sold and left the house apparently half empty.
INSERT INTO public.bookings
  (id, hotel_id, room_type_id, reference, check_in, check_out,
   room_rate, subtotal, total_amount, rooms_count, status, payment_status,
   payment_preference, source)
VALUES
  (:'bA', :'h', :'rt', 'PROBEA', '2026-09-10', '2026-09-12',
   100, 200, 200, 2, 'confirmed', 'unpaid', 'pay_at_checkin', 'walk_in');

-- 1. The projection agrees the house is full.
DO $$
DECLARE v integer;
BEGIN
  SELECT public.room_type_available_count(
           '22222222-2222-2222-2222-222222222222', '2026-09-10', '2026-09-12')
    INTO v;
  IF v <> 0 THEN
    RAISE EXCEPTION 'FAIL rooms_count-sum: available = %, expected 0', v;
  END IF;
  RAISE NOTICE 'PASS one 2-room booking consumes both rooms';
END $$;

-- 2. A room that is out of service and blocked is removed from capacity once.
DO $$
DECLARE r record;
BEGIN
  SELECT a.capacity, a.blocked INTO r
    FROM public.room_type_availability_by_date(
           ARRAY['22222222-2222-2222-2222-222222222222'::uuid],
           '2026-09-20', '2026-09-21') a;
  IF r.capacity <> 2 OR r.blocked <> 0 THEN
    RAISE EXCEPTION 'FAIL double-subtraction: capacity = %, blocked = %, expected 2 and 0',
      r.capacity, r.blocked;
  END IF;
  RAISE NOTICE 'PASS out-of-service room excluded from capacity exactly once';
END $$;

-- 3. Inserting one more room over a full house is refused.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.bookings
      (hotel_id, room_type_id, reference, check_in, check_out,
       room_rate, subtotal, total_amount, rooms_count, status, payment_status,
       payment_preference, source)
    VALUES
      ('11111111-1111-1111-1111-111111111111',
       '22222222-2222-2222-2222-222222222222', 'PROBEB',
       '2026-09-11', '2026-09-13', 100, 200, 200, 1,
       'confirmed', 'unpaid', 'pay_at_checkin', 'walk_in');
    RAISE EXCEPTION 'FAIL oversell-insert: booking accepted with zero inventory';
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE NOTICE 'PASS oversell insert rejected: %', SQLERRM;
  END;
END $$;

-- 4. Raising rooms_count on an existing booking is guarded. Before the fix the
--    trigger's UPDATE OF list omitted rooms_count, so this path was wide open.
INSERT INTO public.bookings
  (id, hotel_id, room_type_id, reference, check_in, check_out,
   room_rate, subtotal, total_amount, rooms_count, status, payment_status,
   payment_preference, source)
VALUES
  (:'bC', :'h', :'rt', 'PROBEC', '2026-09-20', '2026-09-22',
   100, 200, 200, 1, 'confirmed', 'unpaid', 'pay_at_checkin', 'walk_in');

DO $$
BEGIN
  BEGIN
    UPDATE public.bookings SET rooms_count = 3
     WHERE id = '44444444-4444-4444-4444-444444444444';
    RAISE EXCEPTION 'FAIL rooms_count-update: 3 rooms accepted against capacity 2';
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE NOTICE 'PASS rooms_count raise rejected: %', SQLERRM;
  END;
END $$;

-- The legitimate raise still passes, so the guard is discriminating rather than
-- simply refusing every update.
UPDATE public.bookings SET rooms_count = 2 WHERE id = :'bC';

-- 5. An abandoned pay-now hold does not hold inventory past 30 minutes, and the
--    batch RPC returns one row per known room type.
INSERT INTO public.bookings
  (hotel_id, room_type_id, reference, check_in, check_out,
   room_rate, subtotal, total_amount, rooms_count, status, payment_status,
   payment_preference, source, created_at)
VALUES
  (:'h', :'rt', 'PROBED', '2026-09-25', '2026-09-26',
   100, 100, 100, 2, 'pending', 'unpaid', 'pay_now', 'direct',
   now() - interval '31 minutes');

DO $$
DECLARE rows_returned integer; free integer;
BEGIN
  SELECT count(*) INTO rows_returned
    FROM public.room_type_available_counts(
           ARRAY['22222222-2222-2222-2222-222222222222'::uuid,
                 '55555555-5555-5555-5555-555555555555'::uuid],
           '2026-09-25', '2026-09-26');
  IF rows_returned <> 1 THEN
    RAISE EXCEPTION 'FAIL batch-rpc: % rows, expected 1 (unknown ids omitted)', rows_returned;
  END IF;

  SELECT available INTO free
    FROM public.room_type_available_counts(
           ARRAY['22222222-2222-2222-2222-222222222222'::uuid],
           '2026-09-25', '2026-09-26');
  IF free <> 2 THEN
    RAISE EXCEPTION 'FAIL stale-hold: available = %, expected 2', free;
  END IF;
  RAISE NOTICE 'PASS abandoned pay-now hold releases inventory, batch RPC shape correct';
END $$;

ROLLBACK;
