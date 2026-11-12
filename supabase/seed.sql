-- =============================================================================
-- Local baseline seed (invoked automatically by `supabase db reset`).
--
-- IMPORTANT:
--   1. Never place production, guest, or credential data in this file.
--   2. Tenant tables (`hotels`, `rooms`, `daily_rate_overrides`,
--      `rate_restrictions`, `ari_sync_outbox`, etc.) are intentionally left
--      empty after `db reset`: transactional regression suites in
--      `supabase/tests/` (notably `rate_retention.sql` and
--      `channel_distribution.sql`) build isolated fixtures inside `BEGIN ...
--      ROLLBACK` blocks and assert exact global counts on an empty database.
--   3. Only global singleton configuration required by the platform boots here.
-- =============================================================================

INSERT INTO public.platform_settings (
  id,
  fee_type,
  fee_percent,
  fee_flat_minor,
  fee_flat_currency
)
VALUES (1, 'percentage', 0, 0, 'GHS')
ON CONFLICT (id) DO NOTHING;
