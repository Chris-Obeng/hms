-- Assertion harness for 20261114190000_early_departure.sql: checking a guest
-- out before their booked departure shortens the stay, drops the unused
-- nights, and either keeps the bill (early departure fee) or lowers it.
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

-- The error DETAIL a call raises, or NULL when it succeeds.
CREATE FUNCTION pg_temp.detail_of(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_detail text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN v_detail;
END;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated', 'public.check_out_early(uuid,uuid,text)', 'EXECUTE'), 'staff cannot call check_out_early directly');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon', 'public.check_out_early(uuid,uuid,text)', 'EXECUTE'), 'anonymous cannot call check_out_early');
SELECT pg_temp.assert_true(has_function_privilege('service_role', 'public.check_out_early(uuid,uuid,text)', 'EXECUTE'), 'the server can call check_out_early');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated', 'public.preview_early_check_out(uuid,uuid)', 'EXECUTE'), 'staff cannot call the preview directly');
SELECT pg_temp.assert_true(has_function_privilege('service_role', 'public.preview_early_check_out(uuid,uuid)', 'EXECUTE'), 'the server can call the preview');
SELECT pg_temp.assert_true(NOT has_function_privilege('service_role', 'bookings_private.shorten_stay(uuid,date,boolean,boolean)', 'EXECUTE'), 'the shortening helper is private');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated', 'public.record_manual_refund(uuid,uuid,numeric,text,text,uuid)', 'EXECUTE'), 'staff cannot call record_manual_refund directly');
SELECT pg_temp.assert_true(has_function_privilege('service_role', 'public.record_manual_refund(uuid,uuid,numeric,text,text,uuid)', 'EXECUTE'), 'the server can record a refund');

-- ── Fixture ──────────────────────────────────────────────────────────────
INSERT INTO public.hotels (id, slug, name, clerk_org_id, timezone, currency, status) VALUES
  ('e5e50000-0000-4000-8000-00000000000a', 'early-probe', 'Early Probe', 'org_early', 'UTC', 'GHS', 'active');
INSERT INTO public.staff_profiles (clerk_user_id, clerk_org_id, email, full_name, role, is_active) VALUES
  ('early_manager', 'org_early', 'manager@early.test', 'Manager', 'manager', true);

-- Five nights from two days ago, sold at 100/200/300/400/500 with a 10% discount
-- (subtotal 1350 of 1500) and 10% tax, fully paid. Two of the nights are used.
INSERT INTO public.bookings (id, hotel_id, reference, check_in, check_out, room_rate, subtotal, tax_amount,
                             total_amount, amount_paid, payment_status, status, currency) VALUES
  ('e5e50001-0000-4000-8000-000000000001', 'e5e50000-0000-4000-8000-00000000000a', 'EARLY-REL',
   (now() AT TIME ZONE 'UTC')::date - 2, (now() AT TIME ZONE 'UTC')::date + 3,
   270, 1350, 135, 1485, 1485, 'paid', 'checked_in', 'GHS'),
  ('e5e50001-0000-4000-8000-000000000002', 'e5e50000-0000-4000-8000-00000000000a', 'EARLY-CHG',
   (now() AT TIME ZONE 'UTC')::date - 2, (now() AT TIME ZONE 'UTC')::date + 3,
   270, 1350, 135, 1485, 500, 'partial', 'checked_in', 'GHS'),
  -- Arrived today, booked three nights, leaving today: keeps one night.
  ('e5e50001-0000-4000-8000-000000000003', 'e5e50000-0000-4000-8000-00000000000a', 'EARLY-SAME',
   (now() AT TIME ZONE 'UTC')::date, (now() AT TIME ZONE 'UTC')::date + 3,
   100, 300, 0, 300, 0, 'unpaid', 'checked_in', 'GHS'),
  -- Leaving on the booked day: not early.
  ('e5e50001-0000-4000-8000-000000000004', 'e5e50000-0000-4000-8000-00000000000a', 'EARLY-ONTIME',
   (now() AT TIME ZONE 'UTC')::date - 1, (now() AT TIME ZONE 'UTC')::date,
   100, 100, 0, 100, 0, 'unpaid', 'checked_in', 'GHS'),
  -- In house, leaving early, checked out by a direct client write.
  ('e5e50001-0000-4000-8000-000000000006', 'e5e50000-0000-4000-8000-00000000000a', 'EARLY-DIRECT',
   (now() AT TIME ZONE 'UTC')::date - 1, (now() AT TIME ZONE 'UTC')::date + 2,
   100, 300, 0, 300, 0, 'unpaid', 'checked_in', 'GHS'),
  -- Not in house yet.
  ('e5e50001-0000-4000-8000-000000000005', 'e5e50000-0000-4000-8000-00000000000a', 'EARLY-CONF',
   (now() AT TIME ZONE 'UTC')::date, (now() AT TIME ZONE 'UTC')::date + 2,
   100, 200, 0, 200, 0, 'unpaid', 'confirmed', 'GHS');

