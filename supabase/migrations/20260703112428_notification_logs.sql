-- migration: 20260703112428_notification_logs.sql
-- Purpose: Add notification_logs table for transactional notification observability.
--
-- This table records every notification attempt (SMS or email) made by the
-- HotelOS notification pipeline. It serves three purposes:
--   1. Idempotency: prevents duplicate sends on webhook retries (checked before send)
--   2. Observability: staff can see what was sent, when, and to whom
--   3. Delivery tracking: Arkesel delivery webhooks update status via provider_message_id
--
-- RLS: this table is INSERT/SELECT by service role only. Hotel staff can read their
-- hotel's logs via the admin dashboard (server-side Supabase admin client).

CREATE TABLE IF NOT EXISTS notification_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            uuid        NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id          uuid        REFERENCES bookings(id) ON DELETE SET NULL,
  event_type          text        NOT NULL,
  -- 'booking_confirmed' | 'booking_cancelled' | 'check_in_reminder' | etc.
  channel             text        NOT NULL,
  -- 'sms' | 'email'
  provider            text        NOT NULL,
  -- 'arkesel' | 'resend'
  recipient           text        NOT NULL,
  -- E.164 phone or email address — used for delivery audit, not marketing
  provider_message_id text,
  -- Arkesel message UUID or Resend email ID — used to correlate delivery callbacks
  status              text        NOT NULL DEFAULT 'sent',
  -- 'sent' | 'delivered' | 'failed' | 'undeliverable'
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Constraints
ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_event_type_check
    CHECK (event_type IN (
      'booking_confirmed', 'booking_cancelled',
      'check_in_reminder', 'check_out_reminder',
      'payment_received', 'payment_link'
    )),
  ADD CONSTRAINT notification_logs_channel_check
    CHECK (channel IN ('sms', 'email')),
  ADD CONSTRAINT notification_logs_provider_check
    CHECK (provider IN ('arkesel', 'resend')),
  ADD CONSTRAINT notification_logs_status_check
    CHECK (status IN ('sent', 'delivered', 'failed', 'undeliverable'));

-- Indexes for idempotency checks and delivery webhook lookups
CREATE INDEX idx_notification_logs_booking
  ON notification_logs(booking_id, event_type)
  WHERE booking_id IS NOT NULL;

CREATE INDEX idx_notification_logs_hotel
  ON notification_logs(hotel_id, created_at DESC);

CREATE INDEX idx_notification_logs_provider_message_id
  ON notification_logs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- No RLS on this table — service role only.
-- The admin dashboard reads logs server-side via supabaseAdmin (bypasses RLS).
-- This is intentional: notification metadata should never be exposed to client-side code.
ALTER TABLE notification_logs DISABLE ROW LEVEL SECURITY;

-- Append-only: no updates or deletes (status updates happen via the webhook handler
-- which uses the service role and can bypass this if needed; delivery status updates
-- are done via a targeted UPDATE by provider_message_id which is fine).
-- Note: we intentionally do NOT use prevent_modification() here because delivery
-- status webhooks legitimately need to UPDATE the status column.

COMMENT ON TABLE notification_logs IS
  'Audit log for every transactional notification attempt. Used for idempotency checks, delivery tracking, and staff observability.';
