-- =============================================================================
-- Harden intra-tenant RBAC role gates, non-bypassable staff privilege guard,
-- recipient-scoped notifications RLS, audit immutability + FK ON DELETE safety,
-- least-privilege grants, RPC date/tenant bounds, and storage.objects policies.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ── 1. Optimize auth.jwt() initplan inside core RLS helpers ───────────────────
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
     AND sp.is_active = true;
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
     AND sp.is_active = true;
$fn$;

REVOKE ALL ON FUNCTION public.get_user_hotel_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_clerk_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_hotel_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_clerk_org_ids() TO authenticated, service_role;

-- Org-scoped role ladder helper (for staff_profiles, keyed by clerk_org_id)
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
     AND sp.clerk_org_id = p_clerk_org_id;
$fn$;

COMMENT ON FUNCTION public.user_role_at_least_org(text, text) IS
  'Clerk-org twin of public.user_role_at_least(uuid, text) for tables keyed by clerk_org_id (staff_profiles).';

REVOKE ALL ON FUNCTION public.user_role_at_least_org(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_role_at_least_org(text, text) TO authenticated, service_role;

-- ── 2. Non-bypassable staff_profiles privilege-column & hierarchy guard ───────
-- IMPORTANT: Inside a postgres-owned SECURITY DEFINER function, `current_user`
-- is ALWAYS 'postgres'. Never check `current_user` here! Instead inspect the
-- caller's SET ROLE (`current_setting('role', true)`) and JWT claims.
CREATE OR REPLACE FUNCTION public.guard_staff_profile_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_jwt_role    text := COALESCE((SELECT auth.jwt()) ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_sub         text := COALESCE((SELECT auth.jwt()) ->> 'sub',  current_setting('request.jwt.claim.sub', true));
  v_invoker_rol text := COALESCE(current_setting('role', true), 'none');
  v_actor_level integer;
BEGIN
  IF v_jwt_role = 'service_role'
     OR (
       v_invoker_rol IN ('none', 'postgres', 'service_role', 'supabase_admin')
       AND v_jwt_role NOT IN ('authenticated', 'anon')
       AND v_sub IS NULL
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id
     OR NEW.clerk_org_id IS DISTINCT FROM OLD.clerk_org_id THEN
    RAISE EXCEPTION 'Cannot reassign staff profile user or organization identity'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.granted_by IS NOT DISTINCT FROM OLD.granted_by
     AND NEW.granted_at IS NOT DISTINCT FROM OLD.granted_at THEN
    RETURN NEW;
  END IF;

  IF v_sub IS NULL OR OLD.clerk_user_id = v_sub THEN
    RAISE EXCEPTION 'Cannot modify your own staff role or activation status'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(max(public.staff_role_level(sp.role::text)), 0)
    INTO v_actor_level
    FROM public.staff_profiles sp
   WHERE sp.clerk_user_id = v_sub
     AND sp.is_active = true
     AND sp.clerk_org_id = OLD.clerk_org_id;

  IF v_actor_level < public.staff_role_level('manager') THEN
    RAISE EXCEPTION 'Insufficient privileges to administer staff profiles'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor_level < public.staff_role_level('super_admin') THEN
    IF COALESCE(OLD.role, 'pending') = 'pending' AND OLD.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Only a super_admin may approve pending staff requests'
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(public.staff_role_level(OLD.role), 0) >= public.staff_role_level('super_admin') THEN
      RAISE EXCEPTION 'Managers cannot modify a super_admin profile'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role
       AND (
         NEW.role IS NULL
         OR NEW.role = 'pending'
         OR COALESCE(public.staff_role_level(NEW.role), 99) > public.staff_role_level('manager')
       ) THEN
      RAISE EXCEPTION 'Managers cannot assign role %', COALESCE(NEW.role, 'NULL')
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_staff_profile_privilege_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_staff_profile_privilege_columns ON public.staff_profiles;
DROP TRIGGER IF EXISTS aa_guard_staff_profile_privilege_columns ON public.staff_profiles;
CREATE TRIGGER aa_guard_staff_profile_privilege_columns
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_profile_privilege_columns();

DROP POLICY IF EXISTS staff_profiles_update_requires_self_or_manager ON public.staff_profiles;
CREATE POLICY staff_profiles_update_requires_self_or_manager
  ON public.staff_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    OR public.user_role_at_least_org(clerk_org_id, 'manager')
  )
  WITH CHECK (
    clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    OR public.user_role_at_least_org(clerk_org_id, 'manager')
  );

DROP POLICY IF EXISTS staff_profiles_delete_requires_super_admin ON public.staff_profiles;
CREATE POLICY staff_profiles_delete_requires_super_admin
  ON public.staff_profiles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least_org(clerk_org_id, 'super_admin'));

-- ── 3. RESTRICTIVE role gates across hotels & operational tables ──────────────
DROP POLICY IF EXISTS hotels_update_requires_manager ON public.hotels;
CREATE POLICY hotels_update_requires_manager
  ON public.hotels AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(id, 'manager'))
  WITH CHECK (public.user_role_at_least(id, 'manager'));

