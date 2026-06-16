-- ============================================================================
-- rooms — CHECK + UNIQUE constraints
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.rooms
    ADD CONSTRAINT rooms_status_check
    CHECK (status IS NULL OR status IN (
      'available', 'occupied', 'checkout_pending',
      'maintenance', 'out_of_service', 'cleaning'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.rooms
    ADD CONSTRAINT rooms_hotel_id_room_number_unique
    UNIQUE (hotel_id, room_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
