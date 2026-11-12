-- =============================================================================
-- Retire legacy Arkesel SMS columns from `public.hotels` while preserving all
-- historical SMS/Arkesel delivery audit rows in `public.notification_logs`.
--
-- Historical audit integrity:
--   * ZERO rows are deleted from `public.notification_logs`.
--   * `notification_logs_channel_check` ('sms','email') and
--     `notification_logs_provider_check` ('arkesel','resend') remain validated
--     for historical records.
--   * `notification_logs_channel_email_only` and
--     `notification_logs_provider_resend_only` are added `NOT VALID`, which
--     PostgreSQL enforces on every new INSERT and UPDATE while exempting
--     pre-existing historical SMS audit rows.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Drop legacy Arkesel columns from public.hotels (verified 0 non-blank keys
--    in production and 0 runtime references in application code).
ALTER TABLE public.hotels
  DROP COLUMN IF EXISTS arkesel_api_key,
  DROP COLUMN IF EXISTS arkesel_sender_name;

-- 2. Enforce email/resend on all new notification_logs writes without deleting
--    historical SMS/Arkesel audit records (`NOT VALID` is deliberate here).
ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_channel_email_only,
  DROP CONSTRAINT IF EXISTS notification_logs_provider_resend_only;

ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_channel_email_only
    CHECK (channel = 'email') NOT VALID,
  ADD CONSTRAINT notification_logs_provider_resend_only
    CHECK (provider = 'resend') NOT VALID;

COMMENT ON TABLE public.notification_logs IS
  'Service-role-only. Audit trail of transactional notification attempts. '
  'Historical SMS/Arkesel rows are preserved; new writes are constrained to Resend email via NOT VALID check constraints.';

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'hotels'
       AND column_name IN ('arkesel_api_key', 'arkesel_sender_name')
  ) THEN
    RAISE EXCEPTION 'retire_arkesel guard failed: arkesel columns still exist on public.hotels';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.notification_logs'::regclass
       AND conname = 'notification_logs_channel_email_only'
  ) THEN
    RAISE EXCEPTION 'retire_arkesel guard failed: notification_logs_channel_email_only missing';
  END IF;
END
$guard$;

NOTIFY pgrst, 'reload schema';

COMMIT;
