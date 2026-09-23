-- Atomic online-payment settlement regression tests.
BEGIN;

\set ON_ERROR_STOP on

INSERT INTO public.hotels (
  id, slug, name, clerk_org_id, currency, paystack_subaccount_code, status
) VALUES
  ('10000000-0000-0000-0000-000000000001', 'settle-a', 'Settle A', 'org-settle-a', 'GHS', 'ACCT_A', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'settle-b', 'Settle B', 'org-settle-b', 'GHS', 'ACCT_B', 'active');

INSERT INTO public.bookings (
  id, hotel_id, reference, check_in, check_out, room_rate, subtotal,
  total_amount, amount_paid, currency, status, payment_status
) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'SETTLE-1', '2026-12-01', '2026-12-02', 500, 500, 500, 0, 'GHS', 'pending', 'unpaid'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'SETTLE-2', '2026-12-03', '2026-12-04', 500, 500, 500, 0, 'GHS', 'pending', 'unpaid'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   'SETTLE-3', '2026-12-05', '2026-12-06', 500, 500, 500, 0, 'GHS', 'pending', 'unpaid');

INSERT INTO public.payment_attempts (
  id, hotel_id, booking_id, paystack_reference, amount_minor, currency,
  expected_subaccount_code, metadata, status
) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'SETTLE-1-FULL', 50000, 'GHS', 'ACCT_A',
   '{"booking_id":"20000000-0000-0000-0000-000000000001","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-1"}', 'initialized'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', 'SETTLE-2-P1', 30000, 'GHS', 'ACCT_A',
   '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}', 'initialized'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', 'SETTLE-2-P2', 20000, 'GHS', 'ACCT_A',
   '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}', 'initialized'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', 'SETTLE-2-OVER', 5000, 'GHS', 'ACCT_A',
   '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}', 'initialized');

CREATE TEMP TABLE settlement_results AS
SELECT * FROM public.settle_online_payment_atomic(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'SETTLE-1-FULL', '900001', 50000, 'GHS', 'ACCT_A',
  '{"booking_id":"20000000-0000-0000-0000-000000000001","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-1"}'
);

DO $first$
DECLARE
  v_result record;
  v_payment_count integer;
BEGIN
  SELECT * INTO v_result FROM settlement_results;
  IF v_result.result <> 'recorded' OR v_result.already_recorded
     OR v_result.amount_paid_minor <> 50000
     OR v_result.payment_status <> 'paid'
     OR v_result.booking_status <> 'confirmed'
     OR v_result.partial_payment THEN
    RAISE EXCEPTION 'FAIL first settlement returned %', row_to_json(v_result);
  END IF;

  SELECT count(*) INTO v_payment_count
    FROM public.payments WHERE paystack_reference = 'SETTLE-1-FULL';
  IF v_payment_count <> 1 THEN
    RAISE EXCEPTION 'FAIL first settlement inserted % payment rows', v_payment_count;
  END IF;
END
$first$;

TRUNCATE settlement_results;
INSERT INTO settlement_results
SELECT * FROM public.settle_online_payment_atomic(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'SETTLE-1-FULL', '900001', 50000, 'GHS', 'ACCT_A',
  '{"booking_id":"20000000-0000-0000-0000-000000000001","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-1"}'
);

DO $replay$
DECLARE v_result record;
BEGIN
  SELECT * INTO v_result FROM settlement_results;
  IF v_result.result <> 'already_recorded' OR NOT v_result.already_recorded
     OR v_result.amount_paid_minor <> 50000 THEN
    RAISE EXCEPTION 'FAIL exact replay returned %', row_to_json(v_result);
  END IF;
END
$replay$;

UPDATE public.bookings
   SET amount_paid = 0, payment_status = 'unpaid', status = 'pending'
 WHERE id = '20000000-0000-0000-0000-000000000001';

TRUNCATE settlement_results;
INSERT INTO settlement_results
SELECT * FROM public.settle_online_payment_atomic(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'SETTLE-1-FULL', '900001', 50000, 'GHS', 'ACCT_A',
  '{"booking_id":"20000000-0000-0000-0000-000000000001","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-1"}'
);

