-- =============================================================================
-- Group online settlement: one verified Paystack charge -> N credited bookings.
--
-- settle_online_group_payment_atomic() is the multi-room sibling of
-- settle_online_payment_atomic() (20260911041418). The single-room settler is
-- left byte-for-byte unchanged; the webhook/verify routes branch on
-- metadata.group_id and call this instead for grouped reservations.
--
-- A multi-room reservation is N bookings rows sharing bookings.group_id (anchor
-- row: group_id = id). The guest is charged ONCE for the group total via a
-- single payment_attempts row on the anchor, keyed by the raw group reference.
-- This RPC receives that one verified charge and splits it across the lines:
--
--   * ONE payments row per line, amount = that line's own total_amount.
--   * Each row's paystack_reference is derived: '<rawRef>::<bookingId>', which
--     keeps the global-unique payments.paystack_reference satisfied and makes the
--     split replay-idempotent per line.
--   * payments.paystack_id carries a UNIQUE partial index (payments_paystack_id_unique,
--     20260824023558) so the real Paystack transaction id CANNOT repeat across
--     the N rows. It is stored on the ANCHOR line only; sibling rows keep
--     paystack_id NULL. The index is WHERE paystack_id IS NOT NULL, so the NULL
--     siblings are exempt while the anchor still carries the real id for lookups.
--
-- All-or-nothing: any per-line failure raises and rolls back the whole split.
-- Identity is validated against the anchor attempt exactly as the single-room
-- settler validates its own, then extended to the group (amount == sum of line
-- totals, one currency, hotel subaccount).
--
-- expire_stale_payment_holds / reconcile_pending_payments / room_type_available_count
-- need NO change: each line is its own bookings row, so the per-row predicates
-- already release every sibling hold, and the anchor alone carries the group
-- reference in initiated_payment_refs so reconcile fires exactly one verify.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.settle_online_group_payment_atomic(
  p_group_id uuid,
  p_hotel_id uuid,
  p_paystack_reference text,
  p_paystack_id text,
  p_amount_minor bigint,
  p_currency text,
  p_subaccount_code text,
  p_metadata jsonb
)
RETURNS TABLE (
  result text,
  group_id uuid,
  amount_paid_minor bigint,
  line_count integer,
  all_confirmed boolean,
  already_recorded boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $settle$
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
  v_active           boolean;
BEGIN
  IF p_paystack_reference IS NULL OR btrim(p_paystack_reference) = ''
     OR p_paystack_id IS NULL OR btrim(p_paystack_id) = ''
     OR p_amount_minor IS NULL OR p_amount_minor <= 0
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_subaccount_code IS NULL OR btrim(p_subaccount_code) = '' THEN
    RAISE EXCEPTION 'invalid settlement identity';
  END IF;

  -- One attempt per group, on the anchor, keyed by the raw group reference.
  SELECT * INTO v_attempt
    FROM public.payment_attempts
   WHERE paystack_reference = p_paystack_reference
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

  v_minor_factor := CASE p_currency
    WHEN 'BIF' THEN 1 WHEN 'CLP' THEN 1 WHEN 'DJF' THEN 1
    WHEN 'GNF' THEN 1 WHEN 'ISK' THEN 1 WHEN 'JPY' THEN 1
    WHEN 'KMF' THEN 1 WHEN 'KRW' THEN 1 WHEN 'PYG' THEN 1
    WHEN 'RWF' THEN 1 WHEN 'UGX' THEN 1 WHEN 'VND' THEN 1
    WHEN 'VUV' THEN 1 WHEN 'XAF' THEN 1 WHEN 'XOF' THEN 1
    WHEN 'XPF' THEN 1
    WHEN 'BHD' THEN 1000 WHEN 'IQD' THEN 1000 WHEN 'JOD' THEN 1000
    WHEN 'KWD' THEN 1000 WHEN 'LYD' THEN 1000 WHEN 'OMR' THEN 1000
    WHEN 'TND' THEN 1000
    ELSE 100
  END;

  -- Pass 1: lock every line, assert one currency, sum the group total.
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

  -- Real transaction id lands on the anchor line only; guard a foreign collision
  -- the way the single-room settler does, before the unique index would raise it.
  SELECT * INTO v_existing_by_id
    FROM public.payments
   WHERE paystack_id = p_paystack_id
   FOR UPDATE;
  IF v_existing_by_id.id IS NOT NULL
     AND v_existing_by_id.paystack_reference
         IS DISTINCT FROM p_paystack_reference || '::' || p_group_id::text THEN
    RAISE EXCEPTION 'Paystack transaction ID collision';
  END IF;

  -- Pass 2: one payments row per line, then recompute that line's balance/status.
  FOR v_line IN
    SELECT b.* FROM public.bookings b
     WHERE b.group_id = p_group_id AND b.hotel_id = p_hotel_id
     ORDER BY b.id
  LOOP
    v_derived_ref := p_paystack_reference || '::' || v_line.id::text;

    SELECT * INTO v_payment
      FROM public.payments
     WHERE paystack_reference = v_derived_ref
     FOR UPDATE;

    IF v_payment.id IS NOT NULL THEN
      -- Replay of this line: it must match what a fresh split would write.
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

    IF v_line_status IS DISTINCT FROM 'confirmed' THEN
      v_all_confirmed := false;
    END IF;
    v_group_paid := v_group_paid + round(v_line_paid * v_minor_factor)::bigint;
  END LOOP;

  UPDATE public.payment_attempts
     SET status = 'succeeded', paystack_id = p_paystack_id,
         settled_at = COALESCE(settled_at, now()), updated_at = now()
   WHERE id = v_attempt.id;

  result            := CASE WHEN v_any_new THEN 'recorded' ELSE 'already_recorded' END;
  group_id          := p_group_id;
  amount_paid_minor := v_group_paid;
  line_count        := v_line_count;
  all_confirmed     := v_all_confirmed;
  already_recorded  := NOT v_any_new;
  RETURN NEXT;
END
$settle$;

COMMENT ON FUNCTION public.settle_online_group_payment_atomic(
  uuid, uuid, text, text, bigint, text, text, jsonb
) IS
  'Splits one verified Paystack group charge across the bookings sharing group_id: one payments row per line (amount = line total, derived reference <rawRef>::<bookingId>, real paystack_id on the anchor line only), recomputes each line''s balance and flips it pending->confirmed. All-or-nothing, replay-idempotent per line. Multi-room sibling of settle_online_payment_atomic; the single-room path is unchanged.';

REVOKE ALL ON FUNCTION public.settle_online_group_payment_atomic(
  uuid, uuid, text, text, bigint, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_online_group_payment_atomic(
  uuid, uuid, text, text, bigint, text, text, jsonb
) TO service_role;

-- =============================================================================
-- abort_unpaid_group(): roll back a whole reservation group's unpaid holds in
-- one transaction when Paystack init fails. Composes the vetted single-booking
-- abort_unpaid_booking() once per line, so its guards (refuse if amount_paid > 0
-- or any payment row exists), the nights/attempt cascades, the orphan-guest
-- cleanup and the per-line audit row all apply unchanged. Siblings first, anchor
-- last: the shared guest is removed only when its final line goes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.abort_unpaid_group(
  p_group_id uuid,
  p_reason   text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_id    uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT b.id FROM public.bookings b
     WHERE b.group_id = p_group_id
     ORDER BY (b.id = p_group_id)
  LOOP
    PERFORM public.abort_unpaid_booking(v_id, p_reason);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$fn$;

COMMENT ON FUNCTION public.abort_unpaid_group(uuid, text) IS
  'Aborts every unpaid hold in a reservation group in one transaction by composing abort_unpaid_booking() per line (siblings first, anchor last). All-or-nothing; refuses if any line carries a payment. Returns the line count aborted.';

REVOKE ALL ON FUNCTION public.abort_unpaid_group(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abort_unpaid_group(uuid, text) TO service_role;

-- Guard: assert both composed writers landed with the same posture as their peers.
DO $guard$
DECLARE
  v_sig  text;
  v_sigs text[] := ARRAY[
    'public.settle_online_group_payment_atomic(uuid, uuid, text, text, bigint, text, text, jsonb)',
    'public.abort_unpaid_group(uuid, text)'
  ];
  v_prov "char";
  v_sec  boolean;
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    SELECT p.provolatile, p.prosecdef INTO v_prov, v_sec
      FROM pg_proc p WHERE p.oid = v_sig::regprocedure;

    IF v_prov <> 'v' THEN
      RAISE EXCEPTION '% must be VOLATILE, found %', v_sig, v_prov;
    END IF;
    IF NOT v_sec THEN
      RAISE EXCEPTION '% must be SECURITY DEFINER', v_sig;
    END IF;
    IF has_function_privilege('anon', v_sig::regprocedure, 'EXECUTE')
       OR has_function_privilege('authenticated', v_sig::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% must not be callable by anon or authenticated', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_sig::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% must be callable by service_role', v_sig;
    END IF;
  END LOOP;
END;
$guard$;

