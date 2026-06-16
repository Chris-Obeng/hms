-- ============================================================================
-- updated_at triggers — one per table that has updated_at
-- Triggers have no IF NOT EXISTS, so use DROP + CREATE
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'hotels',
    'staff_profiles',
    'room_types',
    'rooms',
    'guests',
    'bookings'
    -- payments, audit_logs, etc. don't have updated_at in the PRD
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at '
      'BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()',
      t
    );
  END LOOP;
END $$;
