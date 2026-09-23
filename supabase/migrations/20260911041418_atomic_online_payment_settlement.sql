-- Durable Paystack intent and replay-safe online settlement.

CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL,
  paystack_reference text NOT NULL,
  paystack_id text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  expected_subaccount_code text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'initialized', 'succeeded', 'failed')),
  provider_response jsonb,
  initialized_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempts_reference_key UNIQUE (paystack_reference),
  CONSTRAINT payment_attempts_booking_hotel_fk
    FOREIGN KEY (booking_id, hotel_id)
    REFERENCES public.bookings (id, hotel_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX payment_attempts_paystack_id_key
  ON public.payment_attempts (paystack_id)
  WHERE paystack_id IS NOT NULL;

CREATE INDEX payment_attempts_booking_created_idx
  ON public.payment_attempts (booking_id, created_at DESC);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payment_attempts TO service_role;

-- Durable intent for every reference already handed to Paystack. Without these
-- rows a webhook or verify call for a pre-existing booking would die on
-- 'payment attempt identity mismatch' with the money already captured. Amount
-- and currency come from the recorded payment when there is one (retry
-- references charge the remaining balance, not the booking total) and from the
-- booking otherwise. References whose hotel never finished Paystack setup are
-- skipped: the RPC would reject their settlement on the subaccount check
-- anyway, and a fabricated expectation is worse than none.
INSERT INTO public.payment_attempts (
  hotel_id, booking_id, paystack_reference, amount_minor, currency,
  expected_subaccount_code, metadata, status, settled_at
)
SELECT b.hotel_id,
       b.id,
       ref,
       public.to_minor(COALESCE(p.amount, b.total_amount),
                       COALESCE(p.currency, b.currency, 'GHS')),
       COALESCE(p.currency, b.currency, 'GHS'),
       h.paystack_subaccount_code,
       jsonb_build_object(
         'booking_id', b.id::text,
         'hotel_id', b.hotel_id::text,
         'booking_reference', b.reference
       ),
       CASE WHEN p.id IS NOT NULL THEN 'succeeded' ELSE 'initialized' END,
       CASE WHEN p.id IS NOT NULL THEN COALESCE(p.paid_at, p.created_at) END
  FROM public.bookings b
  CROSS JOIN LATERAL unnest(b.initiated_payment_refs) AS ref
  JOIN public.hotels h ON h.id = b.hotel_id
  LEFT JOIN public.payments p
    ON p.paystack_reference = ref AND p.status = 'success'
 WHERE h.paystack_subaccount_code IS NOT NULL
   AND b.total_amount > 0
ON CONFLICT (paystack_reference) DO NOTHING;

CREATE OR REPLACE FUNCTION public.settle_online_payment_atomic(
  p_booking_id uuid,
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
  booking_id uuid,
  amount_paid_minor bigint,
  payment_status text,
  booking_status text,
  partial_payment boolean,
  already_recorded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $settle$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_attempt public.payment_attempts%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_existing_by_id public.payments%ROWTYPE;
  v_total_paid numeric;
  v_total_minor bigint;
  v_minor_factor bigint;
  v_expected_subaccount text;
  v_is_replay boolean := false;
  v_active_booking boolean;
BEGIN
  IF p_paystack_reference IS NULL OR btrim(p_paystack_reference) = ''
     OR p_paystack_id IS NULL OR btrim(p_paystack_id) = ''
     OR p_amount_minor IS NULL OR p_amount_minor <= 0
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_subaccount_code IS NULL OR btrim(p_subaccount_code) = '' THEN
    RAISE EXCEPTION 'invalid settlement identity';
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id AND hotel_id = p_hotel_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found or hotel mismatch';
  END IF;

  SELECT * INTO v_attempt
    FROM public.payment_attempts
   WHERE paystack_reference = p_paystack_reference
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
  SELECT h.paystack_subaccount_code INTO v_expected_subaccount
    FROM public.hotels h
   WHERE h.id = p_hotel_id;

  IF v_expected_subaccount IS NULL
     OR v_expected_subaccount IS DISTINCT FROM p_subaccount_code THEN
    RAISE EXCEPTION 'subaccount mismatch';
  END IF;

  IF v_attempt.expected_subaccount_code IS DISTINCT FROM p_subaccount_code THEN
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

  SELECT * INTO v_payment
    FROM public.payments
   WHERE paystack_reference = p_paystack_reference
   FOR UPDATE;

  SELECT * INTO v_existing_by_id
    FROM public.payments
   WHERE paystack_id = p_paystack_id
   FOR UPDATE;

  IF v_existing_by_id.id IS NOT NULL
     AND (v_payment.id IS NULL OR v_existing_by_id.id <> v_payment.id) THEN
    RAISE EXCEPTION 'Paystack transaction ID collision';
  END IF;

  IF v_payment.id IS NOT NULL THEN
    v_is_replay := true;
    -- Payments recorded before this contract may carry no paystack_id. A replay
    -- that has passed every other identity check is the authoritative source for
    -- it, so the gap is filled rather than reported as a collision.
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
      UPDATE public.payments SET paystack_id = p_paystack_id WHERE id = v_payment.id;
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

  UPDATE public.payment_attempts
     SET status = 'succeeded', paystack_id = p_paystack_id,
         settled_at = COALESCE(settled_at, now()), updated_at = now()
   WHERE id = v_attempt.id;

  SELECT COALESCE(sum(p.amount), 0) INTO v_total_paid
    FROM public.payments p
   WHERE p.booking_id = p_booking_id
     AND p.hotel_id = p_hotel_id
     AND p.status = 'success';

  v_total_minor := round(v_total_paid * v_minor_factor)::bigint;
  v_active_booking := v_booking.status = 'pending'
    OR (v_booking.status = 'cancelled'
        AND v_booking.cancellation_reason = 'payment_timeout');

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

  result := CASE WHEN v_is_replay THEN 'already_recorded' ELSE 'recorded' END;
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
