-- Backstop: an organization must always keep at least one active super_admin.
--
-- app/actions/staff.ts keeps its friendly count(...) <= 1 pre-check so the UI
-- can surface a clear message, but that pre-check and the write are separate
-- statements: two concurrent demotions or deactivations can each observe two
-- active super admins and both proceed, stranding the org with zero. This
-- trigger is the race-proof authority and also covers direct SQL the server
-- actions never issue (a DELETE, or moving the row to another org).
--
-- Race-proofing: the count below is a non-locking snapshot read, so under
-- READ COMMITTED it cannot see another transaction's uncommitted demotion of a
-- different row (the two writes touch different rows, so there is no row-lock
-- contention either). A per-org advisory transaction lock serializes guard
-- evaluation for one org: the second transaction blocks on it until the first
-- commits, then re-runs its count against committed data and is rejected.
--
-- Idempotent: create or replace + drop trigger if exists. security definer with
-- an empty search_path and fully-qualified refs, and PUBLIC execute revoked, to
-- match this repo's function-hardening pattern.

create or replace function public.enforce_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  leaving boolean;
  remaining integer;
begin
  if old.role = 'super_admin' and coalesce(old.is_active, false) then
    if tg_op = 'DELETE' then
      leaving := true;
    else
      leaving := (new.role is distinct from 'super_admin')
                 or not coalesce(new.is_active, false)
                 or (new.clerk_org_id is distinct from old.clerk_org_id);
    end if;

    if leaving then
      -- Serialize guard evaluation per org (see header: race-proofing).
      perform pg_advisory_xact_lock(hashtext('staff_super_admin:' || coalesce(old.clerk_org_id, '')));

      select count(*) into remaining
      from public.staff_profiles
      where clerk_org_id = old.clerk_org_id
        and role = 'super_admin'
        and coalesce(is_active, false)
        and id <> old.id;

      if remaining = 0 then
        raise exception 'Cannot remove the last active super admin for this organization'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.enforce_last_super_admin() from public;

drop trigger if exists trg_enforce_last_super_admin on public.staff_profiles;
create trigger trg_enforce_last_super_admin
  before update or delete on public.staff_profiles
  for each row execute function public.enforce_last_super_admin();
