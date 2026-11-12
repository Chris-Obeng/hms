-- Transactional tenant-integrity regression tests.

BEGIN;

\set ON_ERROR_STOP on

DO $catalog$
DECLARE
  r record;
  v_found boolean;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.payments',              'public.bookings',   ARRAY['booking_id', 'hotel_id']::name[]),
      ('public.booking_nights',        'public.bookings',   ARRAY['booking_id', 'hotel_id']::name[]),
      ('public.payment_attempts',      'public.bookings',   ARRAY['booking_id', 'hotel_id']::name[]),
      ('public.rooms',                 'public.room_types', ARRAY['room_type_id', 'hotel_id']::name[]),
      ('public.availability_blocks',   'public.rooms',      ARRAY['room_id', 'hotel_id']::name[]),
      ('public.daily_rate_overrides',  'public.room_types', ARRAY['room_type_id', 'hotel_id']::name[]),
      ('public.bookings',              'public.guests',     ARRAY['guest_id', 'hotel_id']::name[]),
      ('public.bookings',              'public.rooms',      ARRAY['room_id', 'hotel_id']::name[]),
      ('public.bookings',              'public.room_types', ARRAY['room_type_id', 'hotel_id']::name[]),
      ('public.bookings',              'public.bookings',   ARRAY['group_id', 'hotel_id']::name[]),
      ('public.notifications',         'public.bookings',   ARRAY['booking_id', 'hotel_id']::name[]),
      ('public.notification_logs',     'public.bookings',   ARRAY['booking_id', 'hotel_id']::name[])
    ) AS expected(child_tbl, parent_tbl, child_cols)
  LOOP
    SELECT EXISTS (
      SELECT 1
        FROM pg_constraint c
        CROSS JOIN LATERAL unnest(c.conkey, c.confkey)
          WITH ORDINALITY AS keys(child_attnum, parent_attnum, ordinality)
        JOIN pg_attribute child
          ON child.attrelid = c.conrelid AND child.attnum = keys.child_attnum
        JOIN pg_attribute parent
          ON parent.attrelid = c.confrelid AND parent.attnum = keys.parent_attnum
       WHERE c.conrelid = r.child_tbl::regclass
         AND c.confrelid = r.parent_tbl::regclass
         AND c.contype = 'f'
         AND c.convalidated
       GROUP BY c.oid
      HAVING array_agg(child.attname ORDER BY keys.ordinality) = r.child_cols
         AND array_agg(parent.attname ORDER BY keys.ordinality) = ARRAY['id', 'hotel_id']::name[]
    ) INTO v_found;

    IF NOT v_found THEN
      RAISE EXCEPTION 'FAIL composite tenant FK % (%) -> % (id, hotel_id) is absent or unvalidated',
        r.child_tbl, array_to_string(r.child_cols, ', '), r.parent_tbl;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS tenant_integrity: all 12 composite tenant FKs exist and are validated';
END
$catalog$;

DO $cross_tenant_probe$
DECLARE
  v_hA  uuid := '11111111-aaaa-4000-8000-000000000001';
  v_hB  uuid := '22222222-bbbb-4000-8000-000000000002';
  v_rtA uuid := '11111111-aaaa-4000-8000-000000000011';
  v_rtB uuid := '22222222-bbbb-4000-8000-000000000022';
  v_rmB uuid := '22222222-bbbb-4000-8000-000000000033';
BEGIN
  INSERT INTO public.hotels (id, slug, name, clerk_org_id) VALUES
    (v_hA, 'ti-probe-a', 'TI Probe A', 'org_ti_probe_a'),
    (v_hB, 'ti-probe-b', 'TI Probe B', 'org_ti_probe_b');

  INSERT INTO public.room_types (id, hotel_id, name, slug, base_price) VALUES
    (v_rtA, v_hA, 'Double A', 'double-a', 100),
    (v_rtB, v_hB, 'Double B', 'double-b', 100);

  INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number, status) VALUES
    (v_rmB, v_hB, v_rtB, 'B-101', 'available');

  -- Cross-tenant room -> room_type must fail with foreign_key_violation
  BEGIN
    INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status)
    VALUES (v_hA, v_rtB, 'X-999', 'available');
    RAISE EXCEPTION 'FAIL cross-tenant room -> room_type insert was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- Cross-tenant availability_block -> room must fail with foreign_key_violation
  BEGIN
    INSERT INTO public.availability_blocks (hotel_id, room_id, start_date, end_date, reason)
    VALUES (v_hA, v_rmB, current_date + 10, current_date + 12, 'maintenance');
    RAISE EXCEPTION 'FAIL cross-tenant availability_block -> room insert was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  RAISE NOTICE 'PASS tenant_integrity: cross-tenant room and block writes rejected structurally';
END
$cross_tenant_probe$;

ROLLBACK;
