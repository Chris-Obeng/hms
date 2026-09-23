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