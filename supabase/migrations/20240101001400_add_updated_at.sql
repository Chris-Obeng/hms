-- ============================================================================
-- Add updated_at to mutable tables that the PRD forgot
--
-- Per industry standards, every table whose rows can be mutated after
-- creation needs an updated_at column auto-bumped by the
-- handle_updated_at() trigger. The PRD's choice to omit updated_at on
-- payments/notifications/availability_blocks/platform_admins/beds24_property_mappings
-- was a defect, not a feature.
--
-- Truly append-only tables (audit_logs, beds24_sync_log) are handled in
-- 20240101001500_enforce_append_only.sql — they get a BLOCK trigger, not
-- a column.
-- ============================================================================

-- Add column. ADD COLUMN IF NOT EXISTS handles re-runs.
-- DEFAULT now() backfills existing rows with the migration's apply time.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.availability_blocks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.beds24_property_mappings
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Attach set_updated_at trigger to each (triggers have no IF NOT EXISTS,
-- so drop-then-create is the idempotent pattern).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'payments', 'notifications', 'availability_blocks',
    'platform_admins', 'beds24_property_mappings'
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
