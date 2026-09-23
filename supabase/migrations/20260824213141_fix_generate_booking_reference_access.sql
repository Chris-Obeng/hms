-- ============================================================================
-- Fix: staff dashboard "Failed to generate booking reference"
--
-- 20260713203000 made this function SECURITY INVOKER and revoked EXECUTE from
-- `authenticated`. The staff server action (app/actions/bookings.ts) invokes it
-- with the caller's cookie-scoped JWT client, so every staff-side reservation
-- creation failed with permission denied.
--
-- Resolution:
--   * SECURITY DEFINER so the uniqueness loop can read public.bookings without
--     depending on caller grants. The function takes no free-text SQL input,
--     returns only a random 13-digit number, pins search_path to '' and fully
--     qualifies every object — no privilege-escalation surface.
--   * EXECUTE granted back to `authenticated` (staff dashboards) + service_role.
--     Anon/public callers stay revoked; guest-facing booking API already runs
--     with elevated privileges server-side.
--   * bigint round-trip guarantees a plain decimal string (no float notation).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_booking_reference(
  p_hotel_id uuid,
  p_prefix   text DEFAULT 'BK'
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text;
BEGIN
  LOOP
    -- Random 13-digit number (1000000000000..9999999999999), OTA-style
    v_ref := ((floor(random() * 9000000000000)::bigint) + 1000000000000)::text;

    -- Globally unique across all properties
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.reference = v_ref
    );
  END LOOP;

  RETURN v_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_booking_reference(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_booking_reference(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_booking_reference(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_booking_reference(uuid, text) TO service_role;