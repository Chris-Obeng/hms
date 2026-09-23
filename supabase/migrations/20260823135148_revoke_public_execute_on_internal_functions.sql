-- EXECUTE is granted to PUBLIC by default; revoking individual roles is not
-- enough. Revoke from PUBLIC, then re-grant only where the app legitimately
-- calls the function with that role.
revoke execute on function public.assert_room_type_inventory() from public;
revoke execute on function public.generate_booking_reference(uuid, text) from public;
revoke execute on function public.update_guest_stays_statistics() from public;
revoke execute on function public.check_room_availability(uuid, date, date, uuid) from public;
revoke execute on function public.room_type_available_count(uuid, date, date) from public;
revoke execute on function public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid) from public;

-- Called server-side with an authenticated Clerk JWT (bookings-detail.ts)
grant execute on function public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid) to authenticated;

-- get_user_hotel_ids / get_user_clerk_org_ids intentionally remain PUBLIC:
-- RLS policies evaluate them for every role incl. anon (public booking site).