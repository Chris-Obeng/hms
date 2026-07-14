-- ============================================================================
-- Update booking reference generation to generate random, non-sequential 13-digit confirmation numbers
--
-- Old format: {PREFIX}-NNNNNN (e.g. GP-000142) which leaks booking volume
-- New format: 13-digit random number (e.g. 2602991889236) as seen on major OTAs
-- ============================================================================

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
  v_ref text;
  v_exists boolean;
BEGIN
  LOOP
    -- Generate a random 13-digit number (1000000000000 to 9999999999999)
    v_ref := (floor(random() * 9000000000000) + 1000000000000)::text;
    
    -- Ensure it is globally unique in the bookings table
    SELECT EXISTS (
      SELECT 1 FROM public.bookings WHERE reference = v_ref
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_ref;
END;
$$;
