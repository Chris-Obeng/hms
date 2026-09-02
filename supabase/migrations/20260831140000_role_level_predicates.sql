-- =============================================================================
-- Role ladder predicates for RLS, mirroring lib/roles.ts.
--
-- WHY
-- ---
-- Eighteen RESTRICTIVE policies each spelled out `ARRAY['super_admin',
-- 'manager']`. That is the role ladder restated eighteen times: adding a role
-- between `manager` and `super_admin`, or renaming one, means editing eighteen
-- predicates and silently mis-authorizing whichever one is missed. The same
-- duplication existed in TypeScript and is now gone — `lib/roles.ts` holds
-- `ROLE_LEVEL` plus a capability map, and call sites ask `can(role, capability)`.
--
-- This migration gives SQL the same shape. The ladder is declared once, in
-- `public.staff_role_level`, and every policy asks for a minimum level instead
-- of enumerating the roles above it.
--
-- BEHAVIOUR CHANGE: none. `user_role_at_least(hotel_id, 'manager')` admits
-- exactly {manager, super_admin} for an active staff member of that hotel, which
-- is the set `user_has_staff_role(hotel_id, ARRAY['super_admin','manager'])`
-- already admitted. The policies are recreated, not loosened.
--
-- KEEP IN STEP with `ROLE_LEVEL` in lib/roles.ts. `tests/roles.test.ts` pins the
-- TypeScript side; `supabase/tests/role_ladder.sql` pins this side.
--
-- ON EXECUTE PRIVILEGE
-- --------------------
-- These are called from RLS policy expressions, which are evaluated with the
-- privileges of the querying role. `authenticated` therefore needs EXECUTE, and
-- it has it through the default PUBLIC grant. The house pattern of
-- `REVOKE EXECUTE ... FROM anon, authenticated` on such a function is a no-op —
-- it removes a grant those roles never held directly (pg_proc.proacl reads
-- `{=X/postgres,...}`, i.e. PUBLIC) — so it is not repeated here. Revoking from
-- PUBLIC instead would make every destructive statement fail with "permission
-- denied for function" rather than deny cleanly, so it must not be done.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The ladder itself. Unknown role text returns NULL, not 0, so a typo in a
--    policy or a role added to the app but not here fails closed: comparing
--    against NULL yields NULL, and a policy treats NULL as "not permitted".
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_role_level(p_role text)
RETURNS int
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, extensions
AS $function$
  SELECT CASE p_role
    WHEN 'pending'     THEN 0
    WHEN 'read_only'   THEN 1
    WHEN 'front_desk'  THEN 2
    WHEN 'manager'     THEN 3
    WHEN 'super_admin' THEN 4
  END
$function$;

COMMENT ON FUNCTION public.staff_role_level(text) IS
  'Staff role ladder, weakest (0) to strongest. Mirrors ROLE_LEVEL in lib/roles.ts. NULL for unrecognized role text so callers fail closed.';

