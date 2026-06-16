-- ============================================================================
-- Indexes — FK columns, clerk_user_id/clerk_org_id, JSONB (GIN), partial
-- ============================================================================

-- FK indexes ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_room_types_hotel_id         ON public.room_types(hotel_id);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id              ON public.rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id          ON public.rooms(room_type_id);
CREATE INDEX IF NOT EXISTS idx_guests_hotel_id             ON public.guests(hotel_id);
CREATE INDEX IF NOT EXISTS idx_bookings_hotel_id           ON public.bookings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room_id            ON public.bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room_type_id       ON public.bookings(room_type_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_id           ON public.bookings(guest_id);
CREATE INDEX IF NOT EXISTS idx_payments_hotel_id          ON public.payments(hotel_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id         ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_hotel_id ON public.availability_blocks(hotel_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_room_id  ON public.availability_blocks(room_id);
CREATE INDEX IF NOT EXISTS idx_notifications_hotel_id      ON public.notifications(hotel_id);
CREATE INDEX IF NOT EXISTS idx_notifications_booking_id    ON public.notifications(booking_id);
CREATE INDEX IF NOT EXISTS idx_beds24_mappings_hotel_id    ON public.beds24_property_mappings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_beds24_mappings_room_type_id ON public.beds24_property_mappings(room_type_id);
CREATE INDEX IF NOT EXISTS idx_beds24_sync_log_hotel_id    ON public.beds24_sync_log(hotel_id);
CREATE INDEX IF NOT EXISTS idx_beds24_sync_log_booking_id  ON public.beds24_sync_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_hotel_id         ON public.audit_logs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_id         ON public.audit_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by         ON public.bookings(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by        ON public.payments(recorded_by);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_created_by ON public.availability_blocks(created_by);

-- clerk_user_id / clerk_org_id ---------------------------------------------
-- staff_profiles: idx_staff_profiles_clerk_user_id and idx_staff_profiles_clerk_org_id
-- are created in 20240101000000_refactor_staff_profiles.sql
CREATE INDEX IF NOT EXISTS idx_platform_admins_clerk_user_id ON public.platform_admins(clerk_user_id);

-- hot lookup paths --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_checkin  ON public.bookings(hotel_id, check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_checkout ON public.bookings(hotel_id, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON public.bookings(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_ref      ON public.bookings(reference);
CREATE INDEX IF NOT EXISTS idx_payments_ref      ON public.payments(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_hotels_slug       ON public.hotels(slug);
CREATE INDEX IF NOT EXISTS idx_hotels_status     ON public.hotels(status);
CREATE INDEX IF NOT EXISTS idx_rooms_status      ON public.rooms(hotel_id, status);

-- Guests search
CREATE INDEX IF NOT EXISTS idx_guests_email ON public.guests(hotel_id, email);
CREATE INDEX IF NOT EXISTS idx_guests_phone ON public.guests(hotel_id, phone);
-- Trigram for fuzzy name match (LIKE/ILIKE/%)
CREATE INDEX IF NOT EXISTS idx_guests_full_name_trgm
  ON public.guests USING gin (full_name gin_trgm_ops);

-- Partial indexes ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_active
  ON public.bookings(hotel_id, check_in)
  WHERE status NOT IN ('cancelled', 'checked_out', 'no_show');

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(hotel_id, created_at DESC)
  WHERE is_read = false;

-- GIN on every JSONB column -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hotels_settings_gin
  ON public.hotels USING gin (settings);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_notification_prefs_gin
  ON public.staff_profiles USING gin (notification_prefs);

CREATE INDEX IF NOT EXISTS idx_room_types_amenities_gin
  ON public.room_types USING gin (amenities);
CREATE INDEX IF NOT EXISTS idx_room_types_images_gin
  ON public.room_types USING gin (images);

CREATE INDEX IF NOT EXISTS idx_guests_tags_gin
  ON public.guests USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_payments_metadata_gin
  ON public.payments USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_beds24_sync_log_payload_gin
  ON public.beds24_sync_log USING gin (payload);

CREATE INDEX IF NOT EXISTS idx_audit_logs_before_state_gin
  ON public.audit_logs USING gin (before_state);
CREATE INDEX IF NOT EXISTS idx_audit_logs_after_state_gin
  ON public.audit_logs USING gin (after_state);
