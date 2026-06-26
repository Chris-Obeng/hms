-- ============================================================================
-- Atomic booking reference generation
--
-- Replaces the application-level read-then-increment pattern (race-prone) with
-- a DB-level counter table + VOLATILE function that increments atomically via
-- INSERT … ON CONFLICT DO UPDATE, making concurrent reference generation safe.
-- ============================================================================

-- Counter table: one row per (hotel_id, year)
CREATE TABLE IF NOT EXISTS public.booking_reference_counters (
  hotel_id   uuid   NOT NULL REFERENCES public.hotels (id) ON DELETE CASCADE,
  year       text   NOT NULL,
  last_seq   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (hotel_id, year)
);

-- ============================================================================
-- generate_booking_reference(p_hotel_id uuid) → text
--
-- Atomically increments the counter for the current year and returns the next
-- reference string in the format HOP-YYYY-NNNNN.
-- VOLATILE + SECURITY DEFINER so it can be called by the service-role client.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_booking_reference(p_hotel_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_year   text   := to_char(now(), 'YYYY');
  v_seq    bigint;
BEGIN
  INSERT INTO public.booking_reference_counters (hotel_id, year, last_seq)
       VALUES (p_hotel_id, v_year, 1)
  ON CONFLICT (hotel_id, year)
    DO UPDATE SET last_seq = booking_reference_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'HOP-' || v_year || '-' || lpad(v_seq::text, 5, '0');
END;
$$;
