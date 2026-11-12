-- =============================================================================
-- Pre-Production Security & Payments Remediation Migration
-- Covers: BLK-03, BLK-04, HIGH-01, HIGH-03, HIGH-04, HIGH-08 (SQL), MED-01 RPC grant
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ── 1. BLK-04: Paystack environment isolation (`hotels.paystack_domain`) ──────
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS paystack_domain text;

ALTER TABLE public.hotels
  DROP CONSTRAINT IF EXISTS hotels_paystack_domain_check;

ALTER TABLE public.hotels
  ADD CONSTRAINT hotels_paystack_domain_check
    CHECK (paystack_domain IS NULL OR paystack_domain IN ('test', 'live'));

-- Existing pre-launch subaccount bindings were created under sk_test_...
UPDATE public.hotels
   SET paystack_domain = 'test'
 WHERE paystack_subaccount_code IS NOT NULL
   AND paystack_domain IS NULL;

-- ── 2. HIGH-08 (SQL) & MED-01: Exclude `pending` from tenant helpers & lock RPC ─
CREATE OR REPLACE FUNCTION public.get_user_hotel_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
  SELECT h.id
    FROM public.hotels h
    JOIN public.staff_profiles sp ON sp.clerk_org_id = h.clerk_org_id
   WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
     AND sp.is_active = true
     AND sp.role IS DISTINCT FROM 'pending';
$fn$;

CREATE OR REPLACE FUNCTION public.get_user_clerk_org_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
  SELECT sp.clerk_org_id
    FROM public.staff_profiles sp
   WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
     AND sp.is_active = true
     AND sp.role IS DISTINCT FROM 'pending';
$fn$;

