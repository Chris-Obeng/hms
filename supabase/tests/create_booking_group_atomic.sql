-- =============================================================================
-- Regression probe: create_booking_group_atomic composes the single-room writer
-- once per line inside one transaction, links the rows with a shared group_id,
-- resolves the guest exactly once, and is all-or-nothing — a single failing line
-- rolls the whole reservation back with no orphan booking, night or guest.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/create_booking_group_atomic.sql
--
-- One transaction, always rolled back: safe against a local stack, leaves no
-- rows. weekend_price = base_price so figures do not depend on the weekday.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on

\set hotel 'd0d0d0d0-0000-4000-8000-00000000000a'
\set rtA   'd1d1d1d1-0000-4000-8000-000000000001'
\set rtB   'd1d1d1d1-0000-4000-8000-000000000002'

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency, settings) VALUES
  (:'hotel', 'group-probe', 'Group Probe', 'org_group_probe', 'GHS',
   jsonb_build_object('tax_enabled', true, 'tax_percentage', 12.5));

INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  (:'rtA', :'hotel', 'Group Double', 'group-double', 450.00, 450.00, 2, 2),
  (:'rtB', :'hotel', 'Group Single', 'group-single', 300.00, 300.00, 2, 0);

-- Two rooms of each type: enough for the happy path, not enough to survive the
-- cross-line oversell probe (which asks for more of one type than exists).
INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status) VALUES
  (:'hotel', :'rtA', 'GA-101', 'available'),
  (:'hotel', :'rtA', 'GA-102', 'available'),
  (:'hotel', :'rtB', 'GB-101', 'available'),
  (:'hotel', :'rtB', 'GB-102', 'available');

-- -----------------------------------------------------------------------------
-- 1. Happy path: one guest, two room lines of DIFFERENT types, one call.
--
--    Line A: 450.00 x 2 nights x 1 room, 12.5% tax -> total 1012.50 (101250 minor)
--    Line B: 300.00 x 2 nights x 1 room, 12.5% tax -> total  675.00 ( 67500 minor)
--    group_total_minor = 168750
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_out       jsonb;
  v_anchor    uuid;
  v_group_ref text;
  v_lines     jsonb;
  v_bidA      uuid;
  v_bidB      uuid;
  v_grp_count integer;
  v_guest_ct  integer;
  v_ref_ct    integer;
BEGIN
  v_out := public.create_booking_group_atomic(jsonb_build_object(
    'hotel_id',           'd0d0d0d0-0000-4000-8000-00000000000a',
    'guest_name',         'Akua Group',
    'guest_email',        'akua.group@example.test',
    'guest_phone',        '+233200000009',
    'status',             'pending',
    'payment_status',     'unpaid',
    'payment_preference', 'pay_now',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
        'check_in',     (current_date + 10)::text,
        'check_out',    (current_date + 12)::text,
        'adults',       2,
        'rooms_count',  1),
      jsonb_build_object(
        'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000002',
        'check_in',     (current_date + 10)::text,
        'check_out',    (current_date + 12)::text,
        'adults',       1,
        'rooms_count',  1))));

  v_anchor    := (v_out->>'group_id')::uuid;
  v_group_ref := v_out->>'group_reference';
  v_lines     := v_out->'lines';

  IF jsonb_array_length(v_lines) <> 2 OR (v_out->>'line_count')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL 1a: expected 2 lines, got % / %',
      jsonb_array_length(v_lines), v_out->>'line_count';
  END IF;

  IF (v_out->>'group_total_minor')::bigint <> 168750 THEN
    RAISE EXCEPTION 'FAIL 1b: group total minor wrong — %', v_out->>'group_total_minor';
  END IF;

  IF (v_out->>'currency') <> 'GHS' THEN
    RAISE EXCEPTION 'FAIL 1c: currency wrong — %', v_out->>'currency';
  END IF;

  v_bidA := (v_lines->0->>'booking_id')::uuid;
  v_bidB := (v_lines->1->>'booking_id')::uuid;

  -- Anchor is the first line; both rows share group_id = anchor id.
  IF v_bidA <> v_anchor THEN
    RAISE EXCEPTION 'FAIL 1d: anchor is not the first line — % vs %', v_anchor, v_bidA;
  END IF;

  SELECT count(*) INTO v_grp_count FROM public.bookings
   WHERE group_id = v_anchor;
  IF v_grp_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 1e: expected 2 rows linked by group_id, got %', v_grp_count;
  END IF;

  -- The group reference is the anchor row's own reference.
  IF v_group_ref <> (SELECT reference FROM public.bookings WHERE id = v_anchor) THEN
    RAISE EXCEPTION 'FAIL 1f: group_reference is not the anchor reference';
  END IF;

  -- Each line keeps its own distinct staff-facing reference.
  SELECT count(DISTINCT reference) INTO v_ref_ct FROM public.bookings
   WHERE group_id = v_anchor;
  IF v_ref_ct <> 2 THEN
    RAISE EXCEPTION 'FAIL 1g: lines must keep distinct references, got % distinct', v_ref_ct;
  END IF;

  -- Guest resolved exactly once for the whole group.
  SELECT count(*) INTO v_guest_ct FROM public.guests
   WHERE hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
     AND lower(email) = 'akua.group@example.test';
  IF v_guest_ct <> 1 THEN
    RAISE EXCEPTION 'FAIL 1h: guest resolved % times, expected once', v_guest_ct;
  END IF;

  -- Per-line money matches what the single-room writer would have produced.
  IF (SELECT total_amount FROM public.bookings WHERE id = v_bidA) <> 1012.50
     OR (SELECT total_amount FROM public.bookings WHERE id = v_bidB) <> 675.00 THEN
    RAISE EXCEPTION 'FAIL 1i: per-line totals wrong';
  END IF;

  RAISE NOTICE 'PASS 1: a two-type group is one guest, two linked lines, correct totals';
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. All-or-nothing: one line asks for more rooms than the type has. The whole
--    group must roll back — no booking, no night, no orphan guest survives.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_detail   text := '<accepted>';
  v_bk_before bigint;
  v_bk_after  bigint;
  v_g_after   bigint;
