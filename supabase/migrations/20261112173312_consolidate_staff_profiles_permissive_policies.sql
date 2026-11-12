-- =============================================================================
-- Consolidate public.staff_profiles PERMISSIVE policies to one-per-command
-- Resolves Supabase Performance Advisor lint 0006 (multiple_permissive_policies)
-- while preserving self-read for pending/deactivated staff (`HIGH-08`).
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP POLICY IF EXISTS staff_profiles_org_isolation ON public.staff_profiles;
DROP POLICY IF EXISTS staff_profiles_self_select ON public.staff_profiles;
DROP POLICY IF EXISTS staff_profiles_select ON public.staff_profiles;
DROP POLICY IF EXISTS staff_profiles_insert ON public.staff_profiles;
DROP POLICY IF EXISTS staff_profiles_update ON public.staff_profiles;
DROP POLICY IF EXISTS staff_profiles_delete ON public.staff_profiles;

CREATE POLICY staff_profiles_select
  ON public.staff_profiles
  FOR SELECT
  TO authenticated
  USING (
    clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    OR clerk_org_id IN (SELECT public.get_user_clerk_org_ids())
  );

CREATE POLICY staff_profiles_insert
  ON public.staff_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (clerk_org_id IN (SELECT public.get_user_clerk_org_ids()));

CREATE POLICY staff_profiles_update
  ON public.staff_profiles
  FOR UPDATE
  TO authenticated
  USING (
    clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    OR clerk_org_id IN (SELECT public.get_user_clerk_org_ids())
  )
  WITH CHECK (
    clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    OR clerk_org_id IN (SELECT public.get_user_clerk_org_ids())
  );

CREATE POLICY staff_profiles_delete
  ON public.staff_profiles
  FOR DELETE
  TO authenticated
  USING (clerk_org_id IN (SELECT public.get_user_clerk_org_ids()));

COMMIT;