CREATE OR REPLACE FUNCTION public.user_role_at_least_org(
  p_clerk_org_id text,
  p_min_role     text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT COALESCE(max(public.staff_role_level(sp.role::text)), 0) >= public.staff_role_level(p_min_role)
    FROM public.staff_profiles sp
   WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
     AND sp.is_active = true
     AND sp.role IS DISTINCT FROM 'pending'
     AND sp.clerk_org_id = p_clerk_org_id;
$fn$;

REVOKE ALL ON FUNCTION public.get_user_hotel_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_clerk_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_role_at_least_org(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_hotel_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_clerk_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_role_at_least_org(text, text) TO authenticated, service_role;

-- Allow any signed-in user (including pending/deactivated) to read ONLY their
-- own staff_profiles row for access-gate rendering without exposing org peers.
DROP POLICY IF EXISTS staff_profiles_self_select ON public.staff_profiles;
CREATE POLICY staff_profiles_self_select
  ON public.staff_profiles
  FOR SELECT
  TO authenticated
  USING (clerk_user_id = ((SELECT auth.jwt()) ->> 'sub'));

-- Revoke direct PostgREST RPC access to generate_booking_reference (clears lint 0029)
REVOKE ALL ON FUNCTION public.generate_booking_reference(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_booking_reference(uuid, text) TO service_role;

-- ── 3. BLK-03: PostgREST column guards, booking_nights RLS & payout privacy ───
DROP POLICY IF EXISTS booking_nights_insert_requires_manager ON public.booking_nights;
CREATE POLICY booking_nights_insert_requires_manager
  ON public.booking_nights AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

CREATE OR REPLACE FUNCTION public.guard_bookings_client_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_jwt_role    text := COALESCE((SELECT auth.jwt()) ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_sub         text := COALESCE((SELECT auth.jwt()) ->> 'sub',  current_setting('request.jwt.claim.sub', true));
  v_invoker_rol text := COALESCE(current_setting('role', true), 'none');
  v_valid_move  boolean := false;
BEGIN
  IF v_jwt_role = 'service_role'
     OR (
       current_user IN ('postgres', 'service_role', 'supabase_admin')
       AND v_invoker_rol IN ('none', 'postgres', 'service_role', 'supabase_admin')
       AND v_jwt_role NOT IN ('authenticated', 'anon')
       AND v_sub IS NULL
     ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Bookings must be created through the server booking workflow'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.hotel_id IS DISTINCT FROM OLD.hotel_id
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.guest_id IS DISTINCT FROM OLD.guest_id
     OR NEW.room_type_id IS DISTINCT FROM OLD.room_type_id
     OR NEW.check_in IS DISTINCT FROM OLD.check_in
     OR NEW.check_out IS DISTINCT FROM OLD.check_out
     OR NEW.rooms_count IS DISTINCT FROM OLD.rooms_count
     OR NEW.room_rate IS DISTINCT FROM OLD.room_rate
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_preference IS DISTINCT FROM OLD.payment_preference
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.rate_plan_id IS DISTINCT FROM OLD.rate_plan_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.initiated_payment_refs IS DISTINCT FROM OLD.initiated_payment_refs
     OR NEW.channel_provider IS DISTINCT FROM OLD.channel_provider
     OR NEW.external_booking_id IS DISTINCT FROM OLD.external_booking_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot directly modify immutable or financial booking fields'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_valid_move := (
      (OLD.status = 'pending'    AND NEW.status IN ('confirmed', 'cancelled', 'no_show')) OR
      (OLD.status = 'confirmed'  AND NEW.status IN ('checked_in', 'cancelled', 'no_show')) OR
      (OLD.status = 'checked_in' AND NEW.status IN ('checked_out')) OR
      (OLD.status = 'cancelled'  AND NEW.status IN ('confirmed')) OR
      (OLD.status = 'no_show'    AND NEW.status IN ('confirmed'))
    );
    IF NOT v_valid_move THEN
      RAISE EXCEPTION 'Invalid booking status transition from % to %', OLD.status, NEW.status
        USING ERRCODE = '22023';
    END IF;

    IF NEW.status = 'cancelled'
       AND COALESCE(OLD.amount_paid, 0) > 0
       AND NOT public.user_role_at_least(OLD.hotel_id, 'manager') THEN
      RAISE EXCEPTION 'Cancelling a booking with recorded payments requires manager privileges'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_bookings_client_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_bookings_client_write() TO service_role;

DROP TRIGGER IF EXISTS aa_guard_bookings_client_write ON public.bookings;
CREATE TRIGGER aa_guard_bookings_client_write
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_bookings_client_write();

CREATE OR REPLACE FUNCTION public.guard_hotels_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_jwt_role    text := COALESCE((SELECT auth.jwt()) ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_sub         text := COALESCE((SELECT auth.jwt()) ->> 'sub',  current_setting('request.jwt.claim.sub', true));
  v_invoker_rol text := COALESCE(current_setting('role', true), 'none');
BEGIN
  IF v_jwt_role = 'service_role'
     OR (
       current_user IN ('postgres', 'service_role', 'supabase_admin')
       AND v_invoker_rol IN ('none', 'postgres', 'service_role', 'supabase_admin')
       AND v_jwt_role NOT IN ('authenticated', 'anon')
       AND v_sub IS NULL
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.custom_domain IS DISTINCT FROM OLD.custom_domain
     OR NEW.clerk_org_id IS DISTINCT FROM OLD.clerk_org_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.paystack_subaccount_code IS DISTINCT FROM OLD.paystack_subaccount_code
     OR NEW.paystack_bank_code IS DISTINCT FROM OLD.paystack_bank_code
     OR NEW.paystack_account_number IS DISTINCT FROM OLD.paystack_account_number
     OR NEW.paystack_business_name IS DISTINCT FROM OLD.paystack_business_name
     OR NEW.paystack_settlement_schedule IS DISTINCT FROM OLD.paystack_settlement_schedule
     OR NEW.paystack_domain IS DISTINCT FROM OLD.paystack_domain
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot directly modify protected hotel identity or payout fields'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_role_at_least(OLD.id, 'super_admin') THEN
    RAISE EXCEPTION 'Only super_admin may update hotel profile settings'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_hotels_client_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_hotels_client_update() TO service_role;

DROP TRIGGER IF EXISTS aa_guard_hotels_client_update ON public.hotels;
CREATE TRIGGER aa_guard_hotels_client_update
  BEFORE UPDATE ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION public.guard_hotels_client_update();

DO $pub$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hotels'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.hotels;
  END IF;
END;
$pub$;

REVOKE SELECT ON TABLE public.hotels FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, slug, name, description, address, city, country, phone, email,
  logo_url, cover_image_url, timezone, currency, check_in_time, check_out_time,
  cancellation_policy, custom_domain, clerk_org_id, paystack_subaccount_code,
  paystack_business_name, paystack_bank_code, paystack_settlement_schedule,
  paystack_domain, status, settings, created_at, updated_at
) ON TABLE public.hotels TO authenticated;

-- ── 4. HIGH-01: Classify online Paystack settlements as `method = 'paystack_link'`
UPDATE public.payments
   SET method = 'paystack_link'
 WHERE paystack_reference IS NOT NULL
   AND method = 'card';

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
  v_booking             public.bookings%ROWTYPE;
  v_attempt             public.payment_attempts%ROWTYPE;
  v_payment             public.payments%ROWTYPE;
  v_existing_by_id      public.payments%ROWTYPE;
  v_total_paid          numeric;
  v_total_minor         bigint;
  v_minor_factor        bigint;
  v_expected_subacct    text;
  v_is_replay           boolean := false;
  v_active_booking      boolean;
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
      'paystack_link', 'success', p_paystack_reference, p_paystack_id,
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
     AND p.status = 'success'
     AND p.method IS DISTINCT FROM 'refund';

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
        p_hotel_id, v_line.id, v_line.total_amount, p_currency, 'paystack_link', 'success',
        v_derived_ref,
        CASE WHEN v_line.id = p_group_id THEN p_paystack_id ELSE NULL END,
        p_subaccount_code, now()
      );
    END IF;

    SELECT COALESCE(sum(p.amount), 0) INTO v_line_paid
      FROM public.payments p
     WHERE p.booking_id = v_line.id
       AND p.hotel_id = p_hotel_id
       AND p.status = 'success'
       AND p.method IS DISTINCT FROM 'refund';

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

-- ── 5. HIGH-03: Extend `reconcile_pending_payments()` across full 24h window ──
ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;

CREATE OR REPLACE FUNCTION public.reconcile_pending_payments()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, vault
AS $fn$
DECLARE
  v_base_url      text;
  v_worker_secret text;
  v_headers       jsonb;
  v_fired         integer := 0;
  r               record;
BEGIN
  SELECT ds.decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets ds
   WHERE ds.name = 'payment_reconcile_base_url'
   LIMIT 1;

  IF v_base_url IS NULL OR btrim(v_base_url) = '' THEN
    RETURN 0; -- Not configured (local dev / CI): sweep disabled.
  END IF;
  v_base_url := rtrim(btrim(v_base_url), '/');

  SELECT ds.decrypted_secret INTO v_worker_secret
    FROM vault.decrypted_secrets ds
   WHERE ds.name = 'push_worker_secret'
   LIMIT 1;

  v_headers := CASE
    WHEN v_worker_secret IS NOT NULL AND btrim(v_worker_secret) <> ''
      THEN jsonb_build_object('x-reconcile-worker-secret', btrim(v_worker_secret))
    ELSE '{}'::jsonb
  END;

  FOR r IN
    SELECT pa.id AS attempt_id, h.slug, pa.paystack_reference AS ref
      FROM public.payment_attempts pa
      JOIN public.bookings b ON b.id = pa.booking_id AND b.hotel_id = pa.hotel_id
      JOIN public.hotels h ON h.id = pa.hotel_id
     WHERE pa.status = 'initialized'
       AND pa.created_at > now() - interval '24 hours'
       AND COALESCE(pa.initialized_at, pa.created_at) <= now() - interval '3 minutes'
       AND (pa.last_reconciled_at IS NULL OR pa.last_reconciled_at <= now() - interval '4 minutes')
       AND (
         b.status = 'pending'
         OR (b.status = 'cancelled' AND b.cancellation_reason = 'payment_timeout')
       )
       AND b.payment_status IN ('unpaid', 'partial')
       AND b.payment_preference = 'pay_now'
       AND pa.paystack_reference ~ '^[A-Za-z0-9._-]+$'
     ORDER BY pa.last_reconciled_at ASC NULLS FIRST, pa.created_at ASC
     LIMIT 8
  LOOP
    UPDATE public.payment_attempts
       SET last_reconciled_at = now(),
           updated_at = now()
     WHERE id = r.attempt_id;

    PERFORM net.http_get(
      url     := v_base_url || '/api/booking/' || r.slug || '/payments/verify?reference=' || r.ref,
      headers := v_headers
    );
    v_fired := v_fired + 1;
  END LOOP;

  RETURN v_fired;
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_pending_payments() IS
  'Sweeps initialized Paystack payment_attempts across the full 24h window — including holds transitioned to cancelled/payment_timeout after 30m (e.g. Pay with Transfer up to 8h or missed webhooks) — in round-robin order with authenticated worker header.';

REVOKE ALL ON FUNCTION public.reconcile_pending_payments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_pending_payments() TO service_role;

-- ── 6. HIGH-04: Atomic Paystack refund reconciliation RPC ─────────────────────
CREATE OR REPLACE FUNCTION public.record_paystack_refund_atomic(
  p_transaction_reference text,
  p_refund_id             text,
  p_refund_amount_minor   bigint,
  p_currency              text
)
RETURNS TABLE (
  result         text,
  hotel_id       uuid,
  booking_id     uuid,
  payment_status text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $refund$
#variable_conflict use_variable
DECLARE
  v_minor_factor     bigint;
  v_escaped_prefix   text;
  v_refund_ref       text;
  v_orig_total_minor bigint := 0;
  v_hotel_id         uuid;
  v_anchor_booking   uuid;
  v_booking_status   text;
  v_rec              record;
  v_gross_paid       numeric;
  v_partial_refunded numeric;
  v_net_paid         numeric;
  v_alloc_minor      bigint;
  v_remaining_minor  bigint;
  v_count            integer := 0;
  v_idx              integer := 0;
BEGIN
  IF p_transaction_reference IS NULL OR btrim(p_transaction_reference) = ''
     OR p_refund_id IS NULL OR btrim(p_refund_id) = ''
     OR p_refund_amount_minor IS NULL OR p_refund_amount_minor <= 0
     OR p_currency IS NULL OR upper(btrim(p_currency)) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid refund identity'
      USING ERRCODE = '22023';
  END IF;

  p_currency := upper(btrim(p_currency));
  v_minor_factor := (10::bigint ^ public.currency_exponent(p_currency))::bigint;
  v_escaped_prefix := replace(replace(replace(btrim(p_transaction_reference), '\', '\\'), '%', '\%'), '_', '\_');
  v_refund_ref := 'refund:' || btrim(p_transaction_reference) || ':' || btrim(p_refund_id);

  FOR v_rec IN
    SELECT p.*, b.group_id
      FROM public.payments p
      JOIN public.bookings b ON b.id = p.booking_id AND b.hotel_id = p.hotel_id
     WHERE (
       p.paystack_reference = btrim(p_transaction_reference)
       OR p.paystack_reference LIKE (v_escaped_prefix || '::%') ESCAPE '\'
     )
       AND p.method IS DISTINCT FROM 'refund'
     ORDER BY p.created_at ASC, p.id ASC
     FOR UPDATE OF p, b
  LOOP
    v_count := v_count + 1;
    v_hotel_id := v_rec.hotel_id;
    v_anchor_booking := COALESCE(v_rec.group_id, v_rec.booking_id);
    v_orig_total_minor := v_orig_total_minor + round(v_rec.amount * v_minor_factor)::bigint;

    IF v_rec.status = 'refunded'
       AND COALESCE(v_rec.metadata ->> 'last_refund_id', '') = btrim(p_refund_id) THEN
      SELECT b.payment_status INTO v_booking_status
        FROM public.bookings b
       WHERE b.id = v_anchor_booking AND b.hotel_id = v_hotel_id;
      result := 'already_recorded';
      hotel_id := v_hotel_id;
      booking_id := v_anchor_booking;
      payment_status := v_booking_status;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    result := 'not_found';
    hotel_id := NULL;
    booking_id := NULL;
    payment_status := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p
     WHERE p.paystack_reference = v_refund_ref
        OR p.paystack_reference LIKE (replace(replace(replace(v_refund_ref, '\', '\\'), '%', '\%'), '_', '\_') || '::%') ESCAPE '\'
  ) THEN
    SELECT b.payment_status INTO v_booking_status
      FROM public.bookings b
     WHERE b.id = v_anchor_booking AND b.hotel_id = v_hotel_id;
    result := 'already_recorded';
    hotel_id := v_hotel_id;
    booking_id := v_anchor_booking;
    payment_status := v_booking_status;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_refund_amount_minor >= v_orig_total_minor THEN
    UPDATE public.payments p
       SET status = 'refunded',
           metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
             'last_refund_id', btrim(p_refund_id),
             'refunded_amount_minor', p_refund_amount_minor,
             'refunded_at', now()
           ),
           updated_at = now()
     WHERE (
       p.paystack_reference = btrim(p_transaction_reference)
       OR p.paystack_reference LIKE (v_escaped_prefix || '::%') ESCAPE '\'
     )
       AND p.method IS DISTINCT FROM 'refund';
  ELSE
    v_remaining_minor := p_refund_amount_minor;
    FOR v_rec IN
      SELECT p.*
        FROM public.payments p
       WHERE (
         p.paystack_reference = btrim(p_transaction_reference)
         OR p.paystack_reference LIKE (v_escaped_prefix || '::%') ESCAPE '\'
       )
         AND p.method IS DISTINCT FROM 'refund'
       ORDER BY p.created_at ASC, p.id ASC
    LOOP
      v_idx := v_idx + 1;
      IF v_idx = v_count THEN
        v_alloc_minor := v_remaining_minor;
      ELSE
        v_alloc_minor := LEAST(
          v_remaining_minor,
          round((p_refund_amount_minor::numeric * round(v_rec.amount * v_minor_factor)) / NULLIF(v_orig_total_minor, 0))::bigint
        );
      END IF;
      v_remaining_minor := GREATEST(0, v_remaining_minor - v_alloc_minor);

      IF v_alloc_minor > 0 THEN
        INSERT INTO public.payments (
          hotel_id, booking_id, amount, currency, method, status,
          paystack_reference, paystack_subaccount, paid_at, notes, metadata
        ) VALUES (
          v_rec.hotel_id,
          v_rec.booking_id,
          v_alloc_minor::numeric / v_minor_factor,
          p_currency,
          'refund',
          'refunded',
          CASE WHEN v_count = 1 THEN v_refund_ref ELSE v_refund_ref || '::' || v_rec.booking_id::text END,
          v_rec.paystack_subaccount,
          now(),
          'Paystack partial refund (' || btrim(p_refund_id) || ')',
          jsonb_build_object(
            'refund_id', btrim(p_refund_id),
            'original_reference', btrim(p_transaction_reference),
            'refund_amount_minor', v_alloc_minor
          )
        );
      END IF;
    END LOOP;
  END IF;

  FOR v_rec IN
    SELECT DISTINCT p.booking_id, p.hotel_id
      FROM public.payments p
     WHERE (
       p.paystack_reference = btrim(p_transaction_reference)
       OR p.paystack_reference LIKE (v_escaped_prefix || '::%') ESCAPE '\'
     )
       AND p.method IS DISTINCT FROM 'refund'
  LOOP
    SELECT COALESCE(sum(p2.amount), 0) INTO v_gross_paid
      FROM public.payments p2
     WHERE p2.booking_id = v_rec.booking_id
       AND p2.hotel_id = v_rec.hotel_id
       AND p2.status = 'success'
       AND p2.method IS DISTINCT FROM 'refund';

    SELECT COALESCE(sum(p3.amount), 0) INTO v_partial_refunded
      FROM public.payments p3
     WHERE p3.booking_id = v_rec.booking_id
       AND p3.hotel_id = v_rec.hotel_id
       AND p3.method = 'refund'
       AND p3.status = 'refunded';

    v_net_paid := GREATEST(0::numeric, v_gross_paid - v_partial_refunded);

    UPDATE public.bookings b
       SET amount_paid = v_net_paid,
           payment_status = CASE
             WHEN v_net_paid <= 0 THEN 'refunded'
             WHEN v_net_paid < b.total_amount THEN 'partial'
             ELSE 'paid'
           END,
           updated_at = now()
     WHERE b.id = v_rec.booking_id
       AND b.hotel_id = v_rec.hotel_id
     RETURNING b.payment_status INTO v_booking_status;
  END LOOP;

  SELECT b.payment_status INTO v_booking_status
    FROM public.bookings b
   WHERE b.id = v_anchor_booking AND b.hotel_id = v_hotel_id;

  result := 'recorded';
  hotel_id := v_hotel_id;
  booking_id := v_anchor_booking;
  payment_status := v_booking_status;
  RETURN NEXT;
END;
$refund$;

REVOKE ALL ON FUNCTION public.record_paystack_refund_atomic(text, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paystack_refund_atomic(text, text, bigint, text)
  TO service_role;

COMMIT;
