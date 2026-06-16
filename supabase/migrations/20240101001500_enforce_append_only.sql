-- ============================================================================
-- Enforce append-only on audit_logs and beds24_sync_log
--
-- These tables are event/fact records, not mutable state. A row is a
-- record of something that happened, not a thing to be edited. The PRD
-- treats them as immutable.
--
-- The "no updated_at" approach is not enough — anyone with the service
-- role (or a future misconfigured RLS policy) could still mutate the
-- row silently. The Stripe / GitHub / AWS CloudTrail pattern is to
-- actively BLOCK UPDATE and DELETE at the database level.
--
-- "Amendments" to a row are made by inserting a new row that references
-- the original (e.g. a `reverted` audit entry, or a separate `payments`
-- row with method = 'refund').
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Table % is append-only. Create a compensating row instead of modifying % (TG_OP=%)',
    TG_TABLE_NAME, TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- Triggers have no IF NOT EXISTS, so use the drop-then-create pattern.
DROP TRIGGER IF EXISTS audit_logs_no_modify ON public.audit_logs;
CREATE TRIGGER audit_logs_no_modify
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_modification();

DROP TRIGGER IF EXISTS beds24_sync_log_no_modify ON public.beds24_sync_log;
CREATE TRIGGER beds24_sync_log_no_modify
  BEFORE UPDATE OR DELETE ON public.beds24_sync_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_modification();
