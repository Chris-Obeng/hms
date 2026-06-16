-- ============================================================================
-- bookings — CHECK + UNIQUE constraints
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_status_check
    CHECK (status IS NULL OR status IN (
      'pending', 'confirmed', 'checked_in',
      'checked_out', 'cancelled', 'no_show'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_payment_status_check
    CHECK (payment_status IS NULL OR payment_status IN (
      'unpaid', 'partial', 'paid', 'refunded'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_payment_preference_check
    CHECK (payment_preference IS NULL OR payment_preference IN (
      'pay_now', 'pay_at_checkin'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_source_check
    CHECK (source IS NULL OR source IN (
      'direct', 'bookings_com', 'manual', 'phone', 'walk_in'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_reference_unique UNIQUE (reference);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Date sanity: checkout must be on or after checkin
DO $$ BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_dates_valid
    CHECK (check_out >= check_in);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
