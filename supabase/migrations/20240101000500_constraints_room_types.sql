-- ============================================================================
-- room_types — CHECK + UNIQUE constraints
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.room_types
    ADD CONSTRAINT room_types_base_price_nonneg
    CHECK (base_price IS NULL OR base_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.room_types
    ADD CONSTRAINT room_types_hotel_id_slug_unique
    UNIQUE (hotel_id, slug);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
