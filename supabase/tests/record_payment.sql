-- Regression harness for staff-recorded payments (Booking › Payments › Save
-- payment). The client-write guard (20261112160347) stops a staff JWT from
-- changing amount_paid, so record_payment_atomic must be called by the
-- server with the service role, after the server action has checked the
-- staff role. A staff JWT calling it directly is refused with the error staff
-- used to see: "Cannot directly modify immutable or financial booking fields".
--
-- One transaction, always rolled back, with its own fixture.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
END;
$$;

INSERT INTO public.hotels (id, slug, name, clerk_org_id, timezone, currency, status) VALUES
  ('e6e60000-0000-4000-8000-00000000000a', 'pay-probe', 'Pay Probe', 'org_pay', 'UTC', 'GHS', 'active');
INSERT INTO public.staff_profiles (id, clerk_user_id, clerk_org_id, email, full_name, role, is_active) VALUES
  ('e6e60004-0000-4000-8000-000000000001', 'pay_desk', 'org_pay', 'desk@pay.test', 'Desk', 'front_desk', true);
INSERT INTO public.bookings (id, hotel_id, reference, check_in, check_out, room_rate, subtotal, tax_amount,
                             total_amount, amount_paid, payment_status, status, currency) VALUES
  ('e6e60001-0000-4000-8000-000000000001', 'e6e60000-0000-4000-8000-00000000000a', 'PAY-1',
   (now() AT TIME ZONE 'UTC')::date, (now() AT TIME ZONE 'UTC')::date + 2,
   150, 300, 0, 300, 0, 'unpaid', 'checked_in', 'GHS');

-- ── A staff JWT calling the function directly is refused ─────────────────
SELECT set_config('request.jwt.claims', '{"sub":"pay_desk","org_id":"org_pay","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    PERFORM public.record_payment_atomic('e6e60000-0000-4000-8000-00000000000a', 'e6e60001-0000-4000-8000-000000000001',
                                         100, 'cash', '', 'GHS', 'e6e60004-0000-4000-8000-000000000001');
    v_state := 'ok';
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := 'refused';
  END;
  PERFORM pg_temp.assert_true(v_state = 'refused', 'a staff JWT cannot change amount_paid directly');
END;
$$;
RESET ROLE;

-- ── The server (service role) records it ─────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.record_payment_atomic('e6e60000-0000-4000-8000-00000000000a', 'e6e60001-0000-4000-8000-000000000001',
                                                    100, 'cash', 'Desk payment', 'GHS', 'e6e60004-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(r.payment_id IS NOT NULL AND r.payment_status = 'partial', 'first payment is partial');
  SELECT * INTO r FROM public.record_payment_atomic('e6e60000-0000-4000-8000-00000000000a', 'e6e60001-0000-4000-8000-000000000001',
                                                    200, 'mobile_money', '', 'GHS', 'e6e60004-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(r.payment_status = 'paid', 'second payment settles the bill');
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT pg_temp.assert_true(
  (SELECT amount_paid = 300 AND outstanding_balance = 0 AND payment_status = 'paid'
     FROM public.bookings WHERE id = 'e6e60001-0000-4000-8000-000000000001'),
  'booking shows the payments');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.payments
    WHERE booking_id = 'e6e60001-0000-4000-8000-000000000001'
      AND status = 'success'
      AND recorded_by = 'e6e60004-0000-4000-8000-000000000001') = 2,
  'both payments are recorded against the staff member');

ROLLBACK;