-- Drop undocumented live-only policy (public funnel uses service_role RPCs).
DROP POLICY IF EXISTS guest_booking_insert ON public.bookings;

DROP POLICY IF EXISTS bookings_insert_requires_front_desk ON public.bookings;
CREATE POLICY bookings_insert_requires_front_desk
  ON public.bookings AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'front_desk'));

DROP POLICY IF EXISTS bookings_update_requires_front_desk ON public.bookings;
CREATE POLICY bookings_update_requires_front_desk
  ON public.bookings AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'front_desk'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'front_desk'));

DROP POLICY IF EXISTS bookings_delete_requires_manager ON public.bookings;
CREATE POLICY bookings_delete_requires_manager
  ON public.bookings AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS room_types_insert_requires_manager ON public.room_types;
CREATE POLICY room_types_insert_requires_manager
  ON public.room_types AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS room_types_update_requires_manager ON public.room_types;
CREATE POLICY room_types_update_requires_manager
  ON public.room_types AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS rooms_insert_requires_manager ON public.rooms;
CREATE POLICY rooms_insert_requires_manager
  ON public.rooms AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS rooms_update_requires_front_desk ON public.rooms;
CREATE POLICY rooms_update_requires_front_desk
  ON public.rooms AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'front_desk'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'front_desk'));

DROP POLICY IF EXISTS guests_insert_requires_front_desk ON public.guests;
CREATE POLICY guests_insert_requires_front_desk
  ON public.guests AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'front_desk'));

DROP POLICY IF EXISTS guests_update_requires_front_desk ON public.guests;
CREATE POLICY guests_update_requires_front_desk
  ON public.guests AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'front_desk'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'front_desk'));

DROP POLICY IF EXISTS availability_blocks_insert_requires_front_desk ON public.availability_blocks;
CREATE POLICY availability_blocks_insert_requires_front_desk
  ON public.availability_blocks AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'front_desk'));

DROP POLICY IF EXISTS availability_blocks_update_requires_front_desk ON public.availability_blocks;
CREATE POLICY availability_blocks_update_requires_front_desk
  ON public.availability_blocks AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'front_desk'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'front_desk'));

DROP POLICY IF EXISTS audit_logs_select_requires_super_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_requires_super_admin
  ON public.audit_logs AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.user_role_at_least(hotel_id, 'super_admin'));

DROP POLICY IF EXISTS audit_logs_insert_requires_front_desk ON public.audit_logs;
CREATE POLICY audit_logs_insert_requires_front_desk
  ON public.audit_logs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'front_desk'));

