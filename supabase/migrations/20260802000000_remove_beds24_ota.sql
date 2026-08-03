-- ============================================================================
-- Remove Beds24 / OTA sync from Hotel PMS
--
-- Drops:
--   • beds24_property_mappings table (all indexes + constraints)
--   • beds24_sync_log table (all indexes + constraints)
--   • hotels.beds24_property_id column
--   • hotels.beds24_api_key column
--   • bookings.beds24_booking_id column
--   • ota_conflict notification type from constraint
--   • ota_conflict from staff_profiles.notification_prefs default
--
-- This migration is idempotent: all DROPs use IF EXISTS.
-- ============================================================================

-- ── 1. Drop indexes on beds24_property_mappings ───────────────────────────
DROP INDEX IF EXISTS public.idx_beds24_mappings_hotel_id;
DROP INDEX IF EXISTS public.idx_beds24_mappings_room_type_id;

-- ── 2. Drop beds24_property_mappings table ────────────────────────────────
DROP TABLE IF EXISTS public.beds24_property_mappings CASCADE;

-- ── 3. Drop indexes on beds24_sync_log ───────────────────────────────────
DROP INDEX IF EXISTS public.idx_beds24_sync_log_hotel_id;
DROP INDEX IF EXISTS public.idx_beds24_sync_log_booking_id;
DROP INDEX IF EXISTS public.idx_beds24_sync_log_payload_gin;

-- ── 4. Drop beds24_sync_log table ────────────────────────────────────────
DROP TABLE IF EXISTS public.beds24_sync_log CASCADE;

-- ── 5. Drop beds24 columns from hotels ───────────────────────────────────
ALTER TABLE public.hotels
  DROP COLUMN IF EXISTS beds24_property_id,
  DROP COLUMN IF EXISTS beds24_api_key;

-- ── 6. Drop beds24_booking_id from bookings ──────────────────────────────
ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS beds24_booking_id;

-- ── 7. Remove ota_conflict from notifications type CHECK constraint ───────
-- The constraint must be dropped and recreated without ota_conflict.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IS NULL OR type IN (
    'new_booking', 'booking_cancelled', 'payment_received',
    'payment_failed', 'staff_access_request',
    'check_in_reminder', 'check_out_reminder'
  ));

-- ── 8. Remove ota_conflict from staff_profiles.notification_prefs default ─
-- Drop the column default and re-apply without ota_conflict.
ALTER TABLE public.staff_profiles
  ALTER COLUMN notification_prefs
  SET DEFAULT '{"new_booking":true,"payment_received":true,"cancellation":true}'::jsonb;
