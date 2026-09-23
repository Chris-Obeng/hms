-- Invariant: a cancelled booking always carries its cancellation timestamp.
--
-- The dashboard and reports cancellations feeds key on cancelled_at (the
-- cancellation event time), never updated_at: post-cancellation writes
-- (payment settlement, expiry jobs, sync backfills) bump updated_at and would
-- otherwise resurrect old cancellations into the current day's view. This
-- constraint guarantees every status = 'cancelled' row carries the timestamp
-- those feeds depend on. IS DISTINCT FROM keeps NULL statuses (legacy rows)
-- outside the rule.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_cancelled_requires_cancelled_at
  CHECK (status IS DISTINCT FROM 'cancelled' OR cancelled_at IS NOT NULL);

-- The cancellations feeds filter on (hotel_id, status = 'cancelled') and
-- order by cancelled_at DESC. A partial index keeps non-cancelled rows out of
-- the index entirely, so the write path for active bookings is untouched.
CREATE INDEX IF NOT EXISTS bookings_hotel_cancelled_at_idx
  ON public.bookings (hotel_id, cancelled_at DESC)
  WHERE status = 'cancelled';
