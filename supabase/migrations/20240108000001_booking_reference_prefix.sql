-- ============================================================================
-- Update booking reference format to industry-standard hotel-code style
--
-- Old format: HOP-YYYY-NNNNN  (e.g. HOP-2025-00142)
-- New format: {PREFIX}-NNNNNN  (e.g. GP-000142)
--
-- The prefix is derived from the hotel slug initials (e.g. 'golden-palm' →
-- 'GP', 'sunrise-hotel' → 'SH', max 3 chars). No year embedded.
-- ============================================================================

DROP FUNCTION IF EXISTS public.generate_booking_reference(uuid);

CREATE OR REPLACE FUNCTION public.generate_booking_reference(
  p_hotel_id uuid,
  p_prefix   text DEFAULT 'BK'
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_year text   := to_char(now(), 'YYYY');
  v_seq  bigint;
BEGIN
  INSERT INTO public.booking_reference_counters (hotel_id, year, last_seq)
       VALUES (p_hotel_id, v_year, 1)
  ON CONFLICT (hotel_id, year)
    DO UPDATE SET last_seq = booking_reference_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN upper(p_prefix) || '-' || lpad(v_seq::text, 6, '0');
END;
$$;
