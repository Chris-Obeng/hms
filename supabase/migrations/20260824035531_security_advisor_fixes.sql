-- ── record_payment_atomic: enforce caller belongs to the target hotel ──
-- Server action already role-gates, but the RPC is reachable via PostgREST by
-- any signed-in JWT; SECURITY DEFINER would otherwise let a foreign tenant
-- insert payments into another hotel's books.
CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_hotel_id uuid,
  p_booking_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text,
  p_currency text,
  p_recorded_by uuid
)
RETURNS TABLE(payment_id uuid, payment_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_payment_id    uuid;
  v_new_paid      numeric;
  v_total         numeric;
  v_status        text;
BEGIN
  -- Caller must be active staff of the target hotel (JWT-scoped).
  IF NOT EXISTS (
    SELECT 1
      FROM public.staff_profiles sp
      JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
     WHERE sp.clerk_user_id = auth.jwt() ->> 'sub'
       AND sp.is_active = true
       AND h.id = p_hotel_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: not staff of this hotel';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

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
$function$;

-- ── Cron-only functions: PostgREST must not execute them ──
REVOKE EXECUTE ON FUNCTION public.expire_stale_payment_holds()
  FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.expire_stale_payment_holds()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reconcile_pending_payments()
  FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.reconcile_pending_payments()
  TO service_role;

-- JWT-scoped helpers: keep EXECUTE for authenticated (RLS policies evaluate
-- them), but anon has no business calling them.
REVOKE EXECUTE ON FUNCTION public.get_user_hotel_ids() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_clerk_org_ids() FROM anon, public;

COMMENT ON TABLE public.booking_reference_counters IS
  'Service-role-only. Monotonic booking reference counters used by generate_booking_reference(). RLS enabled with no policies = deny-all for anon/authenticated; access only via SUPABASE_SERVICE_ROLE_KEY. Do not add policies without review.';
