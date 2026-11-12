-- =============================================================================
-- Regression probe: RBAC self-escalation guards, multi-hotel staff membership,
-- push_subscriptions tenancy, recipient-scoped notifications RLS, audit-log
-- immutability with staff deletion safety, physical room vs availability_block
-- symmetry, room_types slug uniqueness, RPC bounds/tenant isolation, Arkesel
-- NOT VALID email-only check, and reconcile_pending_payments() execution.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on

-- ── 1. Arkesel removal & notification_logs email-only check ──────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'hotels'
       AND column_name IN ('arkesel_api_key', 'arkesel_sender_name')
  ) THEN
    RAISE EXCEPTION 'FAIL 1a: Arkesel columns still exist on public.hotels';
  END IF;
  RAISE NOTICE 'PASS 1: Arkesel columns removed from public.hotels';
END $$;

-- ── 2. Fixture: two hotels + multi-hotel user + full staff rung set ──────────
INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency, status) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'guard-hotel-a', 'Guard Hotel A', 'org_guard_a', 'GHS', 'active'),
  ('f1000000-0000-4000-8000-000000000002', 'guard-hotel-b', 'Guard Hotel B', 'org_guard_b', 'GHS', 'active');

INSERT INTO public.room_types (id, hotel_id, name, slug, base_price, weekend_price) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Deluxe', 'deluxe', 300, 300),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'Suite',  'suite',  500, 500),
  ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', 'HotelB', 'deluxe', 400, 400);

-- H-08: Duplicate room_types (hotel_id, slug) within same hotel MUST fail:
DO $$
BEGIN
  BEGIN
    INSERT INTO public.room_types (hotel_id, name, slug, base_price)
    VALUES ('f1000000-0000-4000-8000-000000000001', 'Dup Deluxe', 'deluxe', 300);
    RAISE EXCEPTION 'FAIL 1b: duplicate room_types (hotel_id, slug) was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- New SMS notification_logs write MUST fail via NOT VALID email-only check:
  BEGIN
    INSERT INTO public.notification_logs (hotel_id, event_type, channel, provider, recipient)
    VALUES ('f1000000-0000-4000-8000-000000000001', 'booking_confirmed', 'sms', 'arkesel', '+233200000000');
    RAISE EXCEPTION 'FAIL 1c: new SMS notification_logs row was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Resend email notification_logs write MUST succeed:
  INSERT INTO public.notification_logs (hotel_id, event_type, channel, provider, recipient)
  VALUES ('f1000000-0000-4000-8000-000000000001', 'booking_confirmed', 'email', 'resend', 'guest@guard.test');

  RAISE NOTICE 'PASS 1b: room_types (hotel_id, slug) unique and new SMS notification_logs blocked';
END $$;

INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number, status) VALUES
  ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', '101', 'available'),
  ('f3000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', '102', 'available'),
  ('f3000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', '201', 'available'),
  ('f3000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000003', 'B-1', 'available');

-- Multi-hotel Clerk user (`user_multi_org`) belongs to BOTH org_guard_a and org_guard_b:
INSERT INTO public.staff_profiles (id, clerk_user_id, clerk_org_id, email, role, is_active) VALUES
  ('f4000000-0000-4000-8000-000000000001', 'user_guard_ro',    'org_guard_a', 'ro@guard.test',    'read_only',   true),
  ('f4000000-0000-4000-8000-000000000002', 'user_guard_fd',    'org_guard_a', 'fd@guard.test',    'front_desk',  true),
  ('f4000000-0000-4000-8000-000000000003', 'user_guard_mgr',   'org_guard_a', 'mgr@guard.test',   'manager',     true),
  ('f4000000-0000-4000-8000-000000000004', 'user_multi_org',   'org_guard_a', 'owner@guard.test', 'super_admin', true),
  ('f4000000-0000-4000-8000-000000000005', 'user_multi_org',   'org_guard_b', 'owner@guard.test', 'super_admin', true),
  ('f4000000-0000-4000-8000-000000000006', 'user_guard_stale', 'org_guard_a', 'stale@guard.test', 'manager',     false),
  ('f4000000-0000-4000-8000-000000000007', 'user_guard_sa2',   'org_guard_a', 'sa2@guard.test',   'super_admin', true);

-- Seed one broadcast notification and one super_admin-targeted notification:
INSERT INTO public.notifications (id, hotel_id, recipient_staff_id, type, title, message) VALUES
  ('f5000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', NULL, 'new_booking', 'Broadcast', 'Hotel-wide alert'),
  ('f5000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000004', 'staff_access_request', 'Private Owner Alert', 'Super admin only');

DO $$ BEGIN
  RAISE NOTICE 'PASS 2: one Clerk user can hold staff_profiles across multiple hotel organizations';
END $$;

