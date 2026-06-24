-- ============================================================================
-- Atomic payment recording and bulk room status update RPCs
-- June 2026
-- ============================================================================

-- ── record_payment_atomic ────────────────────────────────────────────────────
-- Inserts a payment row and increments bookings.amount_paid atomically in a
-- single transaction, eliminating the read-modify-write race in recordPayment.
-- Returns the new payment row id and the updated payment_status.
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
    COALESCE(amount_paid, 0) AS v_new_paid,
    payment_status            AS v_status
  INTO v_new_paid, v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or hotel mismatch';
  END IF;

  RETURN QUERY SELECT v_payment_id, v_status;
END;
$$;

-- ── bulk_update_room_statuses ────────────────────────────────────────────────
-- Updates multiple rooms to potentially different statuses in one transaction.
-- p_updates is a JSON array: [{"room_id": "<uuid>", "status": "<status>"}, ...]
-- All rows must belong to p_hotel_id (hotel-scoping enforced in WHERE clause).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_room_statuses(
  p_hotel_id uuid,
  p_updates  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE public.rooms
    SET    status = (v_item->>'status')
    WHERE  id        = (v_item->>'room_id')::uuid
      AND  hotel_id  = p_hotel_id;
  END LOOP;
END;
$$;
