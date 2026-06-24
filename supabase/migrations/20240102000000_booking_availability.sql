-- ============================================================================
-- Booking availability safety net
--
-- 1. btree_gist extension for EXCLUDE constraints
-- 2. check_room_availability() function — efficient overlap query
-- 3. bookings_no_room_overlap EXCLUDE constraint — DB-level no-double-booking
-- 4. Verify no existing overlaps before applying constraint
--
-- Convention: [check_in, check_out) — same-day checkout+checkin is allowed
-- because a guest checking out at 11:00 doesn't conflict with a guest
-- checking in at 14:00.
-- ============================================================================

-- 1. Enable btree_gist -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Helper function: check if a room is available for a date range ----------
-- Returns a table of conflicting bookings (empty = available).
-- The exclude_booking_id parameter lets you exclude the booking being edited
-- (e.g., when resizing or moving an existing booking).
--
-- SECURITY DEFINER to bypass RLS (called from server actions that already
-- verify auth + hotel_id, but the function itself needs to read bookings
-- across the overlap window without RLS blocking). Scoped to the caller's
-- hotel via rooms.hotel_id + auth.jwt() to prevent cross-tenant leakage.
CREATE OR REPLACE FUNCTION public.check_room_availability(
  p_room_id        uuid,
  p_check_in       date,
  p_check_out      date,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE (
  booking_id    uuid,
  reference     text,
  guest_name    text,
  check_in      date,
  check_out     date,
  status        text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    b.id AS booking_id,
    b.reference,
    g.full_name AS guest_name,
    b.check_in,
    b.check_out,
    b.status
  FROM public.bookings b
  JOIN public.rooms r ON r.id = b.room_id
  JOIN public.hotels h ON h.id = r.hotel_id
  LEFT JOIN public.guests g ON g.id = b.guest_id
  WHERE b.room_id = p_room_id
    AND h.id IN (SELECT get_user_hotel_ids())
    AND b.status IN ('pending', 'confirmed', 'checked_in')
    AND b.check_in < p_check_out
    AND b.check_out > p_check_in
    AND (p_exclude_booking_id IS NULL OR b.id != p_exclude_booking_id)
  ORDER BY b.check_in, b.check_out;
$$;

COMMENT ON FUNCTION public.check_room_availability IS
  'Returns conflicting active bookings for a room over [p_check_in, p_check_out). Scoped to caller hotel via auth.jwt().';

-- 3. Verify no existing overlapping bookings before adding constraint -------
-- This safety check runs in a DO block so it doesn't abort migration on zero rows.
DO $$
DECLARE
  overlap_count integer;
BEGIN
  SELECT count(*) INTO overlap_count
  FROM (
    SELECT b1.id
    FROM public.bookings b1
    JOIN public.bookings b2 ON b1.room_id = b2.room_id
      AND b1.id < b2.id
      AND b1.status IN ('pending', 'confirmed', 'checked_in')
      AND b2.status IN ('pending', 'confirmed', 'checked_in')
      AND b1.check_in < b2.check_out
      AND b2.check_in < b1.check_out
  ) "overlaps";

  IF overlap_count > 0 THEN
    RAISE NOTICE 'Found % existing overlapping booking pair(s). These must be resolved before the exclusion constraint can be applied.', overlap_count;
    RAISE NOTICE 'Query to find overlaps: SELECT * FROM check_room_availability(room_id, check_in, check_out);';
    -- Do NOT add the constraint — let the developer resolve overlaps first.
  ELSE
    -- 4. Add the exclusion constraint ------------------------------------------
    -- Active assigned bookings for a room may not overlap on [check_in, check_out).
    -- Unassigned (room_id NULL), cancelled, checked_out, no_show are exempt
    -- because NULLs never match in a GiST EXCLUDE, and the WHERE clause filters
    -- out non-active statuses.
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_room_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        daterange(check_in, check_out, '[)') WITH &&
      ) WHERE (
        room_id IS NOT NULL
        AND status IN ('pending', 'confirmed', 'checked_in')
      );

    RAISE NOTICE 'bookings_no_room_overlap constraint applied successfully.';
  END IF;
END $$;

-- 5. Helper function: check if a room type has capacity for a date range ------
-- Returns the count of available rooms (not booked) for a given room type.
-- Used for unassigned bookings where only room_type_id is set.
-- Scoped to caller's hotel via auth.jwt() for defense in depth.
CREATE OR REPLACE FUNCTION public.room_type_available_count(
  p_room_type_id uuid,
  p_check_in    date,
  p_check_out   date
)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    (SELECT count(*) FROM public.rooms r
     JOIN public.hotels h ON h.id = r.hotel_id
     WHERE r.room_type_id = p_room_type_id
       AND h.id IN (SELECT get_user_hotel_ids())
       AND r.is_active = true
       AND r.status NOT IN ('maintenance', 'out_of_service'))
    -
    (SELECT count(DISTINCT b.room_id) FROM public.bookings b
     JOIN public.rooms r ON r.id = b.room_id
     JOIN public.hotels h ON h.id = r.hotel_id
     WHERE b.room_type_id = p_room_type_id
       AND h.id IN (SELECT get_user_hotel_ids())
       AND b.status IN ('pending', 'confirmed', 'checked_in')
       AND b.room_id IS NOT NULL
       AND b.check_in < p_check_out
       AND b.check_out > p_check_in)
$$;

COMMENT ON FUNCTION public.room_type_available_count IS
  'Returns how many rooms of a type are free for [p_check_in, p_check_out). Scoped to caller hotel.';
