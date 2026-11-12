-- =============================================================================
-- Build missing FK/search indexes, reconcile drifted constraint & index names,
-- and drop duplicate pre-migration constraints/indexes and unused speculative
-- JSONB GIN indexes inside a lock-bounded transaction (CLI v2.109.1 compatible).
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ── 1. Build missing FK, composite-FK, unread, and audit search indexes ───────
-- Built before dropping legacy counterparts so readers always have an index.
DROP INDEX IF EXISTS public.idx_notifications_unread;
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications (hotel_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_payment_attempts_hotel_id
  ON public.payment_attempts (hotel_id);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_booking_hotel
  ON public.payment_attempts (booking_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_seasonal_rate_overrides_hotel_id
  ON public.seasonal_rate_overrides (hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_credentials_hotel_id
  ON public.channel_credentials (hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_room_type_mappings_hotel_id
  ON public.channel_room_type_mappings (hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_rate_plan_mappings_hotel_id
  ON public.channel_rate_plan_mappings (hotel_id);

-- Composite FK covering indexes (satisfies both single-column leading probes
-- and composite `(fk_id, hotel_id)` referential integrity checks):
CREATE INDEX IF NOT EXISTS idx_booking_nights_booking_hotel
  ON public.booking_nights (booking_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_payments_booking_hotel
  ON public.payments (booking_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_rooms_room_type_hotel
  ON public.rooms (room_type_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_availability_blocks_room_hotel
  ON public.availability_blocks (room_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_daily_rate_overrides_room_type_hotel
  ON public.daily_rate_overrides (room_type_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_daily_rate_overrides_rate_plan_hotel
  ON public.daily_rate_overrides (rate_plan_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_rate_plans_room_type_hotel
  ON public.rate_plans (room_type_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_rate_restrictions_rate_plan_hotel
  ON public.rate_restrictions (rate_plan_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_seasonal_rate_overrides_room_type_hotel
  ON public.seasonal_rate_overrides (room_type_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_seasonal_rate_overrides_rate_plan_hotel
  ON public.seasonal_rate_overrides (rate_plan_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_seasonal_rate_overrides_season_hotel
  ON public.seasonal_rate_overrides (seasonal_rate_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_credentials_property_hotel
  ON public.channel_credentials (channel_property_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_room_type_mappings_property_hotel
  ON public.channel_room_type_mappings (channel_property_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_room_type_mappings_room_type_hotel
  ON public.channel_room_type_mappings (room_type_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_rate_plan_mappings_property_hotel
  ON public.channel_rate_plan_mappings (channel_property_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_channel_rate_plan_mappings_rate_plan_hotel
  ON public.channel_rate_plan_mappings (rate_plan_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_search_text_trgm
  ON public.audit_logs USING gin (search_text extensions.gin_trgm_ops);

-- ── 2. Drop duplicate legacy constraints (keeping canonical migration names) ─
ALTER TABLE public.hotels
  DROP CONSTRAINT IF EXISTS hotels_slug_key,
  DROP CONSTRAINT IF EXISTS hotels_clerk_org_id_key,
  DROP CONSTRAINT IF EXISTS hotels_custom_domain_key,
  DROP CONSTRAINT IF EXISTS hotels_paystack_subaccount_code_key;

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_hotel_id_room_number_key;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_reference_key,
  DROP CONSTRAINT IF EXISTS bookings_no_room_date_overlap;

ALTER TABLE public.availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_check;

-- Align constraint names where live DB carried pre-migration auto-names:
DO $rename_constraints$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.daily_rate_overrides'::regclass
       AND conname = 'daily_rate_overrides_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.daily_rate_overrides'::regclass
       AND conname = 'unique_room_type_date'
  ) THEN
    ALTER TABLE public.daily_rate_overrides
      RENAME CONSTRAINT daily_rate_overrides_unique TO unique_room_type_date;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.seasonal_rate_overrides'::regclass
       AND conname = 'seasonal_rate_overrides_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.seasonal_rate_overrides'::regclass
       AND conname = 'unique_seasonal_rate_room_type'
  ) THEN
    ALTER TABLE public.seasonal_rate_overrides
      RENAME CONSTRAINT seasonal_rate_overrides_unique TO unique_seasonal_rate_room_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.seasonal_rates'::regclass
       AND conname = 'seasonal_rates_date_order'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.seasonal_rates'::regclass
       AND conname = 'check_start_end_date'
  ) THEN
    ALTER TABLE public.seasonal_rates
      RENAME CONSTRAINT seasonal_rates_date_order TO check_start_end_date;
  END IF;
END
$rename_constraints$;

-- ── 3. Drop duplicate, redundant-prefix, and unused speculative GIN indexes ──
DROP INDEX IF EXISTS public.idx_blocks_room;
DROP INDEX IF EXISTS public.idx_bookings_guest;
DROP INDEX IF EXISTS public.idx_bookings_hotel;
DROP INDEX IF EXISTS public.idx_bookings_room;
DROP INDEX IF EXISTS public.idx_guests_hotel;
DROP INDEX IF EXISTS public.idx_payments_booking;
DROP INDEX IF EXISTS public.idx_payments_hotel;
DROP INDEX IF EXISTS public.idx_room_types_hotel;
DROP INDEX IF EXISTS public.idx_rooms_hotel;
DROP INDEX IF EXISTS public.idx_rooms_type;
DROP INDEX IF EXISTS public.idx_staff_clerk;

-- Covered by unique constraints or the strictly wider `(fk_id, hotel_id)` / composite indexes above:
DROP INDEX IF EXISTS public.idx_hotels_slug;
DROP INDEX IF EXISTS public.idx_bookings_ref;
DROP INDEX IF EXISTS public.idx_platform_admins_email;
DROP INDEX IF EXISTS public.idx_platform_admins_supabase_user_id;
DROP INDEX IF EXISTS public.booking_nights_booking_idx;
DROP INDEX IF EXISTS public.idx_payments_booking_id;
DROP INDEX IF EXISTS public.idx_rooms_room_type_id;
DROP INDEX IF EXISTS public.idx_availability_blocks_room_id;
DROP INDEX IF EXISTS public.idx_daily_rate_overrides_room_type_id;
DROP INDEX IF EXISTS public.idx_rate_plans_room_type_id;
DROP INDEX IF EXISTS public.idx_seasonal_rate_overrides_room_type_id;
DROP INDEX IF EXISTS public.idx_seasonal_rate_overrides_seasonal_id;
DROP INDEX IF EXISTS public.idx_seasonal_rate_overrides_seasonal_rate_id;
DROP INDEX IF EXISTS public.idx_channel_room_type_mappings_room_type;
DROP INDEX IF EXISTS public.idx_channel_rate_plan_mappings_rate_plan;
DROP INDEX IF EXISTS public.idx_audit_hotel;
DROP INDEX IF EXISTS public.idx_audit_logs_hotel_id;
DROP INDEX IF EXISTS public.idx_notifications_hotel;
DROP INDEX IF EXISTS public.idx_notifications_hotel_id;
DROP INDEX IF EXISTS public.idx_daily_rate_overrides_room_type_date;
DROP INDEX IF EXISTS public.idx_daily_rate_overrides_lookup;

-- Speculative JSONB GIN indexes with zero query consumers:
DROP INDEX IF EXISTS public.idx_hotels_settings_gin;
DROP INDEX IF EXISTS public.idx_staff_profiles_notification_prefs_gin;
DROP INDEX IF EXISTS public.idx_room_types_amenities_gin;
DROP INDEX IF EXISTS public.idx_room_types_images_gin;
DROP INDEX IF EXISTS public.idx_guests_tags_gin;
DROP INDEX IF EXISTS public.idx_payments_metadata_gin;
DROP INDEX IF EXISTS public.idx_audit_logs_before_state_gin;
DROP INDEX IF EXISTS public.idx_audit_logs_after_state_gin;

COMMIT;
