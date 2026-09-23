-- Harden tenant-bearing financial relationships and client privileges.

DO $constraint$
BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_id_hotel_id_key UNIQUE (id, hotel_id);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END
$constraint$;

DO $constraint$
BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_booking_hotel_fk
      FOREIGN KEY (booking_id, hotel_id)
      REFERENCES public.bookings (id, hotel_id)
      ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END
$constraint$;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_booking_id_fkey;

DO $constraint$
BEGIN
  ALTER TABLE public.booking_nights
    ADD CONSTRAINT booking_nights_booking_hotel_fk
      FOREIGN KEY (booking_id, hotel_id)
      REFERENCES public.bookings (id, hotel_id)
      ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END
$constraint$;

ALTER TABLE public.booking_nights
  DROP CONSTRAINT IF EXISTS booking_nights_booking_id_fkey;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_amount_positive,
  DROP CONSTRAINT IF EXISTS payments_currency_format;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT payments_currency_format CHECK (currency ~ '^[A-Z]{3}$');

-- Dashboard callers may read payment rows, but financial writes go through RPCs.
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO service_role;

-- Internal tables stay inaccessible to client roles even if hosted defaults differ.
REVOKE ALL ON TABLE public.booking_reference_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notification_delivery_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notification_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_reference_counters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_delivery_outbox TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_logs TO service_role;

REVOKE ALL ON FUNCTION public.record_payment_atomic(
  uuid, uuid, numeric, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(
  uuid, uuid, numeric, text, text, text, uuid
) TO authenticated, service_role;

DO $guard$
DECLARE
  v_problems text[] := '{}';
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.payments p
      LEFT JOIN public.bookings b
        ON b.id = p.booking_id AND b.hotel_id = p.hotel_id
     WHERE b.id IS NULL
  ) THEN
    v_problems := v_problems || 'payments contain cross-hotel booking references';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.booking_nights n
      LEFT JOIN public.bookings b
        ON b.id = n.booking_id AND b.hotel_id = n.hotel_id
     WHERE b.id IS NULL
  ) THEN
    v_problems := v_problems || 'booking_nights contain cross-hotel booking references';
  END IF;

  IF has_table_privilege('authenticated', 'public.payments', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.payments', 'DELETE') THEN
    v_problems := v_problems || 'authenticated retains direct payment mutation privileges';
  END IF;

  IF has_table_privilege('authenticated', 'public.notification_logs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.notification_delivery_outbox', 'SELECT')
     OR has_table_privilege('authenticated', 'public.booking_reference_counters', 'SELECT') THEN
    v_problems := v_problems || 'authenticated can read a service-only table';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)',
       'EXECUTE') THEN
    v_problems := v_problems || 'anon can execute record_payment_atomic';
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'pending schema security guard failed: %',
      array_to_string(v_problems, '; ');
  END IF;
END
$guard$;
