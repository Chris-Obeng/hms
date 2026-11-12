-- =============================================================================
-- Fix payment reconciliation crash, Paystack verification window, manual payment
-- constraints, environment-safe worker URLs, and late Paystack settlement when
-- a timed-out hold's room type subsequently sold out.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ── 1. Purge migration-seeded secret in non-production environments ───────────
-- Production holds `payment_reconcile_base_url` in Vault; a local `db reset` or
-- ephemeral CI database does not and must not retain the token from 20260821170005.
DELETE FROM vault.secrets
 WHERE name = 'push_worker_secret'
   AND NOT EXISTS (
     SELECT 1 FROM vault.secrets s2
      WHERE s2.name IN ('payment_reconcile_base_url', 'push_worker_base_url')
   );

-- ── 2. Payment reconciliation sweep + versioned cron schedule ─────────────────
CREATE OR REPLACE FUNCTION public.reconcile_pending_payments()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, vault
AS $fn$
DECLARE
  v_base_url text;
  v_fired    integer := 0;
  r          record;
BEGIN
  SELECT ds.decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets ds
   WHERE ds.name = 'payment_reconcile_base_url'
   LIMIT 1;

  IF v_base_url IS NULL OR btrim(v_base_url) = '' THEN
    RETURN 0; -- Not configured (local dev / CI): sweep disabled.
  END IF;
  v_base_url := rtrim(btrim(v_base_url), '/');

  FOR r IN
    SELECT h.slug, u.ref
      FROM public.bookings b
      JOIN public.hotels h ON h.id = b.hotel_id
      CROSS JOIN LATERAL unnest(b.initiated_payment_refs) AS u(ref)
      LEFT JOIN public.payment_attempts pa
        ON pa.paystack_reference = u.ref
     WHERE b.status = 'pending'
       AND b.payment_status IN ('unpaid', 'partial')
       AND b.payment_preference = 'pay_now'
       AND b.source = 'direct'
       AND b.created_at > now() - interval '24 hours'
       AND COALESCE(pa.initialized_at, b.created_at) <= now() - interval '3 minutes'
       AND COALESCE(pa.status, 'initialized') <> 'succeeded'
       AND u.ref ~ '^[A-Za-z0-9._-]+$'
     ORDER BY b.created_at ASC
     LIMIT 8
  LOOP
    PERFORM net.http_get(
      url := v_base_url || '/api/booking/' || r.slug || '/payments/verify?reference=' || r.ref
    );
    v_fired := v_fired + 1;
  END LOOP;

  RETURN v_fired;
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_pending_payments() IS
  'Sweeps pending direct online-payment holds whose Paystack attempt is >= 3 minutes old (per Paystack verify guidance) and triggers the idempotent verify endpoint via pg_net. Capped at 8 per 5-minute tick to stay within per-IP rate limits.';

REVOKE ALL ON FUNCTION public.reconcile_pending_payments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_pending_payments() TO service_role;

DO $cron_reconcile$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-pending-payments') THEN
    PERFORM cron.unschedule('reconcile-pending-payments');
  END IF;
END
$cron_reconcile$;

SELECT cron.schedule(
  'reconcile-pending-payments',
  '2-59/5 * * * *',
  $$SELECT public.reconcile_pending_payments();$$
);

-- ── 3. Payments method vocabulary & hardened record_payment_atomic ────────────
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_method_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_method_check
    CHECK (method IS NULL OR method IN (
      'card', 'bank_transfer', 'ussd', 'mobile_money',
      'cash', 'pos', 'paystack_link', 'other', 'refund'
    )) NOT VALID;

ALTER TABLE public.payments
  VALIDATE CONSTRAINT payments_method_check;

CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_hotel_id    uuid,
  p_booking_id  uuid,
  p_amount      numeric,
  p_method      text,
  p_notes       text,
  p_currency    text,
  p_recorded_by uuid
)
RETURNS TABLE(payment_id uuid, payment_status text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
#variable_conflict use_variable
DECLARE
  v_payment_id   uuid;
  v_status       text;
  v_jwt_staff_id uuid;
  v_jwt_role     text := COALESCE((SELECT auth.jwt()) ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_invoker_role text := COALESCE(current_setting('role', true), 'none');
  v_sub          text := COALESCE((SELECT auth.jwt()) ->> 'sub', current_setting('request.jwt.claim.sub', true));
  v_currency     text := upper(COALESCE(NULLIF(btrim(p_currency), ''), 'GHS'));
  v_trusted_srv  boolean;
BEGIN
  v_trusted_srv := v_jwt_role = 'service_role'
    OR (
      v_invoker_role IN ('none', 'postgres', 'service_role', 'supabase_admin')
      AND v_jwt_role NOT IN ('authenticated', 'anon')
      AND v_sub IS NULL
    );

  IF NOT v_trusted_srv AND NOT public.user_role_at_least(p_hotel_id, 'front_desk') THEN
    RAISE EXCEPTION 'Permission denied: front_desk or higher role required for this hotel'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  IF p_method = 'refund' THEN
    RAISE EXCEPTION 'Refunds cannot be recorded as positive payments via record_payment_atomic'
      USING ERRCODE = '22023';
  END IF;

  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Invalid ISO 4217 currency code: %', p_currency
      USING ERRCODE = '22023';
  END IF;

  IF v_sub IS NOT NULL THEN
    SELECT sp.id INTO v_jwt_staff_id
      FROM public.staff_profiles sp
      JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
     WHERE h.id = p_hotel_id
       AND sp.clerk_user_id = v_sub
       AND sp.is_active = true
     LIMIT 1;
  END IF;

  INSERT INTO public.payments (
    hotel_id, booking_id, amount, method, status,
    paid_at, notes, currency, recorded_by
  )
  VALUES (
    p_hotel_id, p_booking_id, p_amount, p_method, 'success',
    now(), p_notes, v_currency, COALESCE(v_jwt_staff_id, p_recorded_by)
  )
  RETURNING public.payments.id INTO v_payment_id;

  UPDATE public.bookings b
     SET amount_paid    = COALESCE(b.amount_paid, 0) + p_amount,
         payment_status = CASE
                            WHEN COALESCE(b.amount_paid, 0) + p_amount >= b.total_amount THEN 'paid'
                            ELSE 'partial'
                          END
   WHERE b.id = p_booking_id
     AND b.hotel_id = p_hotel_id
  RETURNING b.payment_status INTO v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or hotel mismatch';
  END IF;

  RETURN QUERY SELECT v_payment_id, v_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_payment_atomic(
  uuid, uuid, numeric, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(
  uuid, uuid, numeric, text, text, text, uuid
) TO authenticated, service_role;

-- ── 4. Late Paystack settlement resilience when timed-out inventory sold out ──
-- If a guest's 30-min hold timed out (`status = 'cancelled'`,
-- `cancellation_reason = 'payment_timeout'`), the last room of that type sold to
-- another guest, and Paystack's webhook arrives late, the booking reactivation
-- hits `bookings_room_type_inventory_guard` (`23P01`). Catching `exclusion_violation`
-- around the booking reactivation ensures the guest's captured money is ALWAYS
-- recorded in `payments` and `payment_attempts` while keeping `bookings.status = 'cancelled'`
-- (`cancellation_reason = 'payment_timeout_sold_out'`) so `confirm-online-payment.ts`
-- alerts staff for refund/relocation instead of 500-looping Paystack.
CREATE OR REPLACE FUNCTION public.settle_online_payment_atomic(
  p_booking_id         uuid,
  p_hotel_id           uuid,
  p_paystack_reference text,
  p_paystack_id        text,
  p_amount_minor       bigint,
  p_currency           text,
  p_subaccount_code    text,
  p_metadata           jsonb
)
RETURNS TABLE (
  result            text,
  booking_id        uuid,
  amount_paid_minor bigint,
  payment_status    text,
  booking_status    text,
  partial_payment   boolean,
  already_recorded  boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $settle$
#variable_conflict use_variable
DECLARE
  v_booking            public.bookings%ROWTYPE;
  v_attempt            public.payment_attempts%ROWTYPE;
  v_payment            public.payments%ROWTYPE;
  v_existing_by_id     public.payments%ROWTYPE;
  v_total_paid         numeric;
  v_total_minor        bigint;
  v_minor_factor       bigint;
  v_expected_subacct   text;
  v_is_replay          boolean := false;
  v_active_booking     boolean;
  v_sold_out_reactivate boolean := false;
BEGIN
  IF p_paystack_reference IS NULL OR btrim(p_paystack_reference) = ''
     OR p_paystack_id IS NULL OR btrim(p_paystack_id) = ''
     OR p_amount_minor IS NULL OR p_amount_minor <= 0
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_subaccount_code IS NULL OR btrim(p_subaccount_code) = '' THEN
    RAISE EXCEPTION 'invalid settlement identity';
  END IF;

  SELECT b.* INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id AND b.hotel_id = p_hotel_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found or hotel mismatch';
  END IF;

  SELECT pa.* INTO v_attempt
    FROM public.payment_attempts pa
   WHERE pa.paystack_reference = p_paystack_reference
   FOR UPDATE;

  IF NOT FOUND
     OR v_attempt.booking_id IS DISTINCT FROM p_booking_id
     OR v_attempt.hotel_id IS DISTINCT FROM p_hotel_id
     OR p_metadata ->> 'booking_id' IS DISTINCT FROM p_booking_id::text
     OR p_metadata ->> 'hotel_id' IS DISTINCT FROM p_hotel_id::text
     OR p_metadata ->> 'booking_reference' IS DISTINCT FROM v_booking.reference
     OR v_attempt.metadata ->> 'booking_id' IS DISTINCT FROM p_metadata ->> 'booking_id'
     OR v_attempt.metadata ->> 'hotel_id' IS DISTINCT FROM p_metadata ->> 'hotel_id'
     OR v_attempt.metadata ->> 'booking_reference' IS DISTINCT FROM p_metadata ->> 'booking_reference' THEN
    RAISE EXCEPTION 'payment attempt identity mismatch';
  END IF;

  IF v_attempt.status NOT IN ('initialized', 'succeeded') THEN
    RAISE EXCEPTION 'payment attempt is not initialized';
  END IF;
  IF v_attempt.currency IS DISTINCT FROM p_currency
     OR v_booking.currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'currency mismatch';
  END IF;
  IF v_attempt.amount_minor IS DISTINCT FROM p_amount_minor THEN
    RAISE EXCEPTION 'amount mismatch';
  END IF;

  SELECT h.paystack_subaccount_code INTO v_expected_subacct
    FROM public.hotels h
   WHERE h.id = p_hotel_id;

  IF v_expected_subacct IS NULL
     OR v_expected_subacct IS DISTINCT FROM p_subaccount_code
     OR v_attempt.expected_subaccount_code IS DISTINCT FROM p_subaccount_code THEN
    RAISE EXCEPTION 'subaccount mismatch';
  END IF;

  v_minor_factor := (10::bigint ^ public.currency_exponent(p_currency))::bigint;

  SELECT p.* INTO v_payment
    FROM public.payments p
   WHERE p.paystack_reference = p_paystack_reference
   FOR UPDATE;

  SELECT p.* INTO v_existing_by_id
    FROM public.payments p
   WHERE p.paystack_id = p_paystack_id
   FOR UPDATE;

  IF v_existing_by_id.id IS NOT NULL
     AND (v_payment.id IS NULL OR v_existing_by_id.id <> v_payment.id) THEN
    RAISE EXCEPTION 'Paystack transaction ID collision';
  END IF;

  IF v_payment.id IS NOT NULL THEN
    v_is_replay := true;
    IF v_payment.hotel_id IS DISTINCT FROM p_hotel_id
       OR v_payment.booking_id IS DISTINCT FROM p_booking_id
       OR (v_payment.paystack_id IS NOT NULL
           AND v_payment.paystack_id IS DISTINCT FROM p_paystack_id)
       OR v_payment.currency IS DISTINCT FROM p_currency
       OR v_payment.paystack_subaccount IS DISTINCT FROM p_subaccount_code
       OR round(v_payment.amount * v_minor_factor)::bigint IS DISTINCT FROM p_amount_minor
       OR v_payment.status IS DISTINCT FROM 'success' THEN
      RAISE EXCEPTION 'Paystack reference collision';
    END IF;
    IF v_payment.paystack_id IS NULL THEN
      UPDATE public.payments p SET paystack_id = p_paystack_id WHERE p.id = v_payment.id;
    END IF;
  ELSE
    INSERT INTO public.payments (
      hotel_id, booking_id, amount, currency, method, status,
      paystack_reference, paystack_id, paystack_subaccount, paid_at
    ) VALUES (
      p_hotel_id, p_booking_id, p_amount_minor::numeric / v_minor_factor, p_currency,
      'card', 'success', p_paystack_reference, p_paystack_id,
      p_subaccount_code, now()
    )
    RETURNING * INTO v_payment;
  END IF;

  UPDATE public.payment_attempts pa
     SET status = 'succeeded', paystack_id = p_paystack_id,
         settled_at = COALESCE(pa.settled_at, now()), updated_at = now()
   WHERE pa.id = v_attempt.id;

  SELECT COALESCE(sum(p.amount), 0) INTO v_total_paid
    FROM public.payments p
   WHERE p.booking_id = p_booking_id
     AND p.hotel_id = p_hotel_id
     AND p.status = 'success';

  v_total_minor := round(v_total_paid * v_minor_factor)::bigint;
  v_active_booking := v_booking.status = 'pending'
    OR (v_booking.status = 'cancelled'
        AND v_booking.cancellation_reason = 'payment_timeout');

  BEGIN
    UPDATE public.bookings b
       SET amount_paid = v_total_paid,
           payment_status = CASE
             WHEN v_total_paid >= b.total_amount THEN 'paid'
             WHEN v_total_paid > 0 THEN 'partial'
             ELSE 'unpaid'
           END,
           status = CASE
             WHEN v_active_booking AND v_total_paid >= b.total_amount THEN 'confirmed'
             WHEN v_active_booking THEN 'pending'
             ELSE b.status
           END,
           cancelled_at = CASE WHEN v_active_booking THEN NULL ELSE b.cancelled_at END,
           cancellation_reason = CASE
             WHEN v_active_booking THEN NULL ELSE b.cancellation_reason END,
           updated_at = now()
     WHERE b.id = p_booking_id AND b.hotel_id = p_hotel_id
     RETURNING b.payment_status, b.status
          INTO payment_status, booking_status;
  EXCEPTION WHEN exclusion_violation THEN
    v_sold_out_reactivate := true;
    UPDATE public.bookings b
       SET amount_paid = v_total_paid,
           payment_status = CASE
             WHEN v_total_paid >= b.total_amount THEN 'paid'
             WHEN v_total_paid > 0 THEN 'partial'
             ELSE 'unpaid'
           END,
           cancellation_reason = CASE
             WHEN b.status = 'cancelled' AND b.cancellation_reason = 'payment_timeout'
               THEN 'payment_timeout_sold_out'
             ELSE b.cancellation_reason
           END,
           updated_at = now()
     WHERE b.id = p_booking_id AND b.hotel_id = p_hotel_id
     RETURNING b.payment_status, b.status
          INTO payment_status, booking_status;
  END;

  result := CASE
    WHEN v_is_replay THEN 'already_recorded'
    WHEN v_sold_out_reactivate THEN 'recorded_sold_out'
    ELSE 'recorded'
  END;
  booking_id := p_booking_id;
  amount_paid_minor := v_total_minor;
  partial_payment := v_total_paid < v_booking.total_amount;
  already_recorded := v_is_replay;
  RETURN NEXT;
END
$settle$;

REVOKE ALL ON FUNCTION public.settle_online_payment_atomic(
  uuid, uuid, text, text, bigint, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_online_payment_atomic(
  uuid, uuid, text, text, bigint, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_online_group_payment_atomic(
  p_group_id           uuid,
  p_hotel_id           uuid,
  p_paystack_reference text,
  p_paystack_id        text,
  p_amount_minor       bigint,
  p_currency           text,
  p_subaccount_code    text,
  p_metadata           jsonb
)
RETURNS TABLE (
  result            text,
  group_id          uuid,
  amount_paid_minor bigint,
  line_count        integer,
  all_confirmed     boolean,
  already_recorded  boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $settle$
#variable_conflict use_variable
DECLARE
  v_attempt          public.payment_attempts%ROWTYPE;
  v_line             public.bookings%ROWTYPE;
  v_payment          public.payments%ROWTYPE;
  v_existing_by_id   public.payments%ROWTYPE;
  v_expected_subacct text;
  v_minor_factor     bigint;
  v_derived_ref      text;
  v_line_paid        numeric;
  v_line_status      text;
  v_line_count       integer := 0;
  v_group_total      bigint  := 0;
  v_group_paid       bigint  := 0;
  v_all_confirmed    boolean := true;
  v_any_new          boolean := false;
  v_any_sold_out     boolean := false;
  v_active           boolean;
BEGIN
  IF p_paystack_reference IS NULL OR btrim(p_paystack_reference) = ''
     OR p_paystack_id IS NULL OR btrim(p_paystack_id) = ''
     OR p_amount_minor IS NULL OR p_amount_minor <= 0
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_subaccount_code IS NULL OR btrim(p_subaccount_code) = '' THEN
    RAISE EXCEPTION 'invalid settlement identity';
  END IF;

  SELECT pa.* INTO v_attempt
    FROM public.payment_attempts pa
   WHERE pa.paystack_reference = p_paystack_reference
   FOR UPDATE;

  IF NOT FOUND
     OR v_attempt.hotel_id IS DISTINCT FROM p_hotel_id
     OR v_attempt.booking_id IS DISTINCT FROM p_group_id
     OR p_metadata ->> 'group_id' IS DISTINCT FROM p_group_id::text
     OR p_metadata ->> 'hotel_id' IS DISTINCT FROM p_hotel_id::text
     OR v_attempt.metadata ->> 'group_id' IS DISTINCT FROM p_metadata ->> 'group_id'
     OR v_attempt.metadata ->> 'hotel_id' IS DISTINCT FROM p_metadata ->> 'hotel_id'
     OR v_attempt.metadata ->> 'group_reference' IS DISTINCT FROM p_metadata ->> 'group_reference' THEN
    RAISE EXCEPTION 'payment attempt identity mismatch';
  END IF;

  IF v_attempt.status NOT IN ('initialized', 'succeeded') THEN
    RAISE EXCEPTION 'payment attempt is not initialized';
  END IF;
  IF v_attempt.currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'currency mismatch';
  END IF;
  IF v_attempt.amount_minor IS DISTINCT FROM p_amount_minor THEN
    RAISE EXCEPTION 'amount mismatch';
  END IF;

  SELECT h.paystack_subaccount_code INTO v_expected_subacct
    FROM public.hotels h WHERE h.id = p_hotel_id;
  IF v_expected_subacct IS NULL
     OR v_expected_subacct IS DISTINCT FROM p_subaccount_code
     OR v_attempt.expected_subaccount_code IS DISTINCT FROM p_subaccount_code THEN
    RAISE EXCEPTION 'subaccount mismatch';
  END IF;

  v_minor_factor := (10::bigint ^ public.currency_exponent(p_currency))::bigint;

  FOR v_line IN
    SELECT b.* FROM public.bookings b
     WHERE b.group_id = p_group_id AND b.hotel_id = p_hotel_id
     ORDER BY b.id
     FOR UPDATE
  LOOP
    v_line_count := v_line_count + 1;
    IF v_line.currency IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION 'currency mismatch';
    END IF;
    v_group_total := v_group_total + round(v_line.total_amount * v_minor_factor)::bigint;
  END LOOP;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'reservation group not found or hotel mismatch';
  END IF;
  IF v_group_total IS DISTINCT FROM p_amount_minor THEN
    RAISE EXCEPTION 'amount mismatch';
  END IF;

  SELECT p.* INTO v_existing_by_id
    FROM public.payments p
   WHERE p.paystack_id = p_paystack_id
   FOR UPDATE;
  IF v_existing_by_id.id IS NOT NULL
     AND v_existing_by_id.paystack_reference
         IS DISTINCT FROM p_paystack_reference || '::' || p_group_id::text THEN
    RAISE EXCEPTION 'Paystack transaction ID collision';
  END IF;

  FOR v_line IN
    SELECT b.* FROM public.bookings b
     WHERE b.group_id = p_group_id AND b.hotel_id = p_hotel_id
     ORDER BY b.id
  LOOP
    v_derived_ref := p_paystack_reference || '::' || v_line.id::text;

    SELECT p.* INTO v_payment
      FROM public.payments p
     WHERE p.paystack_reference = v_derived_ref
     FOR UPDATE;

    IF v_payment.id IS NOT NULL THEN
      IF v_payment.hotel_id IS DISTINCT FROM p_hotel_id
         OR v_payment.booking_id IS DISTINCT FROM v_line.id
         OR v_payment.currency IS DISTINCT FROM p_currency
         OR v_payment.paystack_subaccount IS DISTINCT FROM p_subaccount_code
         OR round(v_payment.amount * v_minor_factor)::bigint
            IS DISTINCT FROM round(v_line.total_amount * v_minor_factor)::bigint
         OR v_payment.status IS DISTINCT FROM 'success' THEN
        RAISE EXCEPTION 'Paystack reference collision';
      END IF;
    ELSE
      v_any_new := true;
      INSERT INTO public.payments (
        hotel_id, booking_id, amount, currency, method, status,
        paystack_reference, paystack_id, paystack_subaccount, paid_at
      ) VALUES (
        p_hotel_id, v_line.id, v_line.total_amount, p_currency, 'card', 'success',
        v_derived_ref,
        CASE WHEN v_line.id = p_group_id THEN p_paystack_id ELSE NULL END,
        p_subaccount_code, now()
      );
    END IF;

    SELECT COALESCE(sum(p.amount), 0) INTO v_line_paid
      FROM public.payments p
     WHERE p.booking_id = v_line.id
       AND p.hotel_id = p_hotel_id
       AND p.status = 'success';

    v_active := v_line.status = 'pending'
      OR (v_line.status = 'cancelled'
          AND v_line.cancellation_reason = 'payment_timeout');

    BEGIN
      UPDATE public.bookings b
         SET amount_paid = v_line_paid,
             payment_status = CASE
               WHEN v_line_paid >= b.total_amount THEN 'paid'
               WHEN v_line_paid > 0 THEN 'partial'
               ELSE 'unpaid'
             END,
             status = CASE
               WHEN v_active AND v_line_paid >= b.total_amount THEN 'confirmed'
               WHEN v_active THEN 'pending'
               ELSE b.status
             END,
             cancelled_at = CASE WHEN v_active THEN NULL ELSE b.cancelled_at END,
             cancellation_reason = CASE
               WHEN v_active THEN NULL ELSE b.cancellation_reason END,
             updated_at = now()
       WHERE b.id = v_line.id AND b.hotel_id = p_hotel_id
       RETURNING b.status INTO v_line_status;
    EXCEPTION WHEN exclusion_violation THEN
      v_any_sold_out := true;
      UPDATE public.bookings b
         SET amount_paid = v_line_paid,
             payment_status = CASE
               WHEN v_line_paid >= b.total_amount THEN 'paid'
               WHEN v_line_paid > 0 THEN 'partial'
               ELSE 'unpaid'
             END,
             cancellation_reason = CASE
               WHEN b.status = 'cancelled' AND b.cancellation_reason = 'payment_timeout'
                 THEN 'payment_timeout_sold_out'
               ELSE b.cancellation_reason
             END,
             updated_at = now()
       WHERE b.id = v_line.id AND b.hotel_id = p_hotel_id
       RETURNING b.status INTO v_line_status;
    END;

    IF v_line_status IS DISTINCT FROM 'confirmed' THEN
      v_all_confirmed := false;
    END IF;
    v_group_paid := v_group_paid + round(v_line_paid * v_minor_factor)::bigint;
  END LOOP;

  UPDATE public.payment_attempts pa
     SET status = 'succeeded', paystack_id = p_paystack_id,
         settled_at = COALESCE(pa.settled_at, now()), updated_at = now()
   WHERE pa.id = v_attempt.id;

  result := CASE
    WHEN NOT v_any_new THEN 'already_recorded'
    WHEN v_any_sold_out THEN 'recorded_sold_out'
    ELSE 'recorded'
  END;
  group_id          := p_group_id;
  amount_paid_minor := v_group_paid;
  line_count        := v_line_count;
  all_confirmed     := v_all_confirmed;
  already_recorded  := NOT v_any_new;
  RETURN NEXT;
END
$settle$;

REVOKE ALL ON FUNCTION public.settle_online_group_payment_atomic(
  uuid, uuid, text, text, bigint, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_online_group_payment_atomic(
  uuid, uuid, text, text, bigint, text, text, jsonb
) TO service_role;

-- ── 5. Environment-safe push worker trigger helper & stay reminders ───────────
CREATE OR REPLACE FUNCTION public.trigger_push_delivery_worker()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, vault
AS $fn$
DECLARE
  v_worker_secret text;
  v_base_url      text;
BEGIN
  SELECT ds.decrypted_secret INTO v_worker_secret
    FROM vault.decrypted_secrets ds
   WHERE ds.name = 'push_worker_secret'
   LIMIT 1;

  IF v_worker_secret IS NULL OR btrim(v_worker_secret) = '' THEN
    RETURN;
  END IF;

  SELECT ds.decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets ds
   WHERE ds.name = 'push_worker_base_url'
   LIMIT 1;

  IF (v_base_url IS NULL OR btrim(v_base_url) = '')
     AND EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = 'payment_reconcile_base_url') THEN
    v_base_url := 'https://wtgldgyxtpbzjmaygeif.supabase.co';
  END IF;

  IF v_base_url IS NULL OR btrim(v_base_url) = '' THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := rtrim(btrim(v_base_url), '/') || '/functions/v1/deliver-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_worker_secret
    ),
    body    := '{}'::jsonb
  );
END;
$fn$;

COMMENT ON FUNCTION public.trigger_push_delivery_worker() IS
  'Invokes the deliver-push-notifications Edge Function via pg_net when push_worker_secret and project URL are configured in Vault. Safe no-op in local/CI environments.';

REVOKE ALL ON FUNCTION public.trigger_push_delivery_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_push_delivery_worker() TO service_role;

DO $cron_push$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deliver-push-notifications') THEN
    PERFORM cron.unschedule('deliver-push-notifications');
  END IF;
END
$cron_push$;

SELECT cron.schedule(
  'deliver-push-notifications',
  '* * * * *',
  $$SELECT public.trigger_push_delivery_worker();$$
);

CREATE OR REPLACE FUNCTION public.dispatch_daily_stay_reminders()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, vault
AS $fn$
DECLARE
  h               record;
  v_local_now     timestamp;
  v_today         date;
  v_tomorrow      date;
  v_hour          integer;
  v_count         integer;
  v_first_guest   text;
  v_first_room    text;
  v_first_booking uuid;
  v_title         text;
  v_message       text;
  v_inserted      integer := 0;
  v_rows          integer := 0;
BEGIN
  FOR h IN
    SELECT id, clerk_org_id, COALESCE(NULLIF(timezone, ''), 'Africa/Accra') AS tz
      FROM public.hotels
     WHERE status = 'active'
       AND clerk_org_id IS NOT NULL
  LOOP
    BEGIN
      v_local_now := now() AT TIME ZONE h.tz;
    EXCEPTION WHEN OTHERS THEN
      v_local_now := now() AT TIME ZONE 'Africa/Accra';
    END;

    v_today := v_local_now::date;
    v_tomorrow := v_today + 1;
    v_hour := EXTRACT(HOUR FROM v_local_now)::integer;

    IF v_hour >= 7 AND v_hour < 11 THEN
      WITH departing AS (
        SELECT DISTINCT ON (COALESCE(b.group_id, b.id))
          COALESCE(b.group_id, b.id) AS target_booking_id,
          COALESCE(NULLIF(btrim(g.full_name), ''), 'Guest') AS guest_name,
          COALESCE(NULLIF(btrim(rt.name), ''), 'Room') AS room_name
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
        LEFT JOIN public.room_types rt ON rt.id = b.room_type_id
        WHERE b.hotel_id = h.id
          AND b.check_out = v_today
          AND b.status = 'checked_in'
        ORDER BY COALESCE(b.group_id, b.id), b.created_at
      )
      SELECT count(*)::integer,
             (array_agg(guest_name))[1],
             (array_agg(room_name))[1],
             (array_agg(target_booking_id))[1]
        INTO v_count, v_first_guest, v_first_room, v_first_booking
        FROM departing;

      IF COALESCE(v_count, 0) > 0 THEN
        IF v_count = 1 THEN
          v_title := 'Checking out today — ' || v_first_guest;
          v_message := v_first_room || ' · Scheduled departure today';
        ELSE
          v_title := v_count::text || ' departures scheduled today';
          v_message := v_first_guest || ' and ' || (v_count - 1)::text ||
                       CASE WHEN v_count = 2 THEN ' other guest check out today.' ELSE ' other guests check out today.' END;
          v_first_booking := NULL;
        END IF;

        INSERT INTO public.notifications (
          hotel_id, recipient_staff_id, type, title, message, booking_id, is_read, dedupe_key
        )
        SELECT
          h.id,
          s.id,
          'check_out_reminder',
          v_title,
          v_message,
          v_first_booking,
          false,
          'check-out-reminder:' || v_today::text
        FROM public.staff_profiles s
        WHERE s.clerk_org_id = h.clerk_org_id
          AND s.is_active
          AND COALESCE((s.notification_prefs ->> 'check_out_reminder')::boolean, true) = true
        ON CONFLICT (hotel_id, recipient_staff_id, dedupe_key)
          WHERE recipient_staff_id IS NOT NULL AND dedupe_key IS NOT NULL
        DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted := v_inserted + v_rows;
      END IF;
    END IF;

    IF v_hour >= 9 AND v_hour < 13 THEN
      WITH arriving AS (
        SELECT DISTINCT ON (COALESCE(b.group_id, b.id))
          COALESCE(b.group_id, b.id) AS target_booking_id,
          COALESCE(NULLIF(btrim(g.full_name), ''), 'Guest') AS guest_name,
          COALESCE(NULLIF(btrim(rt.name), ''), 'Room') AS room_name
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
        LEFT JOIN public.room_types rt ON rt.id = b.room_type_id
        WHERE b.hotel_id = h.id
          AND b.check_in = v_tomorrow
          AND b.status IN ('confirmed', 'pending')
        ORDER BY COALESCE(b.group_id, b.id), b.created_at
      )
      SELECT count(*)::integer,
             (array_agg(guest_name))[1],
             (array_agg(room_name))[1],
             (array_agg(target_booking_id))[1]
        INTO v_count, v_first_guest, v_first_room, v_first_booking
        FROM arriving;

      IF COALESCE(v_count, 0) > 0 THEN
        IF v_count = 1 THEN
          v_title := 'Arriving tomorrow — ' || v_first_guest;
          v_message := v_first_room || ' · Check-in ' || to_char(v_tomorrow, 'FMMon DD');
        ELSE
          v_title := v_count::text || ' arrivals tomorrow';
          v_message := v_first_guest || ' and ' || (v_count - 1)::text ||
                       CASE WHEN v_count = 2 THEN ' other guest arrive ' ELSE ' other guests arrive ' END ||
                       to_char(v_tomorrow, 'FMMon DD') || '.';
          v_first_booking := NULL;
        END IF;

        INSERT INTO public.notifications (
          hotel_id, recipient_staff_id, type, title, message, booking_id, is_read, dedupe_key
        )
        SELECT
          h.id,
          s.id,
          'check_in_reminder',
          v_title,
          v_message,
          v_first_booking,
          false,
          'check-in-reminder:' || v_tomorrow::text
        FROM public.staff_profiles s
        WHERE s.clerk_org_id = h.clerk_org_id
          AND s.is_active
          AND COALESCE((s.notification_prefs ->> 'check_in_reminder')::boolean, true) = true
        ON CONFLICT (hotel_id, recipient_staff_id, dedupe_key)
          WHERE recipient_staff_id IS NOT NULL AND dedupe_key IS NOT NULL
        DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted := v_inserted + v_rows;
      END IF;
    END IF;
  END LOOP;

  IF v_inserted > 0 THEN
    PERFORM public.trigger_push_delivery_worker();
  END IF;

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.dispatch_daily_stay_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_daily_stay_reminders() TO service_role;

COMMIT;
