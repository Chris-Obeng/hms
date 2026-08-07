-- ============================================================
-- Enable Supabase Realtime for additional tables
-- ============================================================
-- rooms: needed for live room availability and rooms directory
--   live updates when staff change room statuses
-- notifications: needed for live notification bell count
--   in the persistent app header
-- payments: needed for outstanding balances and transactions
--   pages to reflect new payments without page reload
--
-- Apply via:
--   pnpm db:push
-- or paste into the Supabase Dashboard → SQL Editor and run.
-- ============================================================

-- Enable realtime for rooms table
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable realtime for payments table
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
