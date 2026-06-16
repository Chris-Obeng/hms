-- ============================================================================
-- staff_profiles — CHECK constraint
-- Note: UNIQUE (clerk_user_id, clerk_org_id) and the clerk_org_id column
-- itself are already in 20240101000000_refactor_staff_profiles.sql
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.staff_profiles
    ADD CONSTRAINT staff_profiles_role_check
    CHECK (role IS NULL OR role IN (
      'pending', 'super_admin', 'manager', 'front_desk', 'read_only'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure notification_prefs is JSONB with sane default (defensive)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_profiles'
      AND column_name = 'notification_prefs' AND column_default IS NULL
  ) THEN
    ALTER TABLE public.staff_profiles
      ALTER COLUMN notification_prefs SET DEFAULT '{
        "new_booking": true,
        "payment_received": true,
        "cancellation": true,
        "ota_conflict": true
      }'::jsonb;
  END IF;
END $$;