-- ── 3. Self-escalation, notifications privacy, RPC bounds & RBAC under authenticated
SELECT set_config('request.jwt.claims', '{"sub":"user_guard_ro","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_rows int;
BEGIN
  -- Benign self notification_prefs update MUST succeed:
  UPDATE public.staff_profiles
     SET notification_prefs = '{"new_booking":false}'::jsonb
   WHERE id = 'f4000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 3a: read_only could not update own notification_prefs';
  END IF;

  -- Self-escalation to super_admin MUST fail (C-02):
  BEGIN
    UPDATE public.staff_profiles
       SET role = 'super_admin'
     WHERE id = 'f4000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL 3b: read_only escalated own role to super_admin!';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- read_only updating hotels MUST update 0 rows:
  UPDATE public.hotels
     SET name = 'Hijacked'
   WHERE id = 'f1000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 3c: read_only modified public.hotels';
  END IF;

  -- read_only inserting a cross-tenant push_subscription MUST fail:
  BEGIN
    INSERT INTO public.push_subscriptions (hotel_id, staff_id, endpoint, p256dh, auth)
    VALUES ('f1000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000001',
            'https://push.example.test/1', 'k1', 'a1');
    RAISE EXCEPTION 'FAIL 3d: cross-tenant push_subscription accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Own-hotel push_subscription MUST succeed for active staff:
  INSERT INTO public.push_subscriptions (hotel_id, staff_id, endpoint, p256dh, auth)
  VALUES ('f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001',
          'https://push.example.test/valid', 'k1', 'a1');

  -- Notifications privacy (M-01): read_only sees broadcast (1), NOT super_admin's targeted alert:
  SELECT count(*) INTO v_rows FROM public.notifications
   WHERE hotel_id = 'f1000000-0000-4000-8000-000000000001';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 3g: read_only saw % notifications, expected 1 (broadcast only)', v_rows;
  END IF;

  -- Marking broadcast notification as read succeeds, tampering with title fails:
  UPDATE public.notifications SET is_read = true
   WHERE id = 'f5000000-0000-4000-8000-000000000001';

  BEGIN
    UPDATE public.notifications SET title = 'Tampered'
     WHERE id = 'f5000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL 3h: authenticated caller tampered with notification title';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- H-05: Cross-tenant room_type_available_counts returns 0 rows for Hotel B under Hotel A's JWT:
  SELECT count(*) INTO v_rows
    FROM public.room_type_available_counts(
      ARRAY['f2000000-0000-4000-8000-000000000003'::uuid],
      current_date + 5, current_date + 7
    );
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 3i: authenticated user of Hotel A read Hotel B availability (% rows)', v_rows;
  END IF;

  -- H-05: >400 night span rejected with 22023 (DoS guard):
  BEGIN
    PERFORM * FROM public.room_type_available_counts(
      ARRAY['f2000000-0000-4000-8000-000000000001'::uuid],
      date '2026-01-01', date '2030-01-01'
    );
    RAISE EXCEPTION 'FAIL 3j: 4-year availability span was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  RAISE NOTICE 'PASS 3: read_only blocked from self-escalation, hotel mutation, cross-hotel push/availability, notification leaks, and DoS spans';
END $$;

RESET ROLE;

-- Manager hierarchy checks:
SELECT set_config('request.jwt.claims', '{"sub":"user_guard_mgr","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  UPDATE public.staff_profiles
     SET role = 'front_desk'
   WHERE id = 'f4000000-0000-4000-8000-000000000001';

  BEGIN
    UPDATE public.staff_profiles
       SET role = 'super_admin'
     WHERE id = 'f4000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL 3e: manager granted super_admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.staff_profiles
       SET is_active = false
     WHERE id = 'f4000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'FAIL 3f: manager deactivated a super_admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'PASS 4: manager can administer non-super_admin roles up to manager, never super_admin';
END $$;

RESET ROLE;

-- ── 4. Physical room vs availability_blocks conflict symmetry (incl. direct UPDATE)
DO $$
DECLARE
  v_out    jsonb;
  v_bid    uuid;
  v_detail text;
BEGIN
  -- Block Room 101 across [current_date + 30, current_date + 33):
  INSERT INTO public.availability_blocks (hotel_id, room_id, start_date, end_date, reason, created_by)
  VALUES ('f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
          current_date + 30, current_date + 33, 'renovation', 'f4000000-0000-4000-8000-000000000002');

  -- M-02: Overlapping availability_block on Room 101 MUST fail with exclusion_violation:
  BEGIN
    INSERT INTO public.availability_blocks (hotel_id, room_id, start_date, end_date, reason)
    VALUES ('f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
            current_date + 31, current_date + 34, 'maintenance');
    RAISE EXCEPTION 'FAIL 5a0: overlapping availability_block on same room accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  -- Explicit booking on blocked Room 101 MUST reject as room_not_bookable:
  v_detail := '<accepted>';
  BEGIN
    PERFORM public.create_booking_atomic(jsonb_build_object(
      'hotel_id',     'f1000000-0000-4000-8000-000000000001',
      'room_type_id', 'f2000000-0000-4000-8000-000000000001',
      'room_id',      'f3000000-0000-4000-8000-000000000001',
      'check_in',     (current_date + 31)::text,
      'check_out',    (current_date + 33)::text,
      'guest_name',   'Blocked Probe'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail <> 'room_not_bookable' THEN
    RAISE EXCEPTION 'FAIL 5a: explicit booking onto blocked room gave %', v_detail;
  END IF;

  -- Auto-assign (`assign_room: true`) MUST skip blocked Room 101 and pick Room 102:
  v_out := public.create_booking_atomic(jsonb_build_object(
    'hotel_id',     'f1000000-0000-4000-8000-000000000001',
    'room_type_id', 'f2000000-0000-4000-8000-000000000001',
    'assign_room',  true,
    'created_by',   'f4000000-0000-4000-8000-000000000002',
    'check_in',     (current_date + 30)::text,
    'check_out',    (current_date + 32)::text,
    'guest_name',   'Auto Assign Probe'));

  v_bid := (v_out->>'booking_id')::uuid;
  IF (v_out->>'room_id')::uuid <> 'f3000000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'FAIL 5b: auto-assign picked %, expected Room 102', v_out->>'room_id';
  END IF;

  -- Blocking occupied Room 102 over those dates MUST fail with exclusion_violation:
  BEGIN
    INSERT INTO public.availability_blocks (hotel_id, room_id, start_date, end_date, reason)
    VALUES ('f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002',
            current_date + 31, current_date + 34, 'maintenance');
    RAISE EXCEPTION 'FAIL 5c: blocking an occupied room was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  -- Direct UPDATE bookings SET room_id = <blocked Room 101> MUST fail (M-02):
  BEGIN
    UPDATE public.bookings
       SET room_id = 'f3000000-0000-4000-8000-000000000001'
     WHERE id = v_bid;
    RAISE EXCEPTION 'FAIL 5d1: direct UPDATE bookings.room_id onto blocked room accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  -- Direct UPDATE bookings SET room_id = <Suite Room 201> on Deluxe booking MUST fail (M-02):
  BEGIN
    UPDATE public.bookings
       SET room_id = 'f3000000-0000-4000-8000-000000000003'
     WHERE id = v_bid;
    RAISE EXCEPTION 'FAIL 5d2: direct UPDATE bookings.room_id onto wrong room_type_id accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Repricing Room 102 booking onto blocked Room 101 MUST reject as room_not_bookable:
  v_detail := '<accepted>';
  BEGIN
    PERFORM public.reprice_booking_stay(jsonb_build_object(
      'booking_id', v_bid,
      'hotel_id',   'f1000000-0000-4000-8000-000000000001',
      'room_id',    'f3000000-0000-4000-8000-000000000001'));
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  END;

  IF v_detail <> 'room_not_bookable' THEN
    RAISE EXCEPTION 'FAIL 5d: repricing onto blocked room gave %', v_detail;
  END IF;

  RAISE NOTICE 'PASS 5: physical room vs availability_blocks & room_type enforced on RPCs and direct UPDATEs';
END $$;

-- ── 5. Audit immutability + safe staff deletion when audit history exists (H-06)
DO $$
DECLARE
  v_audit_id   uuid;
  v_staff_name text;
  v_staff_fk   uuid;
BEGIN
  INSERT INTO public.audit_logs (hotel_id, staff_id, staff_name, action, entity_type)
  VALUES ('f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000002',
          'Front Desk Actor', 'booking.created', 'booking')
  RETURNING id INTO v_audit_id;

  -- Direct UPDATE on audit_logs (even setting staff_id = NULL directly) MUST fail:
  BEGIN
    UPDATE public.audit_logs SET staff_id = NULL WHERE id = v_audit_id;
    RAISE EXCEPTION 'FAIL 6a: direct UPDATE on audit_logs was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  -- Deleting the non-super_admin staff profile (`user_guard_fd`, who authored a
  -- booking, an availability_block, and an audit_logs entry) MUST succeed,
  -- nulling staff_id via RI cascade while preserving staff_name & action:
  DELETE FROM public.staff_profiles WHERE id = 'f4000000-0000-4000-8000-000000000002';

  SELECT staff_id, staff_name INTO v_staff_fk, v_staff_name
    FROM public.audit_logs WHERE id = v_audit_id;
  IF v_staff_fk IS NOT NULL OR v_staff_name <> 'Front Desk Actor' THEN
    RAISE EXCEPTION 'FAIL 6b: audit row after staff delete had staff_id=%, staff_name=%', v_staff_fk, v_staff_name;
  END IF;

  -- Deleting a hotel that holds audit_logs MUST be refused by ON DELETE RESTRICT:
  BEGIN
    DELETE FROM public.hotels WHERE id = 'f1000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL 6c: deleting a hotel with audit history succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  RAISE NOTICE 'PASS 6: audit_logs immutable against direct edits/deletes while allowing staff deletion ON DELETE SET NULL';
END $$;

-- ── 6. reconcile_pending_payments() executes cleanly ─────────────────────────
DO $$
DECLARE
  v_fired int;
BEGIN
  v_fired := public.reconcile_pending_payments();
  IF v_fired IS NULL OR v_fired < 0 THEN
    RAISE EXCEPTION 'FAIL 7: reconcile_pending_payments returned %', v_fired;
  END IF;
  RAISE NOTICE 'PASS 7: reconcile_pending_payments() executes cleanly (returned %)', v_fired;
END $$;

ROLLBACK;