-- -----------------------------------------------------------------------------
-- 2. The caller's level at one hotel. SECURITY DEFINER because it reads
--    staff_profiles, which is itself RLS-protected; STABLE because it depends on
--    the JWT and on rows that do not change inside a statement.
--
--    `max()` over an aggregate always yields exactly one row, so this never
--    returns NULL: a caller with no active profile at that hotel is level 0,
--    which is below every capability the app declares.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_role_level(p_hotel_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
  SELECT coalesce(max(public.staff_role_level(sp.role::text)), 0)
    FROM public.staff_profiles sp
    JOIN public.hotels h ON h.clerk_org_id = sp.clerk_org_id
   WHERE sp.clerk_user_id = auth.jwt() ->> 'sub'
     AND sp.is_active = true
     AND h.id = p_hotel_id
$function$;

COMMENT ON FUNCTION public.user_role_level(uuid) IS
  'Role level of the JWT caller at the given hotel, 0 when they have no active staff profile there.';

-- -----------------------------------------------------------------------------
-- 3. The predicate the policies use. Returns NULL — never true — when
--    p_min_role is not a role on the ladder.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_role_at_least(p_hotel_id uuid, p_min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
  SELECT public.user_role_level(p_hotel_id) >= public.staff_role_level(p_min_role)
$function$;

COMMENT ON FUNCTION public.user_role_at_least(uuid, text) IS
  'True when the JWT caller is an active staff member of the hotel at or above p_min_role. The single role gate for RESTRICTIVE policies; mirrors can() in lib/roles.ts.';

-- `user_has_staff_role` stays defined. Nothing in this repo calls it after this
-- migration, but a policy created outside these files could, and a failed DROP
-- would abort the whole migration. It is superseded, not removed.
COMMENT ON FUNCTION public.user_has_staff_role(uuid, text[]) IS
  'Superseded by public.user_role_at_least(uuid, text). Retained only so that any policy created outside supabase/migrations keeps working; do not use in new policies.';

-- =============================================================================
-- 4. Repoint every RESTRICTIVE role gate at the ladder predicate.
--
-- Each block is DROP IF EXISTS + CREATE so the migration is idempotent and so a
-- database rebuilt from migrations alone lands on the same set. Reads stay open
-- to all staff of the hotel — the front desk has to quote a price and see a
-- payment to take a booking — so only INSERT/UPDATE/DELETE are gated.
-- =============================================================================

-- Destructive operations on inventory, guests and payments (was
-- 20260824150411_harden_rls_role_gates_and_payment_attribution.sql) ------------
DROP POLICY IF EXISTS rooms_destructive_requires_manager ON public.rooms;
CREATE POLICY rooms_destructive_requires_manager
  ON public.rooms AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS room_types_destructive_requires_manager ON public.room_types;
CREATE POLICY room_types_destructive_requires_manager
  ON public.room_types AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS guests_destructive_requires_manager ON public.guests;
CREATE POLICY guests_destructive_requires_manager
  ON public.guests AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS availability_blocks_destructive_requires_manager ON public.availability_blocks;
CREATE POLICY availability_blocks_destructive_requires_manager
  ON public.availability_blocks AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS payments_delete_requires_manager ON public.payments;
CREATE POLICY payments_delete_requires_manager
  ON public.payments AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS payments_direct_update_requires_manager ON public.payments;
CREATE POLICY payments_direct_update_requires_manager
  ON public.payments AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

-- rate_plans (was 20260831020000_rate_plans.sql) -------------------------------
DROP POLICY IF EXISTS rate_plans_insert_requires_manager ON public.rate_plans;
CREATE POLICY rate_plans_insert_requires_manager
  ON public.rate_plans AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS rate_plans_update_requires_manager ON public.rate_plans;
CREATE POLICY rate_plans_update_requires_manager
  ON public.rate_plans AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS rate_plans_delete_requires_manager ON public.rate_plans;
CREATE POLICY rate_plans_delete_requires_manager
  ON public.rate_plans AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

-- seasonal_rates (was 20260830163000_reconcile_rate_table_drift.sql) -----------
DROP POLICY IF EXISTS seasonal_rates_insert_requires_manager ON public.seasonal_rates;
CREATE POLICY seasonal_rates_insert_requires_manager
  ON public.seasonal_rates AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS seasonal_rates_update_requires_manager ON public.seasonal_rates;
CREATE POLICY seasonal_rates_update_requires_manager
  ON public.seasonal_rates AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS seasonal_rates_delete_requires_manager ON public.seasonal_rates;
CREATE POLICY seasonal_rates_delete_requires_manager
  ON public.seasonal_rates AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

-- daily_rate_overrides ---------------------------------------------------------
DROP POLICY IF EXISTS daily_rate_overrides_insert_requires_manager ON public.daily_rate_overrides;
CREATE POLICY daily_rate_overrides_insert_requires_manager
  ON public.daily_rate_overrides AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS daily_rate_overrides_update_requires_manager ON public.daily_rate_overrides;
CREATE POLICY daily_rate_overrides_update_requires_manager
  ON public.daily_rate_overrides AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS daily_rate_overrides_delete_requires_manager ON public.daily_rate_overrides;
CREATE POLICY daily_rate_overrides_delete_requires_manager
  ON public.daily_rate_overrides AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

-- seasonal_rate_overrides. No hotel_id column, so the owning hotel is reached
-- through the parent season — the same indirection its permissive policies use.
DROP POLICY IF EXISTS seasonal_rate_overrides_insert_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_insert_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role_at_least(
      (SELECT sr.hotel_id FROM public.seasonal_rates sr WHERE sr.id = seasonal_rate_id),
      'manager'
    )
  );

DROP POLICY IF EXISTS seasonal_rate_overrides_update_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_update_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.user_role_at_least(
      (SELECT sr.hotel_id FROM public.seasonal_rates sr WHERE sr.id = seasonal_rate_id),
      'manager'
    )
  )
  WITH CHECK (
    public.user_role_at_least(
      (SELECT sr.hotel_id FROM public.seasonal_rates sr WHERE sr.id = seasonal_rate_id),
      'manager'
    )
  );

DROP POLICY IF EXISTS seasonal_rate_overrides_delete_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_delete_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    public.user_role_at_least(
      (SELECT sr.hotel_id FROM public.seasonal_rates sr WHERE sr.id = seasonal_rate_id),
      'manager'
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Guard: every RESTRICTIVE role gate must now read through the ladder. If a
--    later migration adds one that spells out an ARRAY of roles again, this
--    raises at apply time instead of drifting quietly.
-- -----------------------------------------------------------------------------
DO $guard$
DECLARE
  stragglers text;
BEGIN
  SELECT string_agg(format('%s.%s', c.relname, p.polname), ', ' ORDER BY c.relname, p.polname)
    INTO stragglers
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND p.polpermissive = false
     AND (
       pg_get_expr(p.polqual, p.polrelid)      LIKE '%user_has_staff_role%'
       OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%user_has_staff_role%'
     );

  IF stragglers IS NOT NULL THEN
    RAISE EXCEPTION 'RESTRICTIVE policies still call user_has_staff_role: %', stragglers;
  END IF;
END $guard$;




