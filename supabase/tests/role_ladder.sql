-- =============================================================================
-- Regression probe: the SQL role ladder behaves exactly like lib/roles.ts, and
-- the RESTRICTIVE policies that guard writes read through it.
--
-- Run against a database with the migrations applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/role_ladder.sql
--
-- Everything happens inside one transaction that always rolls back, so it is
-- safe against a local stack and leaves no rows behind. Exit code 0 with the
-- PASS notices means the ladder holds; any FAIL raises and aborts, so
-- ON_ERROR_STOP turns a regression into a non-zero exit.
--
-- WHY SQL AND NOT VITEST
-- ----------------------
-- tests/roles.test.ts pins the TypeScript half of the ladder. It cannot see the
-- SQL half: `staff_role_level`, `user_role_level`, `user_role_at_least` and the
-- eighteen RESTRICTIVE policies are the last line of defence when a request
-- reaches Postgres by some route other than a server action. The two files must
-- agree, and both must be updated when ROLE_LEVEL changes.
--
-- TWO THINGS THIS SCRIPT DOES DELIBERATELY
-- ----------------------------------------
-- 1. It sets `request.jwt.claims` by hand. `auth.jwt()` reads exactly that GUC,
--    so setting it is a faithful impersonation of a signed-in staff member; no
--    Clerk token or PostgREST round trip is involved.
--
-- 2. It runs the write attempts as the `authenticated` role, because a
--    superuser bypasses RLS entirely and would make every policy look open. It
--    asserts up front that `authenticated` holds the table, sequence and
--    EXECUTE privileges the dashboard needs, because without them a denied
--    write fails with "permission denied for table" and proves nothing about
--    the policy. Those privileges are declared by
--    `20260831150000_privilege_parity.sql`; asserting instead of granting them
--    means a regression there fails here.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on
\set hA  'a0a0a0a0-0000-4000-8000-00000000000a'
\set hB  'b0b0b0b0-0000-4000-8000-00000000000b'
\set rtA 'a0a0a0a0-0000-4000-8000-0000000000a1'
\set rtB 'b0b0b0b0-0000-4000-8000-0000000000b1'

-- -----------------------------------------------------------------------------
-- 1. The ladder itself. This block is the SQL twin of the ROLE_LEVEL assertions
--    in tests/roles.test.ts: same five roles, same five numbers, in one place.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  expected constant jsonb :=
    '{"pending":0,"read_only":1,"front_desk":2,"manager":3,"super_admin":4}';
  r record;
BEGIN
  FOR r IN SELECT k AS role_name, v::int AS lvl FROM jsonb_each_text(expected) AS t(k, v)
  LOOP
    IF public.staff_role_level(r.role_name) IS DISTINCT FROM r.lvl THEN
      RAISE EXCEPTION 'FAIL ladder: staff_role_level(%) = %, expected %',
        r.role_name, public.staff_role_level(r.role_name), r.lvl;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS staff_role_level matches ROLE_LEVEL in lib/roles.ts';
END $$;