BEGIN
  SELECT count(*) INTO v_bk_before FROM public.bookings
   WHERE hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a';

  BEGIN
    PERFORM public.create_booking_group_atomic(jsonb_build_object(
      'hotel_id',    'd0d0d0d0-0000-4000-8000-00000000000a',
      'guest_name',  'Rollback Probe',
      'guest_email', 'rollback.group@example.test',
      'lines', jsonb_build_array(
        jsonb_build_object(
          'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
          'check_in',     (current_date + 30)::text,
          'check_out',    (current_date + 32)::text,
          'rooms_count',  1),
        -- rtB has only 2 rooms; asking for 3 must fail this line.
        jsonb_build_object(
          'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000002',
          'check_in',     (current_date + 30)::text,
          'check_out',    (current_date + 32)::text,
          'rooms_count',  3))));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail <> 'no_availability' THEN
    RAISE EXCEPTION 'FAIL 2a: expected no_availability, got %', v_detail;
  END IF;

  SELECT count(*) INTO v_bk_after FROM public.bookings
   WHERE hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a';
  IF v_bk_after <> v_bk_before THEN
    RAISE EXCEPTION 'FAIL 2b: a failed group left % booking row(s) behind', v_bk_after - v_bk_before;
  END IF;

  SELECT count(*) INTO v_g_after FROM public.guests
   WHERE hotel_id = 'd0d0d0d0-0000-4000-8000-00000000000a'
     AND lower(email) = 'rollback.group@example.test';
  IF v_g_after <> 0 THEN
    RAISE EXCEPTION 'FAIL 2c: a failed group created an orphan guest';
  END IF;

  RAISE NOTICE 'PASS 2: one failing line rolls the whole group back, no orphans';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Cross-line same-type oversell: two lines of the SAME type on overlapping
--    dates whose combined rooms exceed inventory. The second line's own
--    availability gate must see the first line's hold within this transaction
--    and refuse — proving siblings are not double-sold.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_detail text := '<accepted>';
BEGIN
  BEGIN
    PERFORM public.create_booking_group_atomic(jsonb_build_object(
      'hotel_id',    'd0d0d0d0-0000-4000-8000-00000000000a',
      'guest_name',  'Oversell Probe',
      'guest_email', 'oversell.group@example.test',
      'lines', jsonb_build_array(
        jsonb_build_object(
          'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
          'check_in',     (current_date + 50)::text,
          'check_out',    (current_date + 52)::text,
          'rooms_count',  2),
        -- rtA has only 2 rooms; the first line already holds both.
        jsonb_build_object(
          'room_type_id', 'd1d1d1d1-0000-4000-8000-000000000001',
          'check_in',     (current_date + 50)::text,
          'check_out',    (current_date + 52)::text,
          'rooms_count',  1))));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail <> 'no_availability' THEN
    RAISE EXCEPTION 'FAIL 3a: cross-line oversell gave %, expected no_availability', v_detail;
  END IF;

  RAISE NOTICE 'PASS 3: a sibling line cannot oversell inventory a prior line holds';
END;
$$;

ROLLBACK;
