-- =============================================================================
-- Reconcile live production schema drift with migration history, restore
-- missing room_types (hotel_id, slug) uniqueness on clean replays, add ARI
-- stale-lock recovery, link platform_admins.supabase_user_id -> auth.users,
-- and upgrade single-column tenant foreign keys to composite (fk, hotel_id).
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ── 1. Restore room_types (hotel_id, slug) uniqueness missing on clean replay ─
DO $$
BEGIN
  ALTER TABLE public.room_types
    ADD CONSTRAINT room_types_hotel_id_slug_key UNIQUE (hotel_id, slug);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- ── 2. Unblock multi-hotel Clerk users in production ──────────────────────────
ALTER TABLE public.staff_profiles
  DROP CONSTRAINT IF EXISTS staff_profiles_clerk_user_id_key;

-- ── 3. Reconcile updated_at NOT NULL and column defaults across live & local ──
UPDATE public.payments
   SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;

UPDATE public.notifications
   SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;

UPDATE public.availability_blocks
   SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;

UPDATE public.platform_admins
   SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;

ALTER TABLE public.payments            ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.notifications       ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.availability_blocks ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.platform_admins     ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.hotels
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.staff_profiles
  ALTER COLUMN role SET DEFAULT 'pending';

ALTER TABLE public.bookings
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN payment_status SET DEFAULT 'unpaid',
  ALTER COLUMN payment_preference SET DEFAULT 'pay_at_checkin',
  ALTER COLUMN source SET DEFAULT 'direct';

ALTER TABLE public.payments
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.guests
  ALTER COLUMN tags SET DEFAULT '[]'::jsonb;

ALTER TABLE public.room_types
  ALTER COLUMN amenities SET DEFAULT '[]'::jsonb,
  ALTER COLUMN images SET DEFAULT '[]'::jsonb;

-- ── 4. Harden auth.users -> platform_admins sync + auth.users FK ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.platform_admins'::regclass
       AND conname = 'platform_admins_supabase_user_id_fkey'
  ) THEN
    ALTER TABLE public.platform_admins
      ADD CONSTRAINT platform_admins_supabase_user_id_fkey
        FOREIGN KEY (supabase_user_id) REFERENCES auth.users (id)
        ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

ALTER TABLE public.platform_admins
  VALIDATE CONSTRAINT platform_admins_supabase_user_id_fkey;

CREATE OR REPLACE FUNCTION public.handle_new_platform_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.platform_admins (supabase_user_id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    'admin',
    false
  )
  ON CONFLICT (email) DO UPDATE
    SET supabase_user_id = COALESCE(public.platform_admins.supabase_user_id, EXCLUDED.supabase_user_id)
  WHERE public.platform_admins.supabase_user_id IS NULL;

  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.handle_new_platform_admin() FROM PUBLIC, anon, authenticated;

-- ── 5. Stale-lock recovery for ARI outbox worker (mirrors claim_push_jobs) ────
CREATE OR REPLACE FUNCTION public.claim_ari_jobs(p_limit integer DEFAULT 50)
RETURNS SETOF public.ari_sync_outbox
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
  WITH reclaimed AS (
    UPDATE public.ari_sync_outbox j
       SET status = CASE WHEN j.attempt_count + 1 >= 7 THEN 'dead_letter' ELSE 'retry' END,
           attempt_count = j.attempt_count + 1,
           last_error = 'Reclaimed: ARI delivery lock expired before completion',
           next_attempt_at = now(),
           locked_at = NULL,
           updated_at = now()
     WHERE j.status = 'processing'
       AND j.locked_at < now() - interval '8 minutes'
  )
  UPDATE public.ari_sync_outbox o
     SET status = 'processing',
         locked_at = now(),
         updated_at = now()
   WHERE o.id IN (
     SELECT c.id
       FROM (
         SELECT j2.id
           FROM public.ari_sync_outbox j2
          WHERE j2.status IN ('pending', 'retry')
            AND j2.next_attempt_at <= now()
          ORDER BY j2.next_attempt_at
          LIMIT LEAST(GREATEST(p_limit, 1), 200)
          FOR UPDATE SKIP LOCKED
       ) AS c
   )
   RETURNING o.*;