-- ── 4. Recipient-scoped notifications RLS & immutable payload columns ─────────
CREATE OR REPLACE FUNCTION public.guard_notification_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_jwt_role    text := COALESCE((SELECT auth.jwt()) ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_sub         text := COALESCE((SELECT auth.jwt()) ->> 'sub',  current_setting('request.jwt.claim.sub', true));
  v_invoker_rol text := COALESCE(current_setting('role', true), 'none');
BEGIN
  IF v_jwt_role = 'service_role'
     OR (
       v_invoker_rol IN ('none', 'postgres', 'service_role', 'supabase_admin')
       AND v_jwt_role NOT IN ('authenticated', 'anon')
       AND v_sub IS NULL
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.hotel_id IS DISTINCT FROM OLD.hotel_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by_staff_id IS DISTINCT FROM OLD.created_by_staff_id
     OR NEW.recipient_staff_id IS DISTINCT FROM OLD.recipient_staff_id
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key THEN
    RAISE EXCEPTION 'Client callers may only update notification read or archive state'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_notification_client_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_notification_client_update ON public.notifications;
CREATE TRIGGER trg_guard_notification_client_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_client_update();

DROP POLICY IF EXISTS notifications_org_isolation ON public.notifications;
DROP POLICY IF EXISTS notifications_staff_select ON public.notifications;
DROP POLICY IF EXISTS notifications_staff_update ON public.notifications;

CREATE POLICY notifications_staff_select
  ON public.notifications FOR SELECT TO authenticated
  USING (
    hotel_id IN (SELECT public.get_user_hotel_ids())
    AND (
      recipient_staff_id IS NULL
      OR recipient_staff_id IN (
        SELECT sp.id
          FROM public.staff_profiles sp
         WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
           AND sp.is_active = true
      )
    )
  );

CREATE POLICY notifications_staff_update
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    hotel_id IN (SELECT public.get_user_hotel_ids())
    AND (
      recipient_staff_id IS NULL
      OR recipient_staff_id IN (
        SELECT sp.id
          FROM public.staff_profiles sp
         WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
           AND sp.is_active = true
      )
    )
  )
  WITH CHECK (
    hotel_id IN (SELECT public.get_user_hotel_ids())
    AND (
      recipient_staff_id IS NULL
      OR recipient_staff_id IN (
        SELECT sp.id
          FROM public.staff_profiles sp
         WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
           AND sp.is_active = true
      )
    )
  );

-- ── 5. Fix push_subscriptions cross-tenant hotel_id & is_active + updated_at ─
DROP POLICY IF EXISTS push_subscriptions_self_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_select
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.staff_profiles sp
        JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
       WHERE sp.id = push_subscriptions.staff_id
         AND h.id = push_subscriptions.hotel_id
         AND sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
         AND sp.is_active = true
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_insert
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.staff_profiles sp
        JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
       WHERE sp.id = push_subscriptions.staff_id
         AND h.id = push_subscriptions.hotel_id
         AND sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
         AND sp.is_active = true
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_update ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_update
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.staff_profiles sp
        JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
       WHERE sp.id = push_subscriptions.staff_id
         AND h.id = push_subscriptions.hotel_id
         AND sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
         AND sp.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.staff_profiles sp
        JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
       WHERE sp.id = push_subscriptions.staff_id
         AND h.id = push_subscriptions.hotel_id
         AND sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
         AND sp.is_active = true
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_delete
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.staff_profiles sp
        JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
       WHERE sp.id = push_subscriptions.staff_id
         AND h.id = push_subscriptions.hotel_id
         AND sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
         AND sp.is_active = true
    )
  );

DROP TRIGGER IF EXISTS set_updated_at ON public.push_subscriptions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 6. Optimize business_date_closes_staff_read initplan (0003 advisor fix) ──
DROP POLICY IF EXISTS business_date_closes_staff_read ON public.business_date_closes;
CREATE POLICY business_date_closes_staff_read
  ON public.business_date_closes
  FOR SELECT TO authenticated
  USING (
    public.user_role_at_least(hotel_id, 'read_only')
    AND EXISTS (
      SELECT 1
        FROM public.hotels h
       WHERE h.id = business_date_closes.hotel_id
         AND (
           COALESCE(((SELECT auth.jwt()) ->> 'org_id'), (((SELECT auth.jwt()) -> 'o') ->> 'id')) IS NULL
           OR h.clerk_org_id = COALESCE(((SELECT auth.jwt()) ->> 'org_id'), (((SELECT auth.jwt()) -> 'o') ->> 'id'))
         )
         AND COALESCE(h.status, 'active') = 'active'
    )
  );

-- ── 7. Safe staff/admin FK ON DELETE SET NULL + append-only audit triggers ────
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_created_by_fkey;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.staff_profiles (id)
    ON DELETE SET NULL NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_created_by_fkey;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_recorded_by_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES public.staff_profiles (id)
    ON DELETE SET NULL NOT VALID;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_recorded_by_fkey;

ALTER TABLE public.availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_created_by_fkey;
ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.staff_profiles (id)
    ON DELETE SET NULL NOT VALID;
ALTER TABLE public.availability_blocks VALIDATE CONSTRAINT availability_blocks_created_by_fkey;

