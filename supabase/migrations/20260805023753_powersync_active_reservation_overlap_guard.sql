CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_no_room_date_overlap;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_room_date_overlap
  EXCLUDE USING gist (
    hotel_id WITH =,
    room_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  )
  WHERE (
    room_id IS NOT NULL
    AND status IN ('pending', 'confirmed', 'checked_in')
  );