-- Reservation group support: link N sibling booking rows into one guest reservation.
--
-- Multi-room booking (guest self-service): each room line is its own `bookings`
-- row (keeping every GIST overlap EXCLUDE, the assert_room_type_inventory guard,
-- booking_nights, and reprice_booking_stay byte-for-byte on the row where they
-- already live). Sibling rows are linked by a shared group_id.
--
-- group_id semantics:
--   NULL           -> ordinary single-room booking (every existing row; the
--                     entire single-room path is unaffected).
--   = own id       -> the group ANCHOR row (first line inserted).
--   = anchor's id  -> a non-anchor line in that anchor's reservation group.
--
-- The guest-facing group reference derives from the anchor row's `reference`;
-- staff still see each row's own `reference`. Additive only, no backfill.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS group_id uuid;

COMMENT ON COLUMN public.bookings.group_id IS
  'Reservation-group link. NULL = single-room booking. Anchor row has group_id = id; sibling lines share the anchor id.';

-- Partial index: the vast majority of rows are NULL (single-room) and are
-- excluded, so this stays small and only serves group lookups.
CREATE INDEX IF NOT EXISTS bookings_group_id_idx
  ON public.bookings (group_id)
  WHERE group_id IS NOT NULL;
