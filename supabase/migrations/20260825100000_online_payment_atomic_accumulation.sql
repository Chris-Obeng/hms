-- Atomic online-payment accumulation. The webhook previously overwrote
-- bookings.amount_paid with the latest transaction's value, so a booking that
-- received two online payments while still pending lost the first amount from
-- the running total. Increment server-side and return the new cumulative sum
-- so callers can classify confirmation state against money actually collected.

CREATE OR REPLACE FUNCTION public.add_online_payment_to_booking(
  p_booking_id uuid,
  p_hotel_id uuid,
  p_amount numeric
)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bookings b
  SET amount_paid = COALESCE(b.amount_paid, 0) + p_amount
  WHERE b.id = p_booking_id
    AND b.hotel_id = p_hotel_id
  RETURNING b.amount_paid;
$$;

REVOKE ALL ON FUNCTION public.add_online_payment_to_booking(uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_online_payment_to_booking(uuid, uuid, numeric)
  TO service_role;
