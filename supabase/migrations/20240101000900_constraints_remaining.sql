-- ============================================================================
-- availability_blocks, notifications, beds24_*, audit_logs, platform_admins
-- ============================================================================

-- availability_blocks ------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE public.availability_blocks
    ADD CONSTRAINT availability_blocks_reason_check
    CHECK (reason IS NULL OR reason IN (
      'maintenance', 'deep_cleaning', 'owner_use', 'renovation', 'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.availability_blocks
    ADD CONSTRAINT availability_blocks_dates_valid
    CHECK (end_date > start_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- notifications ------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IS NULL OR type IN (
      'new_booking', 'booking_cancelled', 'payment_received',
      'payment_failed', 'ota_conflict', 'staff_access_request',
      'check_in_reminder', 'check_out_reminder'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- beds24_property_mappings -------------------------------------------------

DO $$ BEGIN
  ALTER TABLE public.beds24_property_mappings
    ADD CONSTRAINT beds24_property_mappings_unique
    UNIQUE (hotel_id, beds24_room_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- beds24_sync_log ----------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE public.beds24_sync_log
    ADD CONSTRAINT beds24_sync_log_direction_check
    CHECK (direction IS NULL OR direction IN ('inbound', 'outbound'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.beds24_sync_log
    ADD CONSTRAINT beds24_sync_log_status_check
    CHECK (status IS NULL OR status IN ('success', 'conflict', 'error', 'ignored'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- platform_admins ----------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE public.platform_admins
    ADD CONSTRAINT platform_admins_role_check
    CHECK (role IS NULL OR role IN ('super_admin', 'admin', 'support'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.platform_admins
    ADD CONSTRAINT platform_admins_clerk_user_id_unique UNIQUE (clerk_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
