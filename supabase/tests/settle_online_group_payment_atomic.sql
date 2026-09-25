-- =============================================================================
-- Regression probe: settle_online_group_payment_atomic splits ONE verified
-- Paystack charge across the bookings sharing group_id — one payments row per
-- line (amount = that line's total, reference '<rawRef>::<bookingId>'), the real
-- paystack_id on the ANCHOR line only, each line flipped pending -> confirmed.
-- Replay is idempotent per line; an amount that does not equal the sum of the
-- line totals is refused and records nothing.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/settle_online_group_payment_atomic.sql
--
-- One transaction, always rolled back. The group is built with the vetted
-- create_booking_group_atomic so the line totals are real, not hand-forged.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on

\set hotel 'e0e0e0e0-0000-4000-8000-00000000000a'
\set rtA   'e1e1e1e1-0000-4000-8000-000000000001'
\set rtB   'e1e1e1e1-0000-4000-8000-000000000002'

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency, paystack_subaccount_code, settings) VALUES
  (:'hotel', 'settle-group-probe', 'Settle Group Probe', 'org_settle_group', 'GHS', 'ACCT_settle_group',
   jsonb_build_object('tax_enabled', true, 'tax_percentage', 12.5));

INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  (:'rtA', :'hotel', 'SG Double', 'sg-double', 450.00, 450.00, 2, 2),
  (:'rtB', :'hotel', 'SG Single', 'sg-single', 300.00, 300.00, 2, 0);

INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status) VALUES
  (:'hotel', :'rtA', 'SGA-101', 'available'),
  (:'hotel', :'rtB', 'SGB-101', 'available');

-- -----------------------------------------------------------------------------
-- Build one two-line group, one attempt on the anchor, then settle it once.
--   Line A: 1012.50 (101250 minor)   Line B: 675.00 (67500 minor)
--   group total = 168750 minor
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_grp        jsonb;
  v_anchor     uuid;
  v_group_ref  text;
  v_bidA       uuid;
  v_bidB       uuid;
  v_raw_ref    text;
  v_pid        text := 'PID_settle_group_1';
  v_meta       jsonb;
  v_row        record;
  v_count      int;
  v_anchor_pid text;
  v_sib_pid    text;
  v_err        text;
BEGIN
  v_grp := public.create_booking_group_atomic(jsonb_build_object(
    'hotel_id',           'e0e0e0e0-0000-4000-8000-00000000000a',
    'guest_name',         'Kwame Settle',
    'guest_email',        'kwame.settle@example.test',
    'status',             'pending',
    'payment_status',     'unpaid',
    'payment_preference', 'pay_now',
    'lines', jsonb_build_array(
      jsonb_build_object('room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
        'check_in', (current_date + 10)::text, 'check_out', (current_date + 12)::text, 'rooms_count', 1),
      jsonb_build_object('room_type_id', 'e1e1e1e1-0000-4000-8000-000000000002',
        'check_in', (current_date + 10)::text, 'check_out', (current_date + 12)::text, 'rooms_count', 1))));

  v_anchor    := (v_grp->>'group_id')::uuid;
  v_group_ref := v_grp->>'group_reference';
  v_bidA      := (v_grp->'lines'->0->>'booking_id')::uuid;
  v_bidB      := (v_grp->'lines'->1->>'booking_id')::uuid;
  v_raw_ref   := 'RL-GRP-' || substr(v_anchor::text, 1, 8);

  ASSERT (v_grp->>'group_total_minor')::bigint = 168750, 'fixture group total wrong';

  v_meta := jsonb_build_object(
    'group_id', v_anchor::text,
    'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
    'group_reference', v_group_ref);

  -- ONE attempt on the anchor, keyed by the raw group reference, group total.
  INSERT INTO public.payment_attempts (hotel_id, booking_id, paystack_reference, amount_minor, currency,
                                       expected_subaccount_code, metadata, status, initialized_at)
  VALUES ('e0e0e0e0-0000-4000-8000-00000000000a', v_anchor, v_raw_ref, 168750, 'GHS', 'ACCT_settle_group',
          v_meta, 'initialized', now());

  -- ---- Happy path: one charge -> two credited bookings ----
  SELECT * INTO v_row FROM public.settle_online_group_payment_atomic(
    v_anchor, 'e0e0e0e0-0000-4000-8000-00000000000a', v_raw_ref, v_pid, 168750, 'GHS', 'ACCT_settle_group', v_meta);

  ASSERT v_row.result = 'recorded', 'expected recorded, got ' || v_row.result;
  ASSERT v_row.line_count = 2, 'expected 2 lines settled';
  ASSERT v_row.all_confirmed, 'expected all lines confirmed';
  ASSERT v_row.amount_paid_minor = 168750, 'expected 168750 minor paid, got ' || v_row.amount_paid_minor;

  -- One payments row per line, derived reference each.
  SELECT count(*) INTO v_count FROM public.payments
   WHERE paystack_reference IN (v_raw_ref || '::' || v_bidA::text, v_raw_ref || '::' || v_bidB::text)
     AND status = 'success';
  ASSERT v_count = 2, 'expected two derived-reference payment rows, got ' || v_count;

  -- Real paystack_id on the anchor line only; sibling NULL.
  SELECT paystack_id INTO v_anchor_pid FROM public.payments WHERE booking_id = v_bidA;
  SELECT paystack_id INTO v_sib_pid    FROM public.payments WHERE booking_id = v_bidB;
  ASSERT v_anchor_pid = v_pid, 'anchor line must carry the real paystack_id';
  ASSERT v_sib_pid IS NULL, 'sibling line must have NULL paystack_id';

  -- Both bookings flipped to confirmed / paid.
  SELECT count(*) INTO v_count FROM public.bookings
   WHERE group_id = v_anchor AND status = 'confirmed' AND payment_status = 'paid';
  ASSERT v_count = 2, 'expected both lines confirmed+paid, got ' || v_count;

  -- Attempt marked succeeded, carries the real id.
  SELECT count(*) INTO v_count FROM public.payment_attempts
   WHERE paystack_reference = v_raw_ref AND status = 'succeeded' AND paystack_id = v_pid;
  ASSERT v_count = 1, 'expected attempt succeeded with paystack_id';

  -- ---- Replay: same payload is a no-op, no duplicate payment rows ----
  SELECT * INTO v_row FROM public.settle_online_group_payment_atomic(
    v_anchor, 'e0e0e0e0-0000-4000-8000-00000000000a', v_raw_ref, v_pid, 168750, 'GHS', 'ACCT_settle_group', v_meta);

  ASSERT v_row.already_recorded, 'expected already_recorded on replay';
  ASSERT v_row.result = 'already_recorded', 'expected already_recorded result on replay';

  SELECT count(*) INTO v_count FROM public.payments WHERE booking_id IN (v_bidA, v_bidB);
  ASSERT v_count = 2, 'replay must not duplicate payment rows, got ' || v_count;

  RAISE NOTICE 'PASS: one charge settles a two-line group, anchor-only id, replay idempotent';