$fn$;

REVOKE ALL ON FUNCTION public.claim_ari_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ari_jobs(integer) TO service_role;

-- ── 6. Reconcile RLS policies across rate & operational tables (TO authenticated)
DROP POLICY IF EXISTS "Staff can view seasonal rates for their hotel"   ON public.seasonal_rates;
DROP POLICY IF EXISTS "Staff can create seasonal rates for their hotel" ON public.seasonal_rates;
DROP POLICY IF EXISTS "Staff can update seasonal rates for their hotel" ON public.seasonal_rates;
DROP POLICY IF EXISTS "Staff can delete seasonal rates for their hotel" ON public.seasonal_rates;

DROP POLICY IF EXISTS "Staff can view seasonal overrides for their hotel"   ON public.seasonal_rate_overrides;
DROP POLICY IF EXISTS "Staff can create seasonal overrides for their hotel" ON public.seasonal_rate_overrides;
DROP POLICY IF EXISTS "Staff can update seasonal overrides for their hotel" ON public.seasonal_rate_overrides;
DROP POLICY IF EXISTS "Staff can delete seasonal overrides for their hotel" ON public.seasonal_rate_overrides;

DROP POLICY IF EXISTS "Staff can view daily overrides for their hotel"   ON public.daily_rate_overrides;
DROP POLICY IF EXISTS "Staff can create daily overrides for their hotel" ON public.daily_rate_overrides;
DROP POLICY IF EXISTS "Staff can update daily overrides for their hotel" ON public.daily_rate_overrides;
DROP POLICY IF EXISTS "Staff can delete daily overrides for their hotel" ON public.daily_rate_overrides;

DROP POLICY IF EXISTS hotels_org_isolation ON public.hotels;
CREATE POLICY hotels_org_isolation
  ON public.hotels FOR ALL TO authenticated
  USING (id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (id IN (SELECT public.get_user_hotel_ids()));

DROP POLICY IF EXISTS staff_profiles_org_isolation ON public.staff_profiles;
CREATE POLICY staff_profiles_org_isolation
  ON public.staff_profiles FOR ALL TO authenticated
  USING (clerk_org_id IN (SELECT public.get_user_clerk_org_ids()))
  WITH CHECK (clerk_org_id IN (SELECT public.get_user_clerk_org_ids()));

-- Note: `notifications` uses recipient-scoped `notifications_staff_{select,update}`
-- from the preceding migration and is intentionally excluded from `FOR ALL` here.
DO $policies$
DECLARE
  t text;
  hotel_tables text[] := ARRAY[
    'room_types', 'rooms', 'guests', 'bookings', 'payments',
    'availability_blocks', 'audit_logs',
    'seasonal_rates', 'seasonal_rate_overrides', 'daily_rate_overrides',
    'rate_plans', 'rate_restrictions', 'booking_nights',
    'channel_properties', 'channel_room_type_mappings', 'channel_rate_plan_mappings'
  ];
BEGIN
  FOREACH t IN ARRAY hotel_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_org_isolation ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_org_isolation ON public.%I FOR ALL TO authenticated '
      'USING (hotel_id IN (SELECT public.get_user_hotel_ids())) '
      'WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()))',
      t, t
    );
  END LOOP;
END
$policies$;

DROP POLICY IF EXISTS seasonal_rate_overrides_insert_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_insert_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS seasonal_rate_overrides_update_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_update_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS seasonal_rate_overrides_delete_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_delete_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS booking_nights_direct_update_requires_manager ON public.booking_nights;
CREATE POLICY booking_nights_direct_update_requires_manager
  ON public.booking_nights AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS booking_nights_delete_requires_manager ON public.booking_nights;
CREATE POLICY booking_nights_delete_requires_manager
  ON public.booking_nights AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

