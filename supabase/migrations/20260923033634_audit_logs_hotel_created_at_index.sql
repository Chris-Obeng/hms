-- Composite index for day-windowed, keyset-paginated audit trail reads.
-- The audit log page fetches entries in (hotel_id, created_at DESC, id DESC)
-- order; the existing single-column idx_audit_logs_hotel_id leaves the sort
-- to Postgres. This index serves the feed query directly.
CREATE INDEX IF NOT EXISTS idx_audit_logs_hotel_created_at
  ON public.audit_logs (hotel_id, created_at DESC, id DESC);
