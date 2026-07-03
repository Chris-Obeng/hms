-- ============================================================================
-- migration: 20260703140000_notification_logs_access_control.sql
--
-- Purpose: Harden notification_logs access so it is truly service-role-only.
--
-- Context:
--   notification_logs was created with RLS disabled (intentional — the table
--   is written and read exclusively by server-side code via supabaseAdmin, which
--   uses the SUPABASE_SERVICE_ROLE_KEY and bypasses RLS entirely).
--
--   However, "RLS disabled" with no explicit REVOKE means the anon and
--   authenticated roles can still SELECT/INSERT if they know the table name
--   and have the publishable (anon) key. This migration adds explicit REVOKE
--   grants so that even if someone constructs a direct PostgREST request with
--   the publishable key, they get a permission-denied error at the Postgres
--   privilege layer — before the query even reaches any RLS check.
--
-- Result: notification_logs is only accessible to the service_role.
--         All hotel staff operations go through server actions → supabaseAdmin.
--         No hotel staff can read their own notification logs via the client SDK
--         (they see notification status in the dashboard UI, not raw DB rows).
-- ============================================================================

-- Revoke all privileges from unprivileged roles on notification_logs.
-- service_role retains full access (it is the owner-equivalent in Supabase).
REVOKE ALL ON TABLE public.notification_logs FROM anon;
REVOKE ALL ON TABLE public.notification_logs FROM authenticated;

-- Belt-and-suspenders: also disable RLS explicitly (idempotent — already disabled,
-- but this makes the intent crystal-clear to future developers reading migrations).
ALTER TABLE public.notification_logs DISABLE ROW LEVEL SECURITY;

-- Add a comment documenting the access model so it survives a schema dump.
COMMENT ON TABLE public.notification_logs IS
  'Service-role-only. Records every transactional notification attempt. '
  'Accessible only via supabaseAdmin (SUPABASE_SERVICE_ROLE_KEY). '
  'anon and authenticated roles have no privileges — enforced via REVOKE. '
  'Do not enable RLS or grant to authenticated without re-reviewing the data model.';
