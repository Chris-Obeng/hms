-- Backstop: an organization must always keep at least one active super_admin.
--
-- app/actions/staff.ts keeps its friendly count(...) <= 1 pre-check so the UI
-- can surface a clear message, but that pre-check and the write are separate
-- statements: two concurrent demotions or deactivations can each observe two
-- active super admins and both proceed, stranding the org with zero. This
-- trigger is the atomic, race-proof authority and also covers a direct SQL
-- DELETE the server actions never issue.
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
                 or not coalesce(new.is_active, false);
    end if;

    if leaving then
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