-- ── 7. Composite tenant foreign keys (NOT VALID + VALIDATE CONSTRAINT) ────────
DO $$ BEGIN
  ALTER TABLE public.rooms
    ADD CONSTRAINT rooms_id_hotel_id_key UNIQUE (id, hotel_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.guests
    ADD CONSTRAINT guests_id_hotel_id_key UNIQUE (id, hotel_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TABLE public.daily_rate_overrides
  DROP CONSTRAINT IF EXISTS daily_rate_overrides_room_type_id_fkey,
  DROP CONSTRAINT IF EXISTS daily_rate_overrides_room_type_fk;

ALTER TABLE public.daily_rate_overrides
  ADD CONSTRAINT daily_rate_overrides_room_type_fk
    FOREIGN KEY (room_type_id, hotel_id)
    REFERENCES public.room_types (id, hotel_id)
    ON DELETE CASCADE NOT VALID;

ALTER TABLE public.daily_rate_overrides
  VALIDATE CONSTRAINT daily_rate_overrides_room_type_fk;

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_room_type_id_fkey,
  DROP CONSTRAINT IF EXISTS rooms_room_type_hotel_fk;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_room_type_hotel_fk
    FOREIGN KEY (room_type_id, hotel_id)
    REFERENCES public.room_types (id, hotel_id)
    ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.rooms
  VALIDATE CONSTRAINT rooms_room_type_hotel_fk;

ALTER TABLE public.availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_room_id_fkey,
  DROP CONSTRAINT IF EXISTS availability_blocks_room_hotel_fk;

ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_room_hotel_fk
    FOREIGN KEY (room_id, hotel_id)
    REFERENCES public.rooms (id, hotel_id)
    ON DELETE CASCADE NOT VALID;

ALTER TABLE public.availability_blocks
  VALIDATE CONSTRAINT availability_blocks_room_hotel_fk;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_guest_id_fkey,
  DROP CONSTRAINT IF EXISTS bookings_guest_hotel_fk,
  DROP CONSTRAINT IF EXISTS bookings_room_id_fkey,
  DROP CONSTRAINT IF EXISTS bookings_room_hotel_fk,
  DROP CONSTRAINT IF EXISTS bookings_room_type_id_fkey,
  DROP CONSTRAINT IF EXISTS bookings_room_type_hotel_fk,
  DROP CONSTRAINT IF EXISTS bookings_group_hotel_fk;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_guest_hotel_fk
    FOREIGN KEY (guest_id, hotel_id)
    REFERENCES public.guests (id, hotel_id)
    ON DELETE SET NULL (guest_id) NOT VALID,
  ADD CONSTRAINT bookings_room_hotel_fk
    FOREIGN KEY (room_id, hotel_id)
    REFERENCES public.rooms (id, hotel_id)
    ON DELETE SET NULL (room_id) NOT VALID,
  ADD CONSTRAINT bookings_room_type_hotel_fk
    FOREIGN KEY (room_type_id, hotel_id)
    REFERENCES public.room_types (id, hotel_id)
    ON DELETE SET NULL (room_type_id) NOT VALID,
  ADD CONSTRAINT bookings_group_hotel_fk
    FOREIGN KEY (group_id, hotel_id)
    REFERENCES public.bookings (id, hotel_id)
    NOT VALID;

ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_guest_hotel_fk;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_room_hotel_fk;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_room_type_hotel_fk;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_group_hotel_fk;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_booking_id_fkey,
  DROP CONSTRAINT IF EXISTS notifications_booking_hotel_fk;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_booking_hotel_fk
    FOREIGN KEY (booking_id, hotel_id)
    REFERENCES public.bookings (id, hotel_id)
    ON DELETE SET NULL (booking_id) NOT VALID;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_booking_hotel_fk;

ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_booking_id_fkey,
  DROP CONSTRAINT IF EXISTS notification_logs_booking_hotel_fk;

ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_booking_hotel_fk
    FOREIGN KEY (booking_id, hotel_id)
    REFERENCES public.bookings (id, hotel_id)
    ON DELETE SET NULL (booking_id) NOT VALID;

ALTER TABLE public.notification_logs
  VALIDATE CONSTRAINT notification_logs_booking_hotel_fk;

NOTIFY pgrst, 'reload schema';

COMMIT;
