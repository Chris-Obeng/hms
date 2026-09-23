-- Make the "alert the hotel once per booking" guarantee real.
--
-- lib/bookings/confirm-online-payment.ts alerts staff when an online payment
-- needs manual review (currency mismatch, unclassifiable amount, payment on a
-- non-active booking). It did that with a SELECT followed by an INSERT, which is
-- not a guarantee: the Paystack webhook and the guest-facing verify fallback run
-- concurrently by design, so both can read "no alert yet" and both insert. The
-- hotel then sees the same warning twice and cannot tell whether that means two
-- problems or one.
--
-- The guarantee belongs in the database, where those two writers actually meet.
-- The application inserts unconditionally and treats 23505 as "someone else
-- already alerted".
--
-- Uniqueness is keyed on an explicit dedupe_key, not on the notification title.
-- A title is display text ("Payment Currency Mismatch"): editing the wording or
-- an emoji would silently reset dedupe and nothing would fail loudly. This
-- mirrors how payment idempotency is keyed in
-- 20260824023558_harden_payment_idempotency.
--
-- No rows are deleted. Existing notifications keep dedupe_key IS NULL, which the
-- partial index does not cover, so it cannot fail on legacy data and no history
-- is destroyed. The index is deliberately not scoped to one notification type:
-- any future "notify once per booking" flow can reuse the same mechanism instead
-- of adding another index.
--
-- Plain (non-CONCURRENT) creation is correct here: supabase db push and
-- apply_migration both run a migration inside a transaction, where CREATE INDEX
-- CONCURRENTLY is not allowed, and the table is small.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Machine-stable idempotency key for "notify once per booking" flows, e.g. '
  '''payment-review:currency-mismatch''. Never display text: the unique index '
  'notifications_booking_dedupe_key_uniq depends on this value being stable '
  'across wording changes. NULL means the notification is not deduplicated.';

CREATE UNIQUE INDEX IF NOT EXISTS notifications_booking_dedupe_key_uniq
  ON public.notifications (booking_id, dedupe_key)
  WHERE booking_id IS NOT NULL AND dedupe_key IS NOT NULL;
