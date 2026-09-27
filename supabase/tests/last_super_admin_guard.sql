-- =============================================================================
-- Regression probe: an organization must always keep at least one active
-- super_admin. app/actions/staff.ts holds a friendly count(...) <= 1 pre-check
-- for UX, but that check and the write are separate statements, so two
-- concurrent demotions/deactivations can each see count = 2 and both proceed.
-- The trg_enforce_last_super_admin trigger closes that race atomically and also
-- covers a direct SQL DELETE the server actions never issue.
--
-- Run against a database with the migrations applied:
--
--   pnpm db:test:superadmin
--
-- Everything happens inside one transaction that always rolls back, so it is
-- safe against a local stack and leaves no rows behind. The blocked operations
-- are wrapped in DO blocks that expect check_violation; if the guard is absent
-- the operation succeeds, the explicit "TEST FAILED" RAISE fires uncaught, and
-- ON_ERROR_STOP turns it into a non-zero exit.
-- =============================================================================

begin;

insert into public.staff_profiles (clerk_org_id, clerk_user_id, email, role, is_active)
values
  ('test_org_guard', 'u_sa1', 'sa1@test.local', 'super_admin', true),
  ('test_org_guard', 'u_sa2', 'sa2@test.local', 'super_admin', true);

-- 1) demoting one of two active super admins succeeds
update public.staff_profiles set role = 'manager'
 where clerk_org_id = 'test_org_guard' and clerk_user_id = 'u_sa1';

-- 2) demoting the now-last active super admin must be blocked
do $$
begin
  update public.staff_profiles set role = 'manager'
   where clerk_org_id = 'test_org_guard' and clerk_user_id = 'u_sa2';
  raise exception 'TEST FAILED: last super admin demotion was allowed';
exception when check_violation then raise notice 'PASS: demotion blocked';
end $$;

-- 3) deactivating the last active super admin must be blocked
do $$
begin
  update public.staff_profiles set is_active = false
   where clerk_org_id = 'test_org_guard' and clerk_user_id = 'u_sa2';
  raise exception 'TEST FAILED: last super admin deactivation was allowed';
exception when check_violation then raise notice 'PASS: deactivation blocked';
end $$;

-- 4) a benign edit to the last super admin must NOT be blocked
update public.staff_profiles set full_name = 'Renamed'
 where clerk_org_id = 'test_org_guard' and clerk_user_id = 'u_sa2';

-- 5) deleting the last active super admin must be blocked
do $$
begin
  delete from public.staff_profiles
   where clerk_org_id = 'test_org_guard' and clerk_user_id = 'u_sa2';
  raise exception 'TEST FAILED: last super admin delete was allowed';
exception when check_violation then raise notice 'PASS: delete blocked';
end $$;

rollback;