ALTER TABLE public.staff_profiles
  DROP CONSTRAINT IF EXISTS staff_profiles_granted_by_fkey;
ALTER TABLE public.staff_profiles
  ADD CONSTRAINT staff_profiles_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES public.staff_profiles (id)
    ON DELETE SET NULL NOT VALID;
ALTER TABLE public.staff_profiles VALIDATE CONSTRAINT staff_profiles_granted_by_fkey;

-- Hotels with audit history cannot be cascade-wiped; staff/admin deletion nulls
-- only the FK pointer while keeping staff_name / admin_email & payload intact.
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_hotel_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_hotel_id_fkey
    FOREIGN KEY (hotel_id) REFERENCES public.hotels (id)
    ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.audit_logs VALIDATE CONSTRAINT audit_logs_hotel_id_fkey;

ALTER TABLE public.platform_admin_audit_logs
  ALTER COLUMN admin_id DROP NOT NULL;

ALTER TABLE public.platform_admin_audit_logs
  DROP CONSTRAINT IF EXISTS platform_admin_audit_logs_admin_id_fkey,
  DROP CONSTRAINT IF EXISTS platform_admin_audit_logs_hotel_id_fkey;

ALTER TABLE public.platform_admin_audit_logs
  ADD CONSTRAINT platform_admin_audit_logs_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES public.platform_admins (id)
    ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT platform_admin_audit_logs_hotel_id_fkey
    FOREIGN KEY (hotel_id) REFERENCES public.hotels (id)
    ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.platform_admin_audit_logs VALIDATE CONSTRAINT platform_admin_audit_logs_admin_id_fkey;
ALTER TABLE public.platform_admin_audit_logs VALIDATE CONSTRAINT platform_admin_audit_logs_hotel_id_fkey;

CREATE OR REPLACE FUNCTION public.prevent_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'Table % is immutable; TRUNCATE is forbidden', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_audit_logs_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Table audit_logs is append-only; DELETE is forbidden'
      USING ERRCODE = '55000';
  END IF;

  -- Permit ONLY the internal RI ON DELETE SET NULL cascade when the parent
  -- staff_profiles row has been deleted in this transaction. Compare real
  -- columns explicitly (STORED generated columns are NULL in NEW during BEFORE triggers).
  IF TG_OP = 'UPDATE'
     AND OLD.staff_id IS NOT NULL
     AND NEW.staff_id IS NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.hotel_id IS NOT DISTINCT FROM OLD.hotel_id
     AND NEW.staff_name IS NOT DISTINCT FROM OLD.staff_name
     AND NEW.action IS NOT DISTINCT FROM OLD.action
     AND NEW.entity_type IS NOT DISTINCT FROM OLD.entity_type
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.before_state IS NOT DISTINCT FROM OLD.before_state
     AND NEW.after_state IS NOT DISTINCT FROM OLD.after_state
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NOT EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.id = OLD.staff_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Table audit_logs is append-only; modifying audit records is forbidden'
    USING ERRCODE = '55000';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_platform_admin_audit_logs_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Table platform_admin_audit_logs is append-only; DELETE is forbidden'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.admin_id IS NOT NULL
     AND NEW.admin_id IS NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.admin_email IS NOT DISTINCT FROM OLD.admin_email
     AND NEW.action IS NOT DISTINCT FROM OLD.action
     AND NEW.hotel_id IS NOT DISTINCT FROM OLD.hotel_id
     AND NEW.entity_type IS NOT DISTINCT FROM OLD.entity_type
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.before_state IS NOT DISTINCT FROM OLD.before_state
     AND NEW.after_state IS NOT DISTINCT FROM OLD.after_state
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NOT EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.id = OLD.admin_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Table platform_admin_audit_logs is append-only; modifying audit records is forbidden'
    USING ERRCODE = '55000';
END;
$fn$;

REVOKE ALL ON FUNCTION public.prevent_truncate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_audit_logs_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_platform_admin_audit_logs_immutability() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_logs_no_modify ON public.audit_logs;
CREATE TRIGGER audit_logs_no_modify
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_logs_immutability();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_truncate();

DROP TRIGGER IF EXISTS platform_admin_audit_logs_no_modify ON public.platform_admin_audit_logs;
CREATE TRIGGER platform_admin_audit_logs_no_modify
  BEFORE UPDATE OR DELETE ON public.platform_admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_platform_admin_audit_logs_immutability();

