-- ============================================================================
-- Fix platform_admins RLS: production-ready, audit-grade security
--
-- Problems being fixed:
--  1. anon role was granted SELECT — must never see admin rows
--  2. Old policy was SELECT-only — app layout uses service-role so this is OK,
--     but the policy must still be tight and explicit
--  3. is_active check was missing from WITH CHECK (INSERT/UPDATE guard)
--  4. Policy name inconsistency across migrations — canonicalise to one policy
--
-- Security model:
--  • anon:          NO access (revoked)
--  • authenticated: Only their own row AND is_active = true (SELECT only via RLS)
--  • service_role:  Full access (bypasses RLS — used by server actions / layout)
--
-- Why authenticated gets SELECT-only (not ALL):
--  Platform admin INSERT/UPDATE/DELETE must go through service_role server actions.
--  Allowing an authenticated Supabase JWT to mutate platform_admins rows via the
--  REST API would be a privilege escalation risk. The layout + server actions use
--  supabaseAdmin (service role) for all writes, so no legitimate code path needs
--  authenticated-role writes on this table.
-- ============================================================================

-- ── 1. Revoke anon access (was granted in 20260702012158) ─────────────────
REVOKE SELECT ON public.platform_admins FROM anon;

-- Keep authenticated SELECT so the RLS policy below can function when the
-- platform client calls .from('platform_admins').select() to confirm own row.
-- (The layout uses supabaseAdmin which bypasses RLS entirely.)
GRANT SELECT ON public.platform_admins TO authenticated;

-- ── 2. Drop ALL existing platform_admins policies (clean slate) ───────────
DROP POLICY IF EXISTS "platform_admins_self_access"  ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_self_read"     ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admin_full_access"    ON public.platform_admins;

-- ── 3. Canonical policy: authenticated user reads only their own active row ──
--
-- Uses (select auth.uid()) pattern (not auth.uid() inline) so Postgres can
-- optimise the call as a stable expression — standard Supabase RLS pattern.
--
-- FOR SELECT only: all writes go through service_role server actions.
-- WITH CHECK is not needed on SELECT-only policies, but is_active in USING
-- ensures inactive admins get zero rows even if they have a valid JWT.
CREATE POLICY "platform_admins_self_read"
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = supabase_user_id
    AND is_active = true
  );

-- ── 4. Ensure RLS is forced even for table owners ─────────────────────────
-- (FORCE ROW LEVEL SECURITY makes RLS apply to the table owner too,
-- preventing accidental bypasses if the table owner role is ever used directly)
ALTER TABLE public.platform_admins FORCE ROW LEVEL SECURITY;