DO $repair$
DECLARE v_booking record;
BEGIN
  SELECT amount_paid, payment_status, status INTO v_booking
    FROM public.bookings
   WHERE id = '20000000-0000-0000-0000-000000000001';
  IF v_booking.amount_paid <> 500 OR v_booking.payment_status <> 'paid'
     OR v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL replay did not repair booking projection: %', row_to_json(v_booking);
  END IF;
END
$repair$;

CREATE OR REPLACE FUNCTION pg_temp.expect_failure(p_sql text, p_fragment text)
RETURNS void
LANGUAGE plpgsql
AS $expect$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL expected error containing %', p_fragment;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'FAIL expected error containing ' || p_fragment THEN
      RAISE;
    END IF;
    IF position(p_fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL expected %, got %', p_fragment, SQLERRM;
    END IF;
END
$expect$;

SELECT pg_temp.expect_failure($sql$
  SELECT * FROM public.settle_online_payment_atomic(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'SETTLE-1-FULL', '900099', 50000, 'GHS', 'ACCT_A',
    '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}'
  )
$sql$, 'payment attempt identity mismatch');

INSERT INTO public.payment_attempts (
  hotel_id, booking_id, paystack_reference, amount_minor, currency,
  expected_subaccount_code, metadata, status
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003', 'SETTLE-3-COLLISION', 50000,
  'GHS', 'ACCT_A',
  '{"booking_id":"20000000-0000-0000-0000-000000000003","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-3"}',
  'initialized'
);

SELECT pg_temp.expect_failure($sql$
  SELECT * FROM public.settle_online_payment_atomic(
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'SETTLE-3-COLLISION', '900001', 50000, 'GHS', 'ACCT_A',
    '{"booking_id":"20000000-0000-0000-0000-000000000003","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-3"}'
  )
$sql$, 'Paystack transaction ID collision');

SELECT pg_temp.expect_failure($sql$
  SELECT * FROM public.settle_online_payment_atomic(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'SETTLE-2-P1', '900002', 30000, 'GHS', 'ACCT_A',
    '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}'
  )
$sql$, 'booking not found or hotel mismatch');

SELECT pg_temp.expect_failure($sql$
  SELECT * FROM public.settle_online_payment_atomic(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'SETTLE-2-P1', '900002', 30000, 'USD', 'ACCT_A',
    '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}'
  )
$sql$, 'currency mismatch');

SELECT pg_temp.expect_failure($sql$
  SELECT * FROM public.settle_online_payment_atomic(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'SETTLE-2-P1', '900002', 29999, 'GHS', 'ACCT_A',
    '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}'
  )
$sql$, 'amount mismatch');

SELECT pg_temp.expect_failure($sql$
  SELECT * FROM public.settle_online_payment_atomic(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'SETTLE-2-P1', '900002', 30000, 'GHS', 'ACCT_B',
    '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}'
  )
$sql$, 'subaccount mismatch');

SELECT * FROM public.settle_online_payment_atomic(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'SETTLE-2-P1', '900002', 30000, 'GHS', 'ACCT_A',
  '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}'
);
SELECT * FROM public.settle_online_payment_atomic(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'SETTLE-2-P2', '900003', 20000, 'GHS', 'ACCT_A',
  '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}'
);

DO $partials$
DECLARE v_booking record;
BEGIN
  SELECT amount_paid, payment_status, status INTO v_booking
    FROM public.bookings
   WHERE id = '20000000-0000-0000-0000-000000000002';
  IF v_booking.amount_paid <> 500 OR v_booking.payment_status <> 'paid'
     OR v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL partial settlements lost money: %', row_to_json(v_booking);
  END IF;
END
$partials$;

SELECT * FROM public.settle_online_payment_atomic(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'SETTLE-2-OVER', '900004', 5000, 'GHS', 'ACCT_A',
  '{"booking_id":"20000000-0000-0000-0000-000000000002","hotel_id":"10000000-0000-0000-0000-000000000001","booking_reference":"SETTLE-2"}'
);

DO $overpayment$
DECLARE v_booking record;
BEGIN
  SELECT amount_paid, payment_status, status INTO v_booking
    FROM public.bookings
   WHERE id = '20000000-0000-0000-0000-000000000002';
  IF v_booking.amount_paid <> 550 OR v_booking.payment_status <> 'paid'
     OR v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL overpayment projection wrong: %', row_to_json(v_booking);
  END IF;
END
$overpayment$;

ROLLBACK;
