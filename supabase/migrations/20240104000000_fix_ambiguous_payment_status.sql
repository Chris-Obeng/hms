-- ============================================================================
-- Fix: Ambiguous "payment_status" column reference in record_payment_atomic
-- ============================================================================
-- The function had:
--   RETURNING COALESCE(amount_paid, 0), payment_status
--
-- payment_status is ambiguous because:
--   1. bookings table has a column named payment_status
--   2. The function returns TABLE(payment_id uuid, payment_status text)
--      — in PL/pgSQL, RETURNS TABLE params are visible as variables,
--      so PostgreSQL can't tell whether to use the column or the param.
--
-- Fix: Qualify with bookings. prefix in the RETURNING clause.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_hotel_id       uuid,
  p_booking_id     uuid,
  p_amount         numeric,
  p_method         text,
  p_notes          text,
  p_currency       text,
  p_recorded_by    uuid
)
RETURNS TABLE(payment_id uuid, payment_status text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment_id    uuid;
  v_new_paid      numeric;
  v_total         numeric;
  v_status        text;
BEGIN
  -- Insert the payment row
  INSERT INTO public.payments (
    hotel_id, booking_id, amount, method, status,
    paid_at, notes, currency, recorded_by
  )
  VALUES (
    p_hotel_id, p_booking_id, p_amount, p_method, 'success',
    now(), p_notes, p_currency, p_recorded_by
  )
  RETURNING id INTO v_payment_id;

  -- Atomically increment amount_paid and recompute payment_status
  UPDATE public.bookings
  SET
    amount_paid    = COALESCE(amount_paid, 0) + p_amount,
    payment_status = CASE
                       WHEN COALESCE(amount_paid, 0) + p_amount >= total_amount THEN 'paid'
                       ELSE 'partial'
                     END
  WHERE id = p_booking_id
    AND hotel_id = p_hotel_id
  RETURNING
    COALESCE(bookings.amount_paid, 0) AS v_new_paid,
    bookings.payment_status            AS v_status
  INTO v_new_paid, v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or hotel mismatch';
  END IF;

  RETURN QUERY SELECT v_payment_id, v_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_payment_atomic(uuid,uuid,numeric,text,text,text,uuid) FROM anon, authenticated;
