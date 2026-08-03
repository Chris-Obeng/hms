-- ============================================================================
-- Enable Supabase Realtime for remaining hotel-scoped tables
--
-- Already in supabase_realtime publication (applied in earlier migrations):
--   bookings, availability_blocks, rooms, notifications, payments
--
-- This migration adds the remaining tables that benefit from live updates:
--
--   guests        — total_stays / total_spend updated by trigger after each
--                   booking checkout; customers page and guest detail sheet
--                   should reflect these without a manual refresh.
--
--   room_types    — base_price / weekend_price changes affect the public
--                   booking page pricing in real-time; daily/seasonal rate
--                   overrides also invalidate cached pricing.
--
--   hotels        — status / plan / settings changes (e.g. suspension,
--                   currency, check-in time) must propagate to all open
--                   dashboard sessions immediately. A suspended hotel
--                   should not keep serving the dashboard indefinitely.
--
-- Tables deliberately NOT added:
--   audit_logs              — append-only (UPDATE/DELETE blocked by trigger);
--                             no client subscribes; no realtime value.
--   platform_admins         — platform-scoped, not hotel client.
--   platform_admin_audit_logs — same as above.
--   staff_invitations       — transient tokens; no client subscribes.
--   booking_reference_counters — internal counter; no UI subscribes.
--   staff_profiles          — role/active changes are low-frequency and
--                             handled by Clerk session refresh; no
--                             component currently subscribes. Adding it
--                             would broadcast every login timestamp update
--                             (last_login_at) unnecessarily.
--   daily_rate_overrides    — already covered when room_types updates;
--                             pricing-store re-fetches on any room_type change.
--   seasonal_rates /
--   seasonal_rate_overrides — same reasoning as daily_rate_overrides.
--   notification_logs       — audit trail for sent notifications; no UI
--                             subscribes to this table.
--
-- Idempotent: ALTER PUBLICATION ... ADD TABLE is a no-op if the table is
-- already a member of the publication (Postgres silently ignores it when
-- the table is already listed, or throws a benign "already a member" notice
-- that Supabase migrations tolerate). Wrapped in DO blocks for safety.
-- ============================================================================

-- ── guests ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.guests;
EXCEPTION WHEN duplicate_object THEN
  -- Table already a member of this publication — safe to ignore.
  NULL;
END $$;

-- ── room_types ────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.room_types;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── hotels ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hotels;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
