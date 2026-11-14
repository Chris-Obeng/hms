-- Record who sent a staff invitation, so the invite page can say
-- "Akua Mensah invited you" instead of an anonymous link.
--
-- Nullable: invitations created before this migration have no sender, and the
-- invite page simply omits the line. ON DELETE SET NULL keeps an invitation
-- valid if the sender's staff profile is later removed.
-- Service-role only like the rest of the table (no grant changes needed).

ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS invited_by_staff_id uuid
    REFERENCES public.staff_profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_invitations_invited_by_staff_id_idx
  ON public.staff_invitations (invited_by_staff_id)
  WHERE invited_by_staff_id IS NOT NULL;

COMMENT ON COLUMN public.staff_invitations.invited_by_staff_id IS
  'staff_profiles.id of the sender. Shown on the invite page; NULL for older invitations.';
