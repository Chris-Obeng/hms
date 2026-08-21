-- Actor-aware internal notifications. Legacy rows remain hotel-wide.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_staff_id uuid REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications(hotel_id, recipient_staff_id, archived_at, created_at DESC);

COMMENT ON COLUMN public.notifications.created_by_staff_id IS
  'Staff actor that caused event; excluded from internal delivery for actor-created events.';
