-- ============================================================
-- Enable Supabase Realtime for calendar-relevant tables
-- ============================================================
-- The calendar in app/dashboard/calendar/calendar-client.tsx
-- subscribes to postgres_changes events on these two tables.
-- Without this migration, Supabase Realtime will NOT broadcast
-- changes — the subscription code is correct but the publication
-- must opt-in each table explicitly.
--
-- Apply via:
--   pnpm db:push
-- or paste into the Supabase Dashboard → SQL Editor and run.
-- ============================================================

-- Enable realtime for bookings table
-- (INSERT / UPDATE / DELETE on bookings will now broadcast to
--  all subscribed clients filtered by hotel_id)
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- Enable realtime for availability_blocks table
-- (INSERT / UPDATE / DELETE on availability_blocks will now
--  broadcast to all subscribed clients filtered by hotel_id)
ALTER PUBLICATION supabase_realtime ADD TABLE availability_blocks;
