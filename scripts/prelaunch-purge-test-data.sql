-- =============================================================================
-- RoomLine Pre-Launch Test Data Purge Script (`BLK-04` — OPT-IN MANUAL RUN ONLY)
-- =============================================================================
--
-- PURPOSE:
--   Purges Paystack test-mode bookings, payments, payment attempts, Night Audit
--   snapshots, guest test rows, and test-mode subaccount bindings BEFORE
--   switching `PAYSTACK_SECRET_KEY` from `sk_test_...` to `sk_live_...`.
--
-- IMPORTANT SAFETY GUARD:
--   1. DO NOT execute while still testing with `sk_test_...`.
--   2. By default this script ends with `ROLLBACK;` so a dry run prints row
--      counts without deleting data. Change the final `ROLLBACK;` to `COMMIT;`
--      ONLY during your scheduled production cutover window!
--   3. After running this script and deploying `sk_live_...`:
--      - Delete pure QA properties (`test-hotel-pn6g`) if undesired (uncomment
--        section 3 below).
--      - Have each real hotel manager reconnect their live bank/MoMo payout
--        account in `/dashboard/payments?tab=setup` (which mints a `live`
--        `ACCT_...` subaccount) and click "Verify Subaccount" in Paystack Live
--        Dashboard -> Subaccounts.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Clear transactional test-mode financial & reservation history ──────────
DELETE FROM public.notification_delivery_outbox;
DELETE FROM public.notification_logs;
DELETE FROM public.notifications;
DELETE FROM public.payment_attempts;
DELETE FROM public.payments;
DELETE FROM public.booking_nights;
DELETE FROM public.bookings;
DELETE FROM public.guests;

-- Temporarily lift append-only / immutability triggers inside this cutover transaction:
ALTER TABLE public.business_date_closes DISABLE TRIGGER business_date_closes_immutable;
DELETE FROM public.business_date_closes;
ALTER TABLE public.business_date_closes ENABLE TRIGGER business_date_closes_immutable;

DELETE FROM public.reports_inventory_history;
DELETE FROM public.booking_reference_counters;

ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_no_modify;
DELETE FROM public.audit_logs;
ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_no_modify;

-- ── 2. Clear test-mode Paystack subaccount codes on retained hotels ───────────
-- Ensures no test `ACCT_...` code survives into live mode; hotels must verify
-- and connect a live settlement account under `sk_live_...`.
UPDATE public.hotels
   SET paystack_subaccount_code     = NULL,
       paystack_domain              = NULL,
       paystack_bank_code           = NULL,
       paystack_account_number      = NULL,
       paystack_business_name       = NULL,
       paystack_settlement_schedule = 'auto',
       updated_at                   = now()
 WHERE paystack_domain = 'test'
    OR paystack_subaccount_code IS NOT NULL;

-- ── 3. Optional: Delete pure QA test hotels (uncomment if desired) ────────────
-- DELETE FROM public.hotels WHERE slug IN ('test-hotel-pn6g');

-- Verify post-purge counts before committing:
SELECT
  (SELECT count(*) FROM public.hotels) AS hotels_remaining,
  (SELECT count(*) FROM public.hotels WHERE paystack_subaccount_code IS NOT NULL) AS subaccounts_remaining,
  (SELECT count(*) FROM public.bookings) AS bookings_remaining,
  (SELECT count(*) FROM public.payments) AS payments_remaining,
  (SELECT count(*) FROM public.payment_attempts) AS payment_attempts_remaining,
  (SELECT count(*) FROM public.business_date_closes) AS night_audits_remaining;

-- Change ROLLBACK to COMMIT only when executing the final pre-launch cutover:
ROLLBACK;
