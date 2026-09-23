-- Smoke test: settle_online_payment_atomic end-to-end on a fresh local DB.
-- Covers: happy path (pending -> confirmed/paid), replay idempotency,
-- amount-mismatch rejection, and unknown-reference rejection.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_hotel uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_booking2 uuid := gen_random_uuid();
  v_booking3 uuid := gen_random_uuid();
  v_row record;
  v_count int;
  v_err text;
  v_suffix text := substr(gen_random_uuid()::text, 1, 8);
  v_slug text;
  v_subacct text;
  v_pid text;
  v_ref1 text;
  v_ref2 text;
  v_ref3 text;
BEGIN
  v_slug := 'smoke-' || v_suffix;
  v_subacct := 'ACCT_smoke_' || v_suffix;
  v_pid := 'PID' || v_suffix;
  v_ref1 := 'RL-SMOKE-' || v_suffix || '-1';
  v_ref2 := 'RL-SMOKE-' || v_suffix || '-2';
  v_ref3 := 'RL-SMOKE-' || v_suffix || '-3';

  INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency, paystack_subaccount_code)
  VALUES (v_hotel, v_slug, 'Smoke Hotel', 'org_smoke_' || v_suffix, 'GHS', v_subacct);

  -- Booking 1: happy path, GHS 100.00 = 10000 pesewas
  INSERT INTO public.bookings (id, hotel_id, reference, check_in, check_out, room_rate, subtotal, total_amount,
                               status, payment_status, payment_preference, currency)
  VALUES (v_booking, v_hotel, v_ref1, date '2026-10-01', date '2026-10-03', 100, 100, 100,
          'pending', 'unpaid', 'pay_now', 'GHS');

  INSERT INTO public.payment_attempts (hotel_id, booking_id, paystack_reference, amount_minor, currency,
                                       expected_subaccount_code, metadata, status, initialized_at)
  VALUES (v_hotel, v_booking, v_ref1 || '-t1', 10000, 'GHS', v_subacct,
          jsonb_build_object('booking_id', v_booking::text, 'hotel_id', v_hotel::text,
                             'booking_reference', v_ref1),
          'initialized', now());

  SELECT * INTO v_row FROM public.settle_online_payment_atomic(
    v_booking, v_hotel, v_ref1 || '-t1', v_pid || '-1', 10000, 'GHS', v_subacct,
    jsonb_build_object('booking_id', v_booking::text, 'hotel_id', v_hotel::text,
                       'booking_reference', v_ref1));

  ASSERT v_row.result = 'recorded', 'expected recorded';
  ASSERT v_row.booking_status = 'confirmed', 'expected booking confirmed';
  ASSERT v_row.payment_status = 'paid', 'expected payment_status paid';
  ASSERT v_row.amount_paid_minor = 10000, 'expected 10000 minor paid';

  SELECT count(*) INTO v_count FROM public.payments
  WHERE booking_id = v_booking AND paystack_reference = v_ref1 || '-t1' AND status = 'success';
  ASSERT v_count = 1, 'expected exactly one payment row';

  SELECT status INTO v_err FROM public.payment_attempts WHERE paystack_reference = v_ref1 || '-t1';
  ASSERT v_err = 'succeeded', 'expected attempt succeeded';

  -- Replay: same payload must be a no-op returning already_recorded
  SELECT * INTO v_row FROM public.settle_online_payment_atomic(
    v_booking, v_hotel, v_ref1 || '-t1', v_pid || '-1', 10000, 'GHS', v_subacct,
    jsonb_build_object('booking_id', v_booking::text, 'hotel_id', v_hotel::text,
                       'booking_reference', v_ref1));

  ASSERT v_row.result = 'already_recorded' OR v_row.already_recorded, 'expected already_recorded on replay';

  SELECT count(*) INTO v_count FROM public.payments WHERE booking_id = v_booking;
  ASSERT v_count = 1, 'replay must not duplicate the payment row';

  -- Booking 2: amount mismatch must raise
  INSERT INTO public.bookings (id, hotel_id, reference, check_in, check_out, room_rate, subtotal, total_amount,
                               status, payment_status, payment_preference, currency)
  VALUES (v_booking2, v_hotel, v_ref2, date '2026-10-01', date '2026-10-02', 100, 100, 100,
          'pending', 'unpaid', 'pay_now', 'GHS');

  INSERT INTO public.payment_attempts (hotel_id, booking_id, paystack_reference, amount_minor, currency,
                                       expected_subaccount_code, metadata, status, initialized_at)
  VALUES (v_hotel, v_booking2, v_ref2 || '-t1', 10000, 'GHS', v_subacct,
          jsonb_build_object('booking_id', v_booking2::text, 'hotel_id', v_hotel::text,
                             'booking_reference', v_ref2), 'initialized', now());

  BEGIN
    PERFORM public.settle_online_payment_atomic(
      v_booking2, v_hotel, v_ref2 || '-t1', v_pid || '-2', 9999, 'GHS', v_subacct,
      jsonb_build_object('booking_id', v_booking2::text, 'hotel_id', v_hotel::text,
                         'booking_reference', v_ref2));
    ASSERT false, 'amount mismatch should have raised';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT position('amount mismatch' in v_err) > 0, 'expected amount mismatch, got: ' || v_err;
  END;

  SELECT count(*) INTO v_count FROM public.payments WHERE booking_id = v_booking2;
  ASSERT v_count = 0, 'mismatch must not record a payment';

  -- Booking 3: unknown reference must raise
  INSERT INTO public.bookings (id, hotel_id, reference, check_in, check_out, room_rate, subtotal, total_amount,
                               status, payment_status, payment_preference, currency)
  VALUES (v_booking3, v_hotel, v_ref3, date '2026-10-01', date '2026-10-02', 100, 100, 100,
          'pending', 'unpaid', 'pay_now', 'GHS');

  BEGIN
    PERFORM public.settle_online_payment_atomic(
      v_booking3, v_hotel, v_ref3 || '-nope', v_pid || '-3', 10000, 'GHS', v_subacct,
      jsonb_build_object('booking_id', v_booking3::text, 'hotel_id', v_hotel::text,
                         'booking_reference', v_ref3));
    ASSERT false, 'unknown reference should have raised';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT position('payment attempt' in v_err) > 0, 'expected attempt error, got: ' || v_err;
  END;

  RAISE NOTICE 'settle_online_payment_atomic smoke test PASSED';
END $$;
