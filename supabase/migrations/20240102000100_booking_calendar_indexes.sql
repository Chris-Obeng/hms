-- ============================================================================
-- Calendar-specific indexes for the booking availability system
--
-- These support the overlap queries used by the calendar page:
-- - check_room_availability()
-- - room_type_available_count()
-- - getCalendarData() server action
-- - The bookings_no_room_overlap EXCLUDE constraint (has its own GiST index)
-- ============================================================================

-- Composite index for "bookings overlapping a date range for a specific room"
-- Used by the app-layer conflict check before drag-and-drop moves.
CREATE INDEX IF NOT EXISTS idx_bookings_room_dates
  ON public.bookings (room_id, check_in, check_out)
  WHERE room_id IS NOT NULL
    AND status IN ('pending', 'confirmed', 'checked_in');

-- Composite index for "bookings overlapping a date range for a room type"
-- Used by room_type_available_count() and unassigned booking validation.
CREATE INDEX IF NOT EXISTS idx_bookings_room_type_dates
  ON public.bookings (hotel_id, room_type_id, check_in, check_out)
  WHERE room_type_id IS NOT NULL
    AND status IN ('pending', 'confirmed', 'checked_in');

-- Index for availability_blocks overlapping a date range (calendar rendering)
CREATE INDEX IF NOT EXISTS idx_availability_blocks_dates
  ON public.availability_blocks (room_id, start_date, end_date);

-- Partial index for rooms that can be assigned (not out of service)
-- Used by calendar to find assignable rooms
CREATE INDEX IF NOT EXISTS idx_rooms_assignable
  ON public.rooms (hotel_id, room_type_id)
  WHERE is_active = true
    AND status NOT IN ('maintenance', 'out_of_service');