-- A role the ladder does not know must be NULL, not 0. NULL propagates through
-- the >= comparison in user_role_at_least, and a policy treats NULL as "not
-- permitted", so a typo in a future policy fails closed instead of granting
-- everyone the weakest rung.
DO $$
BEGIN
  IF public.staff_role_level('owner') IS NOT NULL
     OR public.staff_role_level('') IS NOT NULL
     OR public.staff_role_level(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL unknown-role: staff_role_level admitted text off the ladder';
  END IF;
  RAISE NOTICE 'PASS unrecognized role text yields NULL, so callers fail closed';
END $$;

-- The ladder is spelled out a third time, in staff_profiles_role_check. A role
-- added to staff_role_level but not to that CHECK could never be stored; one
-- added to the CHECK but not to the ladder would store and then read back as
-- level 0, silently demoting whoever holds it. Both directions are asserted
-- here by writing each rung and by attempting one off-ladder value; the rows are
-- removed again so they cannot perturb the counts later in this script.
DO $$
DECLARE
  ladder constant text[] := ARRAY['pending','read_only','front_desk','manager','super_admin'];
  r text;
  rejected boolean := false;
BEGIN
  FOREACH r IN ARRAY ladder LOOP
    BEGIN
      INSERT INTO public.staff_profiles (clerk_user_id, clerk_org_id, email, role)
      VALUES ('probe_check_' || r, 'org_role_probe_check', r || '@check.test', r);
    EXCEPTION WHEN check_violation THEN
      RAISE EXCEPTION 'FAIL vocabulary: staff_profiles_role_check rejects %, which staff_role_level knows', r;
    END;
  END LOOP;

  BEGIN
    INSERT INTO public.staff_profiles (clerk_user_id, clerk_org_id, email, role)
    VALUES ('probe_check_owner', 'org_role_probe_check', 'owner@check.test', 'owner');
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL vocabulary: staff_profiles accepted role text the ladder does not know';
  END IF;

  DELETE FROM public.staff_profiles WHERE clerk_org_id = 'org_role_probe_check';
  RAISE NOTICE 'PASS staff_profiles_role_check admits exactly the ladder';
END $$;

-- -----------------------------------------------------------------------------
-- 2. Fixture: two hotels in different Clerk orgs, one sellable room each, and
--    seven staff rows covering every interesting shape — the four assignable
--    rungs of the ladder, a deactivated super_admin, a row whose role was never
--    assigned, and a manager belonging to the *other* hotel.
--
--    No rate plan is inserted: the ensure_default_rate_plan trigger on
--    room_types creates the default plan, and the override inserts below leave
--    rate_plan_id NULL so sync_daily_rate_override_minor resolves it — the same
--    path the application takes.
-- -----------------------------------------------------------------------------
INSERT INTO public.hotels (id, slug, name, clerk_org_id) VALUES
  (:'hA', 'role-probe-a', 'Role Probe A', 'org_role_probe_a'),
  (:'hB', 'role-probe-b', 'Role Probe B', 'org_role_probe_b');

INSERT INTO public.room_types (id, hotel_id, name, slug, base_price) VALUES
  (:'rtA', :'hA', 'Standard', 'standard', 100),
  (:'rtB', :'hB', 'Standard', 'standard', 100);

INSERT INTO public.rooms (hotel_id, room_type_id, room_number, status) VALUES
  (:'hA', :'rtA', '101', 'available'),
  (:'hB', :'rtB', '201', 'available');

INSERT INTO public.staff_profiles (clerk_user_id, clerk_org_id, email, role, is_active) VALUES
  ('probe_read_only',  'org_role_probe_a', 'ro@probe.test',    'read_only',   true),
  ('probe_front_desk', 'org_role_probe_a', 'fd@probe.test',    'front_desk',  true),
  ('probe_manager',    'org_role_probe_a', 'mgr@probe.test',   'manager',     true),
  ('probe_super',      'org_role_probe_a', 'super@probe.test', 'super_admin', true),
  -- Deactivated: is_active is a separate gate from the role, and losing it must
  -- drop the caller to level 0 no matter how strong the role text still reads.
  ('probe_stale',      'org_role_probe_a', 'stale@probe.test', 'super_admin', false),
  -- role is nullable and defaults to nothing: an approved-but-unassigned staff
  -- row must read as level 0. staff_profiles_role_check forbids storing role
  -- text off the ladder, so NULL is the only unknown a real row can carry.
  ('probe_norole',     'org_role_probe_a', 'norole@probe.test', NULL,         true),
  ('probe_manager_b',  'org_role_probe_b', 'mgrb@probe.test',  'manager',     true);

-- -----------------------------------------------------------------------------
-- 3. user_role_level under an impersonated JWT. Hotel A is
--    a0a0a0a0-0000-4000-8000-00000000000a; psql does not substitute :variables
--    inside dollar-quoted bodies, so the ids are spelled out below.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  cases constant jsonb := '[
    {"sub": "probe_read_only",  "lvl": 1, "why": "read_only"},
    {"sub": "probe_front_desk", "lvl": 2, "why": "front_desk"},
    {"sub": "probe_manager",    "lvl": 3, "why": "manager"},
    {"sub": "probe_super",      "lvl": 4, "why": "super_admin"},
    {"sub": "probe_stale",      "lvl": 0, "why": "deactivated super_admin"},
    {"sub": "probe_norole",     "lvl": 0, "why": "no role assigned"},
    {"sub": "probe_manager_b",  "lvl": 0, "why": "manager of another hotel"},
    {"sub": "probe_nobody",     "lvl": 0, "why": "no staff profile at all"}
  ]';
  c   jsonb;
  got int;
