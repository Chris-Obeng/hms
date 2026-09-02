-- ── Security hardening (advisor remediation) ────────────────────────────

-- 1. booking_reference_counters: internal sequence table, only touched by
--    SECURITY DEFINER generate_booking_reference(). Deny client roles.
alter table public.booking_reference_counters enable row level security;
revoke all on public.booking_reference_counters from anon;
revoke all on public.booking_reference_counters from authenticated;

-- 2. Pin search_path on public functions (blocks search_path hijacking).
--    'public, extensions' keeps unqualified references working while the
--    path is no longer role-mutable. Safe: anon/authenticated cannot CREATE
--    in public on this project (verified).
alter function public.handle_updated_at() set search_path = 'public, extensions';
alter function public.prevent_modification() set search_path = 'public, extensions';
alter function public.get_user_hotel_ids() set search_path = 'public, extensions';
alter function public.get_user_clerk_org_ids() set search_path = 'public, extensions';
alter function public.update_guest_stays_statistics() set search_path = 'public, extensions';
alter function public.generate_booking_reference(uuid, text) set search_path = 'public, extensions';
alter function public.check_room_availability(uuid, date, date, uuid) set search_path = 'public, extensions';
alter function public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid) set search_path = 'public, extensions';
alter function public.assert_room_type_inventory() set search_path = 'public, extensions';
alter function public.room_type_available_count(uuid, date, date) set search_path = 'public, extensions';

-- 3. Restrict EXECUTE on SECURITY DEFINER helpers that are never called by
--    clients directly (verified against codebase rpc usage).
revoke execute on function public.assert_room_type_inventory() from anon, authenticated;
revoke execute on function public.generate_booking_reference(uuid, text) from anon, authenticated;
revoke execute on function public.update_guest_stays_statistics() from anon, authenticated;
revoke execute on function public.check_room_availability(uuid, date, date, uuid) from anon, authenticated;
revoke execute on function public.room_type_available_count(uuid, date, date) from anon, authenticated;
-- record_payment_atomic is invoked with an authenticated user JWT server-side:
revoke execute on function public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid) from anon;

-- 4. get_user_hotel_ids / get_user_clerk_org_ids stay executable by anon +
--    authenticated intentionally: RLS policies on hotels/rooms/bookings/etc.
--    evaluate them for every role, including the public booking site.

-- 5. Performance advisor: index FK columns used for lookups/cleanup.
create index if not exists idx_notification_delivery_outbox_recipient
  on public.notification_delivery_outbox (recipient_staff_id);
create index if not exists idx_notifications_created_by_staff
  on public.notifications (created_by_staff_id);
create index if not exists idx_notifications_recipient_staff
  on public.notifications (recipient_staff_id);