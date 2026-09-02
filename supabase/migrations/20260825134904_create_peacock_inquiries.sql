-- Lead capture for The Peacock Mansion showroom site.
-- Namespaced separately from the existing platform schema (hotels/bookings/etc.)
-- so it can be lifted out into its own project later without conflicts.

create table if not exists public.peacock_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  arrival date,
  departure date,
  guests integer not null default 2 check (guests between 1 and 30),
  message text,
  source text not null default 'website',
  status text not null default 'new',
  user_agent text
);

create index if not exists peacock_inquiries_created_at_idx
  on public.peacock_inquiries (created_at desc);

alter table public.peacock_inquiries enable row level security;

drop policy if exists "anon can submit peacock inquiries" on public.peacock_inquiries;
create policy "anon can submit peacock inquiries"
  on public.peacock_inquiries
  for insert
  to anon
  with check (true);

revoke select, update, delete on public.peacock_inquiries from anon, authenticated;