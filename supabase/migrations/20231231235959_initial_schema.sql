-- ============================================================================
-- Initial schema: create all 13 tables in their post-refactor shape
--
-- Slot: 20231231235959 — runs BEFORE 20240101000000_refactor_staff_profiles.sql
-- so the refactor becomes a safe no-op (its `clerk_org_id` column already
-- exists, its `hotel_id` column was never created, its IF EXISTS guards fire).
--
-- This migration is safe to run:
--   - On a fresh local DB (via `supabase start` / `db reset`) — creates
--     the schema from scratch
--   - On the live remote DB — every CREATE is `IF NOT EXISTS` so the body
--     is a no-op when the table already exists; the migration tracking
--     table then records it as applied so it never re-runs.
--
-- The self-referencing FK on staff_profiles is added with `DO $$ ... EXCEPTION`
-- to keep it idempotent. Subsequent migrations (constraints, RLS, indexes,
-- triggers, updated_at, append-only) are also idempotent and run on top.
-- ============================================================================

-- Required for gen_random_uuid().
-- 20240101000100_extensions.sql will also try to create this, but uses
-- IF NOT EXISTS so it's safe.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. hotels — no FKs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hotels (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                          text NOT NULL,
  name                          varchar(255) NOT NULL,
  description                   text,
  address                       text,
  city                          text,
  country                       text DEFAULT 'Ghana',
  phone                         varchar(32),
  email                         varchar(320),
  logo_url                      text,
  cover_image_url               text,
  timezone                      text DEFAULT 'Africa/Accra',
  currency                      text DEFAULT 'GHS',
  check_in_time                 time DEFAULT '14:00',
  check_out_time                time DEFAULT '11:00',
  cancellation_policy           text,
  custom_domain                 text,
  clerk_org_id                  text NOT NULL,
  paystack_subaccount_code      text,
  paystack_business_name        text,
  paystack_bank_code            text,
  paystack_account_number       text,
  paystack_settlement_schedule  text DEFAULT 'auto',
  beds24_property_id            text,
  beds24_api_key                text,
  arkesel_api_key               text,
  arkesel_sender_name           text,
  plan                          text,
  status                        text,
  settings                      jsonb DEFAULT '{}',
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now()
);

-- ============================================================================
-- 2. staff_profiles — no FKs to other tables, only self-ref
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id       text NOT NULL,
  clerk_org_id        text NOT NULL,
  email               text NOT NULL,
  full_name           text,
  avatar_url          text,
  role                text,
  is_active           boolean DEFAULT false,
  granted_at          timestamptz,
  granted_by          uuid,
  last_login_at       timestamptz,
  notification_prefs  jsonb DEFAULT '{"new_booking":true,"payment_received":true,"cancellation":true,"ota_conflict":true}'::jsonb,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Self-referencing FK (added after the table exists). Idempotent.
DO $$ BEGIN
  ALTER TABLE public.staff_profiles
    ADD CONSTRAINT staff_profiles_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES public.staff_profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. room_types — FK → hotels
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.room_types (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name                text NOT NULL,
  slug                text NOT NULL,
  short_description   text,
  description         text,
  bed_configuration   text,
  max_adults          integer DEFAULT 2,
  max_children        integer DEFAULT 0,
  base_price          numeric(10,2) NOT NULL,
  weekend_price       numeric(10,2),
  amenities           jsonb,
  images              jsonb,
  is_active           boolean DEFAULT true,
  sort_order          integer DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. rooms — FK → hotels, room_types
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id  uuid NOT NULL REFERENCES public.room_types(id) ON DELETE RESTRICT,
  room_number   text NOT NULL,
  floor         text,
  notes         text,
  status        text,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ============================================================================
-- 5. guests — FK → hotels
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.guests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  email           text,
  phone           text,
  national_id     text,
  nationality     text,
  notes           text,
  tags            jsonb,
  total_stays     integer DEFAULT 0,
  total_spend     numeric(12,2) DEFAULT 0,
  last_stay_date  date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 6. bookings — FK → hotels, guests, rooms, room_types, staff_profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id              uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  reference             text NOT NULL,
  guest_id              uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  room_id               uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_type_id          uuid REFERENCES public.room_types(id) ON DELETE SET NULL,
  check_in              date NOT NULL,
  check_out             date NOT NULL,
  nights                integer GENERATED ALWAYS AS (check_out - check_in) STORED,
  adults                integer DEFAULT 1,
  children              integer DEFAULT 0,
  room_rate             numeric(10,2) NOT NULL,
  subtotal              numeric(10,2) NOT NULL,
  tax_amount            numeric(10,2) DEFAULT 0,
  total_amount          numeric(10,2) NOT NULL,
  amount_paid           numeric(10,2) DEFAULT 0,
  outstanding_balance   numeric(10,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  currency              text DEFAULT 'GHS',
  status                text,
  payment_status        text,
  payment_preference    text,
  source                text,
  special_requests      text,
  estimated_arrival     time,
  internal_notes        text,
  check_in_at           timestamptz,
  check_out_at          timestamptz,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  beds24_booking_id     text,
  created_by            uuid REFERENCES public.staff_profiles(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ============================================================================
-- 7. payments — FK → hotels, bookings, staff_profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id              uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id            uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount                numeric(10,2) NOT NULL,
  currency              text DEFAULT 'GHS',
  method                text,
  paystack_reference    text,
  paystack_id           text,
  paystack_subaccount   text,
  platform_fee          numeric(10,2),
  status                text,
  paid_at               timestamptz,
  recorded_by           uuid REFERENCES public.staff_profiles(id),
  notes                 text,
  metadata              jsonb DEFAULT '{}',
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ============================================================================
-- 8. availability_blocks — FK → hotels, rooms, staff_profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.availability_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id     uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  reason      text,
  notes       text,
  created_by  uuid REFERENCES public.staff_profiles(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ============================================================================
-- 9. notifications — FK → hotels, bookings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  type        text,
  title       text NOT NULL,
  message     text NOT NULL,
  booking_id  uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  is_read     boolean DEFAULT false,
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ============================================================================
-- 10. beds24_property_mappings — FK → hotels, room_types
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beds24_property_mappings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  beds24_property_id  text NOT NULL,
  beds24_room_id      text NOT NULL,
  room_type_id        uuid NOT NULL REFERENCES public.room_types(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ============================================================================
-- 11. beds24_sync_log — FK → hotels, bookings (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beds24_sync_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  direction           text,
  event_type          text,
  beds24_booking_id   text,
  booking_id          uuid REFERENCES public.bookings(id),
  payload             jsonb,
  status              text,
  conflict_details    text,
  error_message       text,
  processed_at        timestamptz DEFAULT now()
);

-- ============================================================================
-- 12. audit_logs — FK → hotels, staff_profiles (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  staff_id      uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  staff_name    text,
  action        text NOT NULL,
  entity_type   text,
  entity_id     uuid,
  before_state  jsonb,
  after_state   jsonb,
  created_at    timestamptz DEFAULT now()
);

-- ============================================================================
-- 13. platform_admins — no FKs (separate from staff)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   text NOT NULL,
  email           text NOT NULL,
  full_name       text,
  role            text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
