-- Privilege parity: make the migrations the single source of truth for grants.
--
-- Why this migration exists
-- -------------------------
-- The hosted Supabase platform pre-seeds default privileges that the CLI's
-- local Postgres image does not. For objects created by role `postgres` in
-- schema `public`, `pg_default_acl` differs:
--
--            hosted platform                  local CLI image
--   tables   anon/authenticated/service_role   only Dxtm (TRUNCATE,
--            = arwdDxtm (ALL)                  REFERENCES, TRIGGER,
--                                              MAINTAIN) -- no CRUD
--   seqs     = rwU                             only w -- no USAGE
--   funcs    = X (EXECUTE)                     no entry at all
--
-- Consequence: production works on grants no migration declares, while a
-- database rebuilt from this repo (CI, a Supabase dev branch, a new region,
-- every developer's local stack) hands `authenticated` a schema it cannot
-- read, write, or evaluate its own RLS policies against. Two concrete breaks
-- observed locally:
--
--   * `permission denied for function get_user_hotel_ids` on any authenticated
--     query -- 26 RLS policies call that helper. `20260824035531` revoked
--     EXECUTE from PUBLIC on it under the comment "keep EXECUTE for
--     authenticated", but PUBLIC was authenticated's only source of that
--     privilege, so authenticated lost it too. Only an explicit role grant
--     survives a PUBLIC revoke.
--   * `authenticated` has no USAGE on `daily_rate_overrides_id_seq`, so the
--     daily pricing override feature on /availability cannot insert.
--
-- What this migration does NOT change: the deliberate narrowings already
-- declared by earlier migrations, and the deliberate `anon` EXECUTE grants on
-- `resolve_nightly_rates` / `room_type_available_count(s)`. Whether `anon`
-- should hold anything at all is a separate decision -- this app has no anon
-- database path today (both Supabase clients send a Clerk JWT with
-- `role: authenticated`; the public booking site uses the service-role client)
-- -- but narrowing it would change production behaviour, so it stays out.

-- -----------------------------------------------------------------------------
-- 1. Default privileges for objects created later, matching the hosted project
--    so `supabase db push` and a from-scratch rebuild agree.
-- -----------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Functions: EXECUTE for the two identities that call them. `anon` is left out
-- of the default on purpose; the few functions the public path may call are
-- granted to anon explicitly by their own migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Existing tables and sequences.
-- -----------------------------------------------------------------------------

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Re-apply every narrowing an earlier migration declared. The blanket grant
-- above would otherwise silently widen these.

-- Internal counters and the notification outbox are service-role only:
-- 20260703140000 (notification_logs) plus the same intent applied out of band
-- on the hosted project for the other two.
REVOKE ALL ON TABLE public.booking_reference_counters   FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_delivery_outbox FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_logs           FROM anon, authenticated;

-- 20260702115354: platform admin rows are readable by authenticated only.
REVOKE SELECT ON TABLE public.platform_admins FROM anon;

-- 20260831020000: rate plans are dashboard data; anon was excluded there.
REVOKE ALL ON TABLE public.rate_plans FROM anon;

-- -----------------------------------------------------------------------------
-- 3. Functions.
--
-- service_role is the trusted server identity (it also bypasses RLS), and it is
-- what every admin-client RPC runs as, so it gets EXECUTE on this schema's own
-- functions. Extension-owned functions (pg_trgm, btree_gist, pgcrypto) are
-- skipped -- their privileges belong to the extension.
-- -----------------------------------------------------------------------------

DO $grants$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND NOT EXISTS (
             SELECT 1 FROM pg_depend d
              WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END
$grants$;

-- authenticated: the helpers its own RLS policies evaluate, and the two RPCs the
-- dashboard calls through the RLS-bound client.
--
-- `user_role_at_least` is SECURITY DEFINER, so the `user_role_level` and
-- `staff_role_level` calls inside it run as the definer -- authenticated needs
-- EXECUTE on the wrapper only. Trigger functions need no EXECUTE either: a
-- trigger fires as part of the DML the table's own privileges already gate.
GRANT EXECUTE ON FUNCTION public.get_user_hotel_ids()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_clerk_org_ids()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role_at_least(uuid, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_staff_role(uuid, text[])  TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_booking_reference(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)
  TO authenticated;

-- Now that authenticated holds those explicitly, the implicit PUBLIC grant on
-- the role-ladder helpers can go. Order matters: PUBLIC first would have left
-- authenticated with nothing, which is exactly how `20260824035531` broke
-- get_user_hotel_ids.
REVOKE EXECUTE ON FUNCTION public.staff_role_level(text)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_role_level(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_role_at_least(uuid, text)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_staff_role(uuid, text[])     FROM PUBLIC, anon;

-- -----------------------------------------------------------------------------
-- 4. Guard. Fails the migration if the resulting grants cannot serve the app,
--    so a broken rebuild is caught at push time instead of at first request.
-- -----------------------------------------------------------------------------

DO $guard$
DECLARE
  problems text[] := '{}';
  tbl  text;
  verb text;
BEGIN
  -- RLS policy helpers and the RLS-bound RPCs.
  IF NOT has_function_privilege('authenticated', 'public.get_user_hotel_ids()', 'EXECUTE')
     THEN problems := problems || 'authenticated cannot execute get_user_hotel_ids()'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_user_clerk_org_ids()', 'EXECUTE')
     THEN problems := problems || 'authenticated cannot execute get_user_clerk_org_ids()'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.user_role_at_least(uuid, text)', 'EXECUTE')
     THEN problems := problems || 'authenticated cannot execute user_role_at_least()'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.user_has_staff_role(uuid, text[])', 'EXECUTE')
     THEN problems := problems || 'authenticated cannot execute user_has_staff_role()'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.generate_booking_reference(uuid, text)', 'EXECUTE')
     THEN problems := problems || 'authenticated cannot execute generate_booking_reference()'; END IF;
  IF NOT has_function_privilege('authenticated',
        'public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)', 'EXECUTE')
     THEN problems := problems || 'authenticated cannot execute record_payment_atomic()'; END IF;

  -- Table CRUD the dashboard performs through the RLS-bound client.
  -- One call per verb: has_table_privilege() with a comma-separated list is
  -- true when ANY of the listed privileges is held, not all of them.
  FOR tbl IN SELECT unnest(ARRAY['rooms', 'bookings', 'daily_rate_overrides'])
  LOOP
    FOR verb IN SELECT unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
    LOOP
      IF NOT has_table_privilege('authenticated', 'public.' || tbl, verb) THEN
        problems := problems || format('authenticated lacks %s on %s', verb, tbl);
      END IF;
    END LOOP;
  END LOOP;

  -- UUID-backed production tables have no identity sequence; clean replays do.
  IF to_regclass('public.daily_rate_overrides_id_seq') IS NOT NULL
     AND NOT has_sequence_privilege(
       'authenticated',
       'public.daily_rate_overrides_id_seq',
       'USAGE')
     THEN problems := problems || 'authenticated lacks USAGE on daily_rate_overrides_id_seq'; END IF;

  -- service_role runs every admin-client RPC.
  IF NOT has_function_privilege('service_role',
        'public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint)', 'EXECUTE')
     THEN problems := problems || 'service_role cannot execute resolve_nightly_rates()'; END IF;
  IF NOT has_function_privilege('service_role',
        'public.add_online_payment_to_booking(uuid, uuid, numeric)', 'EXECUTE')
     THEN problems := problems || 'service_role cannot execute add_online_payment_to_booking()'; END IF;

  -- Narrowings that must have survived the blanket grant.
  IF has_table_privilege('anon', 'public.platform_admins', 'SELECT')
     THEN problems := problems || 'anon can still select platform_admins'; END IF;
  IF has_table_privilege('authenticated', 'public.notification_logs', 'SELECT')
     THEN problems := problems || 'authenticated can still select notification_logs'; END IF;
  IF has_function_privilege('anon', 'public.user_role_at_least(uuid, text)', 'EXECUTE')
     THEN problems := problems || 'anon can still execute user_role_at_least()'; END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION 'privilege parity guard failed: %', array_to_string(problems, '; ');
  END IF;
END
$guard$;
