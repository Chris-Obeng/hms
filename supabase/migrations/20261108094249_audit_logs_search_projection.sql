-- Audit trail: searchable + classifiable projections.
--
-- The audit log page filters by a small set of categories and by free text.
-- Two things used to happen in the app that PostgREST cannot express:
--
--   1. Free-text search across the JSON state blobs needed a `::text` cast,
--      which PostgREST's query parser rejects inside `or()`. Searching only
--      text columns silently ignored the states (so "cash" found nothing).
--   2. Category matching was a set of `action like` patterns in TypeScript,
--      so an action outside the known prefixes (e.g. a historical
--      "verify_trigger" row) counted under Settings in the filter menu but
--      never appeared when that filter was applied.
--
-- Both are now stored generated columns, so the row itself carries the fact:
-- `search_text` is the lowercased haystack for one `ilike`, and `category` is
-- the bucket the filter menu shows and filters by. The table is insert-only
-- and small (a few hundred rows per hotel), so the write cost is irrelevant
-- and the read filter becomes a plain `eq` + `ilike` pair.
--
-- Keep these definitions in lockstep with AUDIT_CATEGORIES in
-- lib/audit-format.ts — the UI labels come from there, the bucketing from here.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
    lower(
      action
      || ' ' || coalesce(staff_name, '')
      || ' ' || coalesce(entity_type, '')
      || ' ' || coalesce(entity_id::text, '')
      || ' ' || coalesce(after_state::text, '')
      || ' ' || coalesce(before_state::text, '')
    )
  ) STORED,
  ADD COLUMN IF NOT EXISTS category text GENERATED ALWAYS AS (
    CASE
      WHEN action LIKE 'booking.%' THEN 'bookings'
      WHEN action LIKE 'payment.%' THEN 'payments'
      WHEN action LIKE 'staff.%' THEN 'staff'
      WHEN action LIKE 'room.%' THEN 'rooms'
      ELSE 'settings'
    END
  ) STORED;

-- Filtered page + filtered count both read (hotel_id, category) then sort.
CREATE INDEX IF NOT EXISTS idx_audit_logs_hotel_category_created_at
  ON public.audit_logs (hotel_id, category, created_at DESC, id DESC);

COMMENT ON COLUMN public.audit_logs.search_text IS
  'Lowercased haystack (action, staff, entity, both state blobs) backing the audit log search box.';
COMMENT ON COLUMN public.audit_logs.category IS
  'Filter-menu bucket for the audit log page; mirrors AUDIT_CATEGORIES in lib/audit-format.ts.';