INSERT INTO public.booking_nights (hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency, source)
SELECT 'e5e50000-0000-4000-8000-00000000000a', b.id, b.check_in + n, 1, (n + 1) * 10000, 'GHS', 'manual'
  FROM public.bookings b, generate_series(0, 4) n
 WHERE b.reference IN ('EARLY-REL', 'EARLY-CHG');

-- ── Preview: both outcomes, nothing written ──────────────────────────────
DO $$
DECLARE
  p jsonb := public.preview_early_check_out('e5e50001-0000-4000-8000-000000000001', 'e5e50000-0000-4000-8000-00000000000a');
BEGIN
  PERFORM pg_temp.assert_true((p->>'early')::boolean, 'preview sees an early departure');
  PERFORM pg_temp.assert_true(p->>'policy' = 'charge', 'hotels that never chose keep the bill');
  PERFORM pg_temp.assert_true((p#>>'{charge,nights_released}')::int = 3, 'three unused nights');
  -- Kept nights are 100 + 200 of 1500 booked: a fifth of 1350 + 135.
  PERFORM pg_temp.assert_true((p#>>'{release,total_after}')::numeric = 297, 'release lowers the bill in proportion (discount and tax kept)');
  PERFORM pg_temp.assert_true((p#>>'{release,overpaid}')::numeric = 1188, 'release shows what to refund');
  PERFORM pg_temp.assert_true((p#>>'{charge,total_after}')::numeric = 1485, 'charge keeps the bill');
  PERFORM pg_temp.assert_true((p#>>'{charge,early_departure_fee}')::numeric = 1188, 'charge turns the unused nights into the fee');
  PERFORM pg_temp.assert_true(
    (SELECT check_out FROM public.bookings WHERE reference = 'EARLY-REL') = (now() AT TIME ZONE 'UTC')::date + 3
    AND (SELECT count(*) FROM public.booking_nights WHERE booking_id = 'e5e50001-0000-4000-8000-000000000001') = 5,
    'preview writes nothing');
  PERFORM pg_temp.assert_true(
    (public.preview_early_check_out('e5e50001-0000-4000-8000-000000000004', 'e5e50000-0000-4000-8000-00000000000a')->>'early')::boolean IS FALSE,
    'leaving on the booked day is not early');
END;
$$;

-- ── Release: the bill drops, the stay ends today ─────────────────────────
DO $$
DECLARE
  r jsonb := public.check_out_early('e5e50001-0000-4000-8000-000000000001', 'e5e50000-0000-4000-8000-00000000000a', 'release');
  b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = 'e5e50001-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(r->>'policy' = 'release', 'override applied');
  PERFORM pg_temp.assert_true(b.status = 'checked_out' AND b.check_out_at IS NOT NULL, 'checked out');
  PERFORM pg_temp.assert_true(b.check_out = (now() AT TIME ZONE 'UTC')::date, 'stay ends today');
  PERFORM pg_temp.assert_true(b.nights = 2, 'two nights stayed');
  PERFORM pg_temp.assert_true(b.subtotal = 270 AND b.tax_amount = 27 AND b.total_amount = 297, 'bill lowered');
  PERFORM pg_temp.assert_true(b.early_departure_fee = 0, 'no fee when released');
  PERFORM pg_temp.assert_true(b.payment_status = 'paid' AND b.outstanding_balance = -1188, 'overpayment visible');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.booking_nights WHERE booking_id = b.id) = 2
    AND (SELECT max(stay_date) FROM public.booking_nights WHERE booking_id = b.id) = (now() AT TIME ZONE 'UTC')::date - 1,
    'unused nights removed from booking_nights');
END;
$$;

-- ── Charge (the hotel default): the bill stays, the fee holds the difference
DO $$
DECLARE
  r jsonb := public.check_out_early('e5e50001-0000-4000-8000-000000000002', 'e5e50000-0000-4000-8000-00000000000a');
  b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = 'e5e50001-0000-4000-8000-000000000002';
  PERFORM pg_temp.assert_true(r->>'policy' = 'charge', 'hotel default applied');
  PERFORM pg_temp.assert_true(b.subtotal = 270 AND b.tax_amount = 27, 'room revenue is only the nights stayed');
  PERFORM pg_temp.assert_true(b.early_departure_fee = 1188 AND b.total_amount = 1485, 'bill kept; fee holds the unused nights');
  PERFORM pg_temp.assert_true(b.payment_status = 'partial' AND b.outstanding_balance = 985, 'balance unchanged');
END;
$$;

-- ── Same-day departure keeps its first night ─────────────────────────────
UPDATE public.hotels SET settings = coalesce(settings, '{}'::jsonb) || '{"early_departure_policy":"release"}'
 WHERE id = 'e5e50000-0000-4000-8000-00000000000a';
DO $$
DECLARE
  r jsonb := public.check_out_early('e5e50001-0000-4000-8000-000000000003', 'e5e50000-0000-4000-8000-00000000000a');
  b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = 'e5e50001-0000-4000-8000-000000000003';
  PERFORM pg_temp.assert_true(r->>'policy' = 'release', 'hotel policy read from settings');
  PERFORM pg_temp.assert_true(b.check_out = b.check_in + 1, 'a guest who leaves on arrival day keeps one night');
  -- No booking_nights on record: shrinks by night count.
  PERFORM pg_temp.assert_true(b.subtotal = 100 AND b.total_amount = 100, 'priced by night count without nightly rates');
END;
$$;

-- ── Rejections ───────────────────────────────────────────────────────────
SELECT pg_temp.assert_true(
  pg_temp.detail_of($q$SELECT public.check_out_early('e5e50001-0000-4000-8000-000000000004', 'e5e50000-0000-4000-8000-00000000000a')$q$) = 'not_early',
  'on-time departure is rejected as not early');
SELECT pg_temp.assert_true(
  pg_temp.detail_of($q$SELECT public.check_out_early('e5e50001-0000-4000-8000-000000000005', 'e5e50000-0000-4000-8000-00000000000a')$q$) = 'booking_not_in_house',
  'a guest who has not checked in cannot check out early');
SELECT pg_temp.assert_true(
  pg_temp.detail_of($q$SELECT public.check_out_early('e5e50001-0000-4000-8000-000000000005', 'e5e50000-0000-4000-8000-00000000000b')$q$) = 'booking_not_found',
  'another hotel''s booking is not found');
SELECT pg_temp.assert_true(
  pg_temp.detail_of($q$SELECT public.check_out_early('e5e50001-0000-4000-8000-000000000004', 'e5e50000-0000-4000-8000-00000000000a', 'refund')$q$) = 'invalid_payload',
  'only charge or release');

-- ── Refund given in person (no Paystack) ─────────────────────────────────
-- EARLY-REL was released above: paid 1485 against a bill of 297.
SELECT pg_temp.assert_true(
  pg_temp.detail_of($q$SELECT public.record_manual_refund('e5e50000-0000-4000-8000-00000000000a', 'e5e50001-0000-4000-8000-000000000001', 1188.01, 'cash', NULL, NULL)$q$) = 'refund_exceeds_credit',
  'cannot refund more than the credit');
SELECT pg_temp.assert_true(
  pg_temp.detail_of($q$SELECT public.record_manual_refund('e5e50000-0000-4000-8000-00000000000a', 'e5e50001-0000-4000-8000-000000000001', 10, 'paystack_link', NULL, NULL)$q$) = 'invalid_payload',
  'only in-person refund methods');
SELECT pg_temp.assert_true(
  pg_temp.detail_of($q$SELECT public.record_manual_refund('e5e50000-0000-4000-8000-00000000000a', 'e5e50001-0000-4000-8000-000000000002', 1, 'cash', NULL, NULL)$q$) = 'refund_exceeds_credit',
  'a stay with no credit cannot be refunded');
DO $$
DECLARE
  r jsonb := public.record_manual_refund('e5e50000-0000-4000-8000-00000000000a', 'e5e50001-0000-4000-8000-000000000001', 1188, 'mobile_money', 'Paid back at the desk', NULL);
  b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = 'e5e50001-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(b.amount_paid = 297 AND b.outstanding_balance = 0 AND b.payment_status = 'paid', 'refund settles the credit');
  PERFORM pg_temp.assert_true((r->>'credit_left')::numeric = 0, 'nothing left to refund');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.payments p
      WHERE p.booking_id = b.id AND p.method = 'refund' AND p.status = 'refunded' AND p.amount = 1188
        AND p.metadata->>'source' = 'manual' AND p.metadata->>'refund_method' = 'mobile_money'
        AND p.paystack_reference IS NULL) = 1,
    'one manual refund row, not linked to Paystack');
END;
$$;

-- ── A direct client check-out cannot skip the shortening ────────────────
SELECT set_config('request.jwt.claims', '{"sub":"early_manager","org_id":"org_early"}', true);
SELECT pg_temp.assert_true(
  pg_temp.detail_of($q$UPDATE public.bookings SET status = 'checked_out', check_out_at = now() WHERE id = 'e5e50001-0000-4000-8000-000000000006'$q$) = 'early_departure',
  'a client write cannot check out early without shortening the stay');
SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.assert_true(
  (SELECT status FROM public.bookings WHERE id = 'e5e50001-0000-4000-8000-000000000006') = 'checked_in',
  'still in house after the rejected write');

-- ── Staff cannot write the fee directly ──────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"early_manager","org_id":"org_early"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.bookings SET early_departure_fee = 0
     WHERE id = 'e5e50001-0000-4000-8000-000000000002';
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL: staff rewrote the early departure fee';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT early_departure_fee FROM public.bookings WHERE id = 'e5e50001-0000-4000-8000-000000000002') = 1188,
  'fee unchanged after a client write attempt');

ROLLBACK;