BEGIN
  FOR c IN SELECT value FROM jsonb_array_elements(cases)
  LOOP
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', c ->> 'sub')::text, true);
    got := public.user_role_level('a0a0a0a0-0000-4000-8000-00000000000a');
    IF got <> (c ->> 'lvl')::int THEN
      RAISE EXCEPTION 'FAIL level(%): got %, expected % (%)',
        c ->> 'sub', got, c ->> 'lvl', c ->> 'why';
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS user_role_level: every rung, plus deactivated, unknown role, wrong hotel and no profile';
END $$;

-- No JWT at all — an unauthenticated request — is level 0, below every
-- capability the app declares.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  IF public.user_role_level('a0a0a0a0-0000-4000-8000-00000000000a') <> 0
     OR public.user_role_at_least('a0a0a0a0-0000-4000-8000-00000000000a', 'read_only') THEN
    RAISE EXCEPTION 'FAIL anonymous: a request with no JWT cleared a role gate';
  END IF;
  RAISE NOTICE 'PASS a request with no JWT is level 0 and clears nothing';
END $$;

-- -----------------------------------------------------------------------------
-- 4. user_role_at_least: monotonic in the ladder, scoped to one hotel, and
--    NULL — never true — when asked for a minimum that is not on the ladder.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  hotel_a constant uuid := 'a0a0a0a0-0000-4000-8000-00000000000a';
  hotel_b constant uuid := 'b0b0b0b0-0000-4000-8000-00000000000b';
  ladder  constant text[] := ARRAY['pending','read_only','front_desk','manager','super_admin'];
  subs    constant text[] := ARRAY['probe_read_only','probe_front_desk','probe_manager','probe_super'];
  levels  constant int[]  := ARRAY[1, 2, 3, 4];
  i       int;
  j       int;
  want    boolean;
  got     boolean;
BEGIN
  FOR i IN 1 .. array_length(subs, 1) LOOP
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', subs[i])::text, true);
    FOR j IN 1 .. array_length(ladder, 1) LOOP
      -- j - 1 is that rung's level: pending is 0, super_admin is 4.
      want := levels[i] >= (j - 1);
      got  := public.user_role_at_least(hotel_a, ladder[j]);
      IF got IS DISTINCT FROM want THEN
        RAISE EXCEPTION 'FAIL at_least: % vs minimum % gave %, expected %',
          subs[i], ladder[j], got, want;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS user_role_at_least is monotonic: every role clears its own rung and everything below it';

  -- The absolute-access guarantee, mirroring the can(HIGHEST_ROLE, …) invariant
  -- in tests/roles.test.ts: a hotel super_admin clears every rung of the ladder.
  PERFORM set_config('request.jwt.claims', '{"sub":"probe_super"}', true);
  FOR j IN 1 .. array_length(ladder, 1) LOOP
    IF NOT public.user_role_at_least(hotel_a, ladder[j]) THEN
      RAISE EXCEPTION 'FAIL absolute-access: super_admin denied minimum %', ladder[j];
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS super_admin clears every rung of the ladder at their own hotel';

  -- ... and only at their own hotel. Tenancy is a separate boundary from role:
  -- being the strongest role at hotel A grants nothing at hotel B.
  IF public.user_role_at_least(hotel_b, 'read_only') THEN
    RAISE EXCEPTION 'FAIL tenancy: super_admin of hotel A cleared a gate at hotel B';
  END IF;
  RAISE NOTICE 'PASS role level is per-hotel: strongest role at A clears nothing at B';

  -- A minimum that is not on the ladder yields NULL, which a policy reads as
  -- "not permitted". Asserting IS NOT TRUE, not = false, is the point.
  PERFORM set_config('request.jwt.claims', '{"sub":"probe_super"}', true);
  IF public.user_role_at_least(hotel_a, 'owner') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL unknown-minimum: comparison against off-ladder text did not yield NULL';
  END IF;
  RAISE NOTICE 'PASS an off-ladder minimum yields NULL, so a mistyped policy denies';
