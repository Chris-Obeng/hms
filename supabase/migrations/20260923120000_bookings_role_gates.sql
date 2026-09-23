-- Calendar review 2026-09-23 (H1): bookings had org-isolation RLS only, so any
-- active staff member (including read_only) could UPDATE/DELETE any booking in
-- the org by invoking PostgREST directly. These RESTRICTIVE policies mirror
-- CAPABILITY_MIN_ROLE in lib/roles.ts:
--   UPDATE  ~ calendar:edit / booking:edit  -> front_desk+
--   DELETE  ~ destructive                   -> manager+ (matches rooms/guests)
-- RESTRICTIVE policies AND with the permissive bookings_org_isolation policy.
-- They target `authenticated` only: guest-facing flows run as anon
-- (guest_booking_insert) and payment/webhook writers use the service role,
-- both unaffected. SECURITY DEFINER functions (reprice_booking_stay,
-- record_payment_atomic, ...) run as their owner and bypass RLS as before.

CREATE POLICY bookings_update_requires_front_desk
  ON public.bookings AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text, 'front_desk'::text]))
  WITH CHECK (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text, 'front_desk'::text]));

CREATE POLICY bookings_delete_requires_manager
  ON public.bookings AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

-- Calendar review (M9): bound free-text block fields at the DB layer too, so a
-- direct PostgREST writer cannot store unbounded reason/notes. Caps match the
-- zod schemas in app/dashboard/calendar/actions.ts.
ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_reason_length
  CHECK (char_length(reason) <= 50);

ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_notes_length
  CHECK (notes IS NULL OR char_length(notes) <= 2000);
