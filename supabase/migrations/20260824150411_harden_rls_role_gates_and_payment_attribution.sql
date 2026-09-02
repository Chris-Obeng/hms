-- Hardening pass from production-readiness audit:
-- 1. notification_logs: enable RLS (deny-all for client roles; service_role bypasses RLS)
-- 2. Role-aware destructive operations: restrictive policies require manager+ for
--    DELETE on rooms/room_types/guests/payments/availability_blocks and direct
--    UPDATE on payments.
-- 3. record_payment_atomic: bind recorded_by to the caller's JWT when a staff
--    JWT is present; service-role/webhook callers keep the explicit parameter fallback.
-- 4. Missing FK indexes flagged by the performance advisor.
-- 5. Init-plan optimization for policies that re-evaluate auth.* per row.

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_has_staff_role(p_hotel_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff_profiles sp
      JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
     WHERE sp.clerk_user_id = auth.jwt() ->> 'sub'
       AND sp.is_active = true
       AND h.id = p_hotel_id
       AND sp.role::text = ANY (p_roles)
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.user_has_staff_role(uuid, text[]) FROM anon, authenticated;

CREATE POLICY rooms_destructive_requires_manager
  ON public.rooms AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

CREATE POLICY room_types_destructive_requires_manager
  ON public.room_types AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

CREATE POLICY guests_destructive_requires_manager
  ON public.guests AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

CREATE POLICY availability_blocks_destructive_requires_manager
  ON public.availability_blocks AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

CREATE POLICY payments_delete_requires_manager
  ON public.payments AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

CREATE POLICY payments_direct_update_requires_manager
  ON public.payments AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]))
  WITH CHECK (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

CREATE OR REPLACE FUNCTION public.record_payment_atomic(p_hotel_id uuid, p_booking_id uuid, p_amount numeric, p_method text, p_notes text, p_currency text, p_recorded_by uuid)
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
  v_jwt_staff_id  uuid;
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

  -- Bind attribution to the authenticated caller whenever a staff profile
  -- matches the JWT. Service-role callers (webhooks/cron) have no staff JWT
  -- and fall back to the explicitly supplied parameter.
  SELECT sp.id INTO v_jwt_staff_id
    FROM public.staff_profiles sp
   WHERE sp.clerk_user_id = auth.jwt() ->> 'sub'
     AND sp.is_active = true
   LIMIT 1;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  INSERT INTO public.payments (
    hotel_id, booking_id, amount, method, status,
    paid_at, notes, currency, recorded_by
  )
  VALUES (
    p_hotel_id, p_booking_id, p_amount, p_method, 'success',
    now(), p_notes, p_currency, COALESCE(v_jwt_staff_id, p_recorded_by)
  )
  RETURNING id INTO v_payment_id;

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

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_hotel_id
  ON public.push_subscriptions(hotel_id);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_granted_by
  ON public.staff_profiles(granted_by);

DROP POLICY IF EXISTS push_subscriptions_self_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_select
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (
    staff_id IN (
      SELECT sp.id FROM public.staff_profiles sp
       WHERE sp.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_insert
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    staff_id IN (
      SELECT sp.id FROM public.staff_profiles sp
       WHERE sp.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_update ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_update
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (
    staff_id IN (
      SELECT sp.id FROM public.staff_profiles sp
       WHERE sp.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
    )
  )
  WITH CHECK (
    staff_id IN (
      SELECT sp.id FROM public.staff_profiles sp
       WHERE sp.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_delete
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (
    staff_id IN (
      SELECT sp.id FROM public.staff_profiles sp
       WHERE sp.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
    )
  );

DROP POLICY IF EXISTS platform_admins_read_audit_logs ON public.platform_admin_audit_logs;
CREATE POLICY platform_admins_read_audit_logs
  ON public.platform_admin_audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins pa
       WHERE pa.supabase_user_id = (SELECT auth.uid())
         AND pa.is_active = true
    )
  );