END $$;

-- =============================================================================
-- 5. End to end, through RLS, as the role a real request arrives on.
--
-- Up to here the probe called the predicates directly. That proves the ladder
-- but not the wiring: a policy could be attached to the wrong command, or
-- dropped, and every assertion above would still pass. So the writes below run
-- as `authenticated` with RLS in force.
--
-- Precondition, not a fixture: the privileges below belong to
-- `20260831150000_privilege_parity.sql`, and the probe only checks they are
-- there so a policy denial cannot be confused with a missing grant.
-- =============================================================================
DO $priv$
BEGIN
  IF NOT (has_table_privilege('authenticated', 'public.rooms', 'SELECT')
      AND has_table_privilege('authenticated', 'public.rooms', 'DELETE')
      AND has_table_privilege('authenticated', 'public.daily_rate_overrides', 'SELECT')
      AND has_table_privilege('authenticated', 'public.daily_rate_overrides', 'INSERT')
      AND has_table_privilege('authenticated', 'public.daily_rate_overrides', 'DELETE')
      AND has_sequence_privilege('authenticated', 'public.daily_rate_overrides_id_seq', 'USAGE')
      AND has_function_privilege('authenticated', 'public.get_user_hotel_ids()', 'EXECUTE')
      AND has_function_privilege('authenticated', 'public.user_role_at_least(uuid, text)', 'EXECUTE'))
  THEN
    RAISE EXCEPTION 'authenticated is missing privileges the dashboard needs; see supabase/migrations/20260831150000_privilege_parity.sql';
  END IF;
  RAISE NOTICE 'PASS authenticated holds its table, sequence and EXECUTE privileges before any policy is evaluated';
END
$priv$;