END;
$$;

-- -----------------------------------------------------------------------------
-- Amount mismatch: a charge whose amount != sum of line totals is refused and
-- records nothing. A fresh group + attempt keeps it independent of the above.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_grp     jsonb;
  v_anchor  uuid;
  v_ref     text;
  v_meta    jsonb;
  v_err     text := '<accepted>';
  v_count   int;
BEGIN
  v_grp := public.create_booking_group_atomic(jsonb_build_object(
    'hotel_id',    'e0e0e0e0-0000-4000-8000-00000000000a',
    'guest_name',  'Mismatch Probe',
    'guest_email', 'mismatch.group@example.test',
    'lines', jsonb_build_array(
      jsonb_build_object('room_type_id', 'e1e1e1e1-0000-4000-8000-000000000001',
        'check_in', (current_date + 40)::text, 'check_out', (current_date + 42)::text, 'rooms_count', 1),
      jsonb_build_object('room_type_id', 'e1e1e1e1-0000-4000-8000-000000000002',
        'check_in', (current_date + 40)::text, 'check_out', (current_date + 42)::text, 'rooms_count', 1))));

  v_anchor := (v_grp->>'group_id')::uuid;
  v_ref    := 'RL-GRP-MM-' || substr(v_anchor::text, 1, 8);
  v_meta   := jsonb_build_object(
    'group_id', v_anchor::text,
    'hotel_id', 'e0e0e0e0-0000-4000-8000-00000000000a',
    'group_reference', v_grp->>'group_reference');

  INSERT INTO public.payment_attempts (hotel_id, booking_id, paystack_reference, amount_minor, currency,
                                       expected_subaccount_code, metadata, status, initialized_at)
  VALUES ('e0e0e0e0-0000-4000-8000-00000000000a', v_anchor, v_ref, 168750, 'GHS', 'ACCT_settle_group',
          v_meta, 'initialized', now());

  BEGIN
    PERFORM public.settle_online_group_payment_atomic(
      v_anchor, 'e0e0e0e0-0000-4000-8000-00000000000a', v_ref, 'PID_mm', 168749, 'GHS', 'ACCT_settle_group', v_meta);
    ASSERT false, 'amount mismatch should have raised';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT position('amount mismatch' in v_err) > 0, 'expected amount mismatch, got: ' || v_err;
  END;

  SELECT count(*) INTO v_count FROM public.payments WHERE booking_id = v_anchor;
  ASSERT v_count = 0, 'mismatch must record no payment';

  RAISE NOTICE 'PASS: a group charge that mis-sums the line totals is refused';
END;
$$;

ROLLBACK;