DROP TRIGGER IF EXISTS platform_admin_audit_logs_no_truncate ON public.platform_admin_audit_logs;
CREATE TRIGGER platform_admin_audit_logs_no_truncate
  BEFORE TRUNCATE ON public.platform_admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_truncate();

DROP TRIGGER IF EXISTS business_date_closes_no_truncate ON public.business_date_closes;
CREATE TRIGGER business_date_closes_no_truncate
  BEFORE TRUNCATE ON public.business_date_closes
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_truncate();

DROP POLICY IF EXISTS "service_role_insert_audit_logs" ON public.platform_admin_audit_logs;

-- ── 8. Bound date-series RPCs & restrict SECURITY DEFINER RPC privileges ──────
CREATE OR REPLACE FUNCTION public.room_type_availability_by_date(
  p_room_type_ids      uuid[],
  p_from               date,
  p_to                 date,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_type_id uuid,
  stay_date    date,
  capacity     integer,
  blocked      integer,
  booked       integer,
  available    integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND (p_to - p_from) > 400 THEN
    RAISE EXCEPTION 'Availability date range cannot exceed 400 nights'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(cardinality(p_room_type_ids), 0) > 100 THEN
    RAISE EXCEPTION 'Cannot query more than 100 room types at once'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH stay_dates AS (
    SELECT (p_from + i)::date AS stay_date
      FROM generate_series(0, (p_to - p_from) - 1) AS i
  ),
  inventory AS (
    SELECT rt.id AS room_type_id,
           (
             SELECT count(*)::integer
               FROM public.rooms r
              WHERE r.room_type_id = rt.id
                AND r.is_active = true
                AND r.status NOT IN ('maintenance', 'out_of_service')
           ) AS capacity
      FROM public.room_types rt
     WHERE rt.id = ANY (p_room_type_ids)
  ),
  nightly AS (
    SELECT
      i.room_type_id,
      d.stay_date,
      i.capacity,
      (
        SELECT count(DISTINCT ab.room_id)::integer
          FROM public.availability_blocks ab
          JOIN public.rooms r ON r.id = ab.room_id
         WHERE r.room_type_id = i.room_type_id
           AND r.is_active = true
           AND r.status NOT IN ('maintenance', 'out_of_service')
           AND ab.start_date <= d.stay_date
           AND ab.end_date > d.stay_date
      ) AS blocked,
      (
        SELECT COALESCE(sum(b.rooms_count), 0)::integer
          FROM public.bookings b
         WHERE b.room_type_id = i.room_type_id
           AND b.status IN ('pending', 'confirmed', 'checked_in')
           AND (p_exclude_booking_id IS NULL OR b.id IS DISTINCT FROM p_exclude_booking_id)
           AND NOT (
                 b.status = 'pending'
             AND b.payment_status = 'unpaid'
             AND b.payment_preference = 'pay_now'
             AND b.source = 'direct'
             AND b.created_at < now() - interval '30 minutes'
           )
           AND b.check_in <= d.stay_date
           AND b.check_out > d.stay_date
      ) AS booked
      FROM inventory i
      CROSS JOIN stay_dates d
  )
  SELECT
    n.room_type_id,
    n.stay_date,
    n.capacity,
    n.blocked,
    n.booked,
    GREATEST(n.capacity - n.blocked - n.booked, 0)::integer AS available
  FROM nightly n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.room_type_available_counts(
  p_room_type_ids uuid[],
  p_from          date,
  p_to            date
)
RETURNS TABLE (
  room_type_id uuid,
  available    integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
#variable_conflict use_variable
DECLARE
  v_jwt_role    text := COALESCE((SELECT auth.jwt()) ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_invoker_rol text := COALESCE(current_setting('role', true), 'none');
BEGIN
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND (p_to - p_from) > 400 THEN
    RAISE EXCEPTION 'Availability date range cannot exceed 400 nights'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(cardinality(p_room_type_ids), 0) > 100 THEN
    RAISE EXCEPTION 'Cannot query more than 100 room types at once'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT rt.id AS room_type_id,
         COALESCE(min(a.available), 0)::integer AS available
    FROM public.room_types rt
    LEFT JOIN public.room_type_availability_by_date(p_room_type_ids, p_from, p_to) a
           ON a.room_type_id = rt.id
   WHERE rt.id = ANY (p_room_type_ids)
     AND (
       NOT (v_jwt_role = 'authenticated' OR v_invoker_rol = 'authenticated')
       OR rt.hotel_id IN (SELECT public.get_user_hotel_ids())
     )
   GROUP BY rt.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_nightly_rates(
  p_hotel_id      uuid,
  p_room_type_ids uuid[],
  p_from          date,
  p_to            date,
  p_rate_plan_id  uuid     DEFAULT NULL,
  p_occupancy     smallint DEFAULT 0
)
RETURNS TABLE (
  room_type_id            uuid,
  rate_plan_id            uuid,
  stay_date               date,
  occupancy               smallint,
  rate_minor              bigint,
  currency                text,
  source                  text,
  seasonal_rate_id        uuid,
  season_name             text,
  is_weekend              boolean,
  active_seasonal_rate_id uuid,
  active_season_name      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND (p_to - p_from) > 405 THEN
    RAISE EXCEPTION 'Rate resolution window cannot exceed 405 nights'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(cardinality(p_room_type_ids), 0) > 100 THEN
    RAISE EXCEPTION 'Cannot resolve rates for more than 100 room types at once'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH nights AS (
    SELECT (p_from + i)::date                         AS stay_date,
           extract(isodow FROM (p_from + i)) IN (5, 6) AS is_weekend
      FROM generate_series(0, (p_to - p_from) - 1) AS i
  ),
  hotel AS (
    SELECT coalesce(h.currency, 'GHS') AS currency
      FROM public.hotels h
     WHERE h.id = p_hotel_id
  ),
  targets AS (
    SELECT rt.id AS room_type_id,
           rt.base_price_minor,
           rt.weekend_price_minor
      FROM public.room_types rt
     WHERE rt.hotel_id = p_hotel_id
       AND rt.id = ANY (p_room_type_ids)
  ),
  plans AS (
    SELECT t.room_type_id,
           plan.id       AS rate_plan_id,
           plan.currency AS currency
      FROM targets t
      LEFT JOIN LATERAL (
        SELECT rp.id, rp.currency
          FROM public.rate_plans rp
         WHERE rp.hotel_id = p_hotel_id
           AND rp.room_type_id = t.room_type_id
           AND (rp.is_active OR rp.id = p_rate_plan_id)
         ORDER BY (rp.id IS NOT DISTINCT FROM p_rate_plan_id) DESC,
                  rp.is_default DESC,
                  rp.created_at,
                  rp.id
         LIMIT 1
      ) plan ON true
  ),
  winning_season AS (
    SELECT DISTINCT ON (n.stay_date)
           n.stay_date,
           sr.id   AS seasonal_rate_id,
           sr.name AS season_name
      FROM nights n
      JOIN public.seasonal_rates sr
        ON sr.hotel_id = p_hotel_id
       AND n.stay_date BETWEEN sr.start_date AND sr.end_date
     ORDER BY n.stay_date,
              sr.priority DESC,
              (sr.end_date - sr.start_date) ASC,
              sr.start_date DESC,
              sr.id
  )
  SELECT
    t.room_type_id,
    p.rate_plan_id,
    n.stay_date,
    coalesce(p_occupancy, 0::smallint) AS occupancy,
    CASE
      WHEN dro.price_minor IS NOT NULL THEN dro.price_minor
      WHEN sro.base_price_minor IS NOT NULL THEN
        CASE WHEN n.is_weekend AND sro.weekend_price_minor IS NOT NULL
             THEN sro.weekend_price_minor
             ELSE sro.base_price_minor
        END
      ELSE
        CASE WHEN n.is_weekend AND t.weekend_price_minor IS NOT NULL
             THEN t.weekend_price_minor
             ELSE t.base_price_minor
        END
    END AS rate_minor,
    coalesce(p.currency, hotel.currency, 'GHS') AS currency,
    CASE
      WHEN dro.price_minor IS NOT NULL      THEN 'daily'
      WHEN sro.base_price_minor IS NOT NULL THEN 'seasonal'
      ELSE 'base'
    END AS source,
    CASE WHEN dro.price_minor IS NULL AND sro.base_price_minor IS NOT NULL
         THEN ws.seasonal_rate_id END AS seasonal_rate_id,
    CASE WHEN dro.price_minor IS NULL AND sro.base_price_minor IS NOT NULL
         THEN ws.season_name END      AS season_name,
    n.is_weekend,
    ws.seasonal_rate_id AS active_seasonal_rate_id,
    ws.season_name      AS active_season_name
  FROM nights n
  CROSS JOIN targets t
  JOIN plans p ON p.room_type_id = t.room_type_id
  LEFT JOIN hotel ON true
  LEFT JOIN winning_season ws ON ws.stay_date = n.stay_date
  LEFT JOIN public.daily_rate_overrides dro
         ON dro.rate_plan_id = p.rate_plan_id
        AND dro.date         = n.stay_date
        AND dro.occupancy    = coalesce(p_occupancy, 0::smallint)
  LEFT JOIN public.seasonal_rate_overrides sro
         ON sro.seasonal_rate_id = ws.seasonal_rate_id
        AND sro.rate_plan_id     = p.rate_plan_id
        AND sro.occupancy        = coalesce(p_occupancy, 0::smallint)
  ORDER BY t.room_type_id, n.stay_date;
END;
$fn$;

-- Public booking routes call these exclusively via supabaseAdmin (service_role);
-- only room_type_available_counts is called by authenticated dashboard clients.
REVOKE ALL ON FUNCTION public.room_type_availability_by_date(uuid[], date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_type_availability_by_date(uuid[], date, date, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.room_type_available_count(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_type_available_count(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.room_type_available_counts(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_type_available_counts(uuid[], date, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint) TO service_role;

REVOKE ALL ON FUNCTION public.room_type_stay_restrictions(uuid, uuid[], date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_type_stay_restrictions(uuid, uuid[], date, date) TO service_role;

REVOKE ALL ON FUNCTION public.stay_restriction_violations(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stay_restriction_violations(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.effective_rate_plan_id(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_rate_plan_id(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.from_minor(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.to_minor(numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.currency_exponent(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hotel_currency(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.from_minor(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.to_minor(numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.currency_exponent(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotel_currency(uuid) TO authenticated, service_role;

-- ── 9. Least-privilege table grants & default ACL parity ─────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM authenticated;

REVOKE INSERT, DELETE ON TABLE public.hotels FROM authenticated;
REVOKE INSERT ON TABLE public.staff_profiles FROM authenticated;
REVOKE INSERT, DELETE ON TABLE public.notifications FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.platform_admins FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.platform_admin_audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.reports_inventory_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.business_date_closes FROM authenticated;

REVOKE ALL ON TABLE public.booking_reference_counters   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notification_delivery_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notification_logs            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_invitations            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.channel_credentials          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ari_sync_outbox              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payment_attempts             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_settings            FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.staff_invitations TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

DO $supabase_admin_defacl$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO service_role;
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  NULL;
END
$supabase_admin_defacl$;

-- ── 10. Versioned storage.objects policies for hotel-assets bucket ───────────
DROP POLICY IF EXISTS hotel_assets_select ON storage.objects;
DROP POLICY IF EXISTS hotel_assets_insert ON storage.objects;
DROP POLICY IF EXISTS hotel_assets_update ON storage.objects;
DROP POLICY IF EXISTS hotel_assets_delete ON storage.objects;

CREATE POLICY hotel_assets_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hotel-assets'
    AND (storage.foldername(name))[1] = 'hotels'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ((storage.foldername(name))[2])::uuid IN (SELECT public.get_user_hotel_ids())
  );

CREATE POLICY hotel_assets_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hotel-assets'
    AND (storage.foldername(name))[1] = 'hotels'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.user_role_at_least(((storage.foldername(name))[2])::uuid, 'manager')
  );

CREATE POLICY hotel_assets_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hotel-assets'
    AND (storage.foldername(name))[1] = 'hotels'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.user_role_at_least(((storage.foldername(name))[2])::uuid, 'manager')
  )
  WITH CHECK (
    bucket_id = 'hotel-assets'
    AND (storage.foldername(name))[1] = 'hotels'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.user_role_at_least(((storage.foldername(name))[2])::uuid, 'manager')
  );

CREATE POLICY hotel_assets_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hotel-assets'
    AND (storage.foldername(name))[1] = 'hotels'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.user_role_at_least(((storage.foldername(name))[2])::uuid, 'manager')
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