-- Front desk: reads are open, destructive work is not.
SELECT set_config('request.jwt.claims', '{"sub":"probe_front_desk"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.rooms
   WHERE hotel_id = 'a0a0a0a0-0000-4000-8000-00000000000a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL front_desk-read: sees % of its own rooms, expected 1', n;
  END IF;

  DELETE FROM public.rooms
   WHERE hotel_id = 'a0a0a0a0-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL front_desk-delete: removed % room(s); the manager gate is open', n;
  END IF;
  RAISE NOTICE 'PASS front_desk can read rooms but cannot delete one';

  BEGIN
    INSERT INTO public.daily_rate_overrides (hotel_id, room_type_id, date, price)
    VALUES ('a0a0a0a0-0000-4000-8000-00000000000a',
            'a0a0a0a0-0000-4000-8000-0000000000a1', '2026-09-15', 250);
    RAISE EXCEPTION 'FAIL front_desk-override: priced a night without the manager rung';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS front_desk cannot write a daily rate override: %', SQLERRM;
  END;
END $$;

RESET ROLE;

-- Manager: the same statements now succeed, and stop at the tenancy boundary.
SELECT set_config('request.jwt.claims', '{"sub":"probe_manager"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
BEGIN
  INSERT INTO public.daily_rate_overrides (hotel_id, room_type_id, date, price)
  VALUES ('a0a0a0a0-0000-4000-8000-00000000000a',
          'a0a0a0a0-0000-4000-8000-0000000000a1', '2026-09-15', 250);
  RAISE NOTICE 'PASS manager can write a daily rate override';

  -- Hotel B's room is invisible and untouchable: the permissive org-isolation
  -- policy filters it out before the role gate is ever consulted.
  DELETE FROM public.rooms
   WHERE hotel_id = 'b0b0b0b0-0000-4000-8000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL cross-tenant-delete: manager of A removed % room(s) from B', n;
  END IF;
  RAISE NOTICE 'PASS manager of hotel A cannot delete a room belonging to hotel B';

  DELETE FROM public.rooms
   WHERE hotel_id = 'a0a0a0a0-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL manager-delete: removed % room(s), expected 1', n;
  END IF;
  RAISE NOTICE 'PASS manager can delete a room at their own hotel';
END $$;

RESET ROLE;

-- Super admin: admitted by the same predicate, on the same tables. This is the
-- SQL end of the absolute-access guarantee — anything a manager may do, a hotel
-- super_admin may do, because the gate asks for a minimum rung, not a list.
SELECT set_config('request.jwt.claims', '{"sub":"probe_super"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
BEGIN
  INSERT INTO public.daily_rate_overrides (hotel_id, room_type_id, date, price)
  VALUES ('a0a0a0a0-0000-4000-8000-00000000000a',
          'a0a0a0a0-0000-4000-8000-0000000000a1', '2026-09-16', 300);

  DELETE FROM public.daily_rate_overrides
   WHERE hotel_id = 'a0a0a0a0-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL super_admin: deleted % override(s), expected 2', n;
  END IF;
  RAISE NOTICE 'PASS super_admin can write and delete overrides, including a manager''s';
END $$;

RESET ROLE;

-- Deactivated staff: is_active is the kill switch. The role text still reads
-- super_admin, and it buys nothing — not even a read, because org isolation
-- resolves hotels through active profiles only.
SELECT set_config('request.jwt.claims', '{"sub":"probe_stale"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.rooms;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL deactivated-read: sees % room(s), expected 0', n;
  END IF;
  RAISE NOTICE 'PASS a deactivated super_admin sees no rooms at all';
END $$;

RESET ROLE;

-- -----------------------------------------------------------------------------
-- 6. Drift guard on the policies themselves. The migration raises if a
--    RESTRICTIVE policy still calls user_has_staff_role; this asserts the
--    positive form as well, so a policy that is dropped and never recreated —
--    leaving a table with no role gate — is caught here too.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  via_ladder int;
  via_legacy int;
  total      int;
BEGIN
  SELECT count(*) FILTER (WHERE preds LIKE '%user_role_at_least%'),
         count(*) FILTER (WHERE preds LIKE '%user_has_staff_role%'),
         count(*)
    INTO via_ladder, via_legacy, total
    FROM (
      SELECT coalesce(pg_get_expr(p.polqual, p.polrelid), '')
             || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS preds
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND p.polpermissive = false
    ) s;

  IF via_legacy <> 0 THEN
    RAISE EXCEPTION 'FAIL drift: % RESTRICTIVE policy/policies still call user_has_staff_role', via_legacy;
  END IF;
  IF via_ladder <> total THEN
    RAISE EXCEPTION 'FAIL coverage: % of % RESTRICTIVE policies read through the ladder', via_ladder, total;
  END IF;
  IF total < 18 THEN
    RAISE EXCEPTION 'FAIL coverage: only % RESTRICTIVE role gates exist, expected at least 18', total;
  END IF;
  RAISE NOTICE 'PASS all % RESTRICTIVE role gates read through user_role_at_least', total;
END $$;

ROLLBACK;
