BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Least-privilege table grants on public.notifications
--    All legitimate inserts run via service_role / SECURITY DEFINER; clients only read
--    and mark their own visible rows read/archived.
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.notifications FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

-- 2. Replace hotel-wide FOR ALL policy with recipient-scoped SELECT + UPDATE policies
DROP POLICY IF EXISTS notifications_org_isolation ON public.notifications;
DROP POLICY IF EXISTS notifications_staff_select ON public.notifications;
DROP POLICY IF EXISTS notifications_staff_update ON public.notifications;

CREATE POLICY notifications_staff_select
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    hotel_id IN (SELECT public.get_user_hotel_ids())
    AND (
      recipient_staff_id IS NULL
      OR recipient_staff_id IN (
        SELECT sp.id
        FROM public.staff_profiles sp
        WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
          AND sp.is_active = true
      )
    )
  );

CREATE POLICY notifications_staff_update
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    hotel_id IN (SELECT public.get_user_hotel_ids())
    AND (
      recipient_staff_id IS NULL
      OR recipient_staff_id IN (
        SELECT sp.id
        FROM public.staff_profiles sp
        WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
          AND sp.is_active = true
      )
    )
  )
  WITH CHECK (
    hotel_id IN (SELECT public.get_user_hotel_ids())
    AND (
      recipient_staff_id IS NULL
      OR recipient_staff_id IN (
        SELECT sp.id
        FROM public.staff_profiles sp
        WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
          AND sp.is_active = true
      )
    )
  );

-- 3. Column-level immutability guard for client JWT updates on public.notifications
--    Unified on guard_notification_client_update() so client callers can only mutate
--    is_read, read_at, archived_at, updated_at.
DROP TRIGGER IF EXISTS trg_guard_notification_immutable_columns ON public.notifications;
DROP FUNCTION IF EXISTS public.guard_notification_immutable_columns();

CREATE OR REPLACE FUNCTION public.guard_notification_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_jwt_role    text := COALESCE((SELECT auth.jwt()) ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_sub         text := COALESCE((SELECT auth.jwt()) ->> 'sub',  current_setting('request.jwt.claim.sub', true));
  v_invoker_rol text := COALESCE(current_setting('role', true), 'none');
BEGIN
  IF v_jwt_role = 'service_role'
     OR (
       current_user IN ('postgres', 'service_role', 'supabase_admin')
       AND v_invoker_rol IN ('none', 'postgres', 'service_role', 'supabase_admin')
       AND v_jwt_role NOT IN ('authenticated', 'anon')
       AND v_sub IS NULL
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.hotel_id IS DISTINCT FROM OLD.hotel_id
     OR NEW.recipient_staff_id IS DISTINCT FROM OLD.recipient_staff_id
     OR NEW.created_by_staff_id IS DISTINCT FROM OLD.created_by_staff_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Client callers may only update notification read or archive state'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_notification_client_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_notification_client_update() TO service_role;

DROP TRIGGER IF EXISTS trg_guard_notification_client_update ON public.notifications;
CREATE TRIGGER trg_guard_notification_client_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_client_update();

-- 4. Revoke authenticated EXECUTE on SECURITY DEFINER trigger function (clears lint 0029)
REVOKE ALL ON FUNCTION public.enqueue_notification_push() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_push() TO service_role;

-- 5. Dedupe indexes supporting both hotel-wide and per-staff booking/reminder alerts
DROP INDEX IF EXISTS public.notifications_booking_dedupe_key_uniq;
CREATE UNIQUE INDEX notifications_booking_dedupe_key_uniq
  ON public.notifications (booking_id, dedupe_key)
  WHERE recipient_staff_id IS NULL
    AND booking_id IS NOT NULL
    AND dedupe_key IS NOT NULL;

DROP INDEX IF EXISTS public.notifications_staff_booking_dedupe_key_uniq;
CREATE UNIQUE INDEX notifications_staff_booking_dedupe_key_uniq
  ON public.notifications (booking_id, recipient_staff_id, dedupe_key)
  WHERE recipient_staff_id IS NOT NULL
    AND booking_id IS NOT NULL
    AND dedupe_key IS NOT NULL;

DROP INDEX IF EXISTS public.notifications_staff_dedupe_key_uniq;
CREATE UNIQUE INDEX notifications_staff_dedupe_key_uniq
  ON public.notifications (hotel_id, recipient_staff_id, dedupe_key)
  WHERE recipient_staff_id IS NOT NULL
    AND dedupe_key IS NOT NULL
    AND type IN ('check_in_reminder', 'check_out_reminder', 'staff_access_request');

-- 6. Harden dispatch_daily_stay_reminders():
--    - Only alert on confirmed arrivals (never unpaid 'pending' checkout holds)
--    - Deterministic ordering inside array_agg
--    - Vault-resolved worker URL via trigger_push_delivery_worker() when present
CREATE OR REPLACE FUNCTION public.dispatch_daily_stay_reminders()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, vault
AS $$
DECLARE
  h               record;
  v_local_now     timestamp;
  v_today         date;
  v_tomorrow      date;
  v_hour          integer;
  v_count         integer;
  v_first_guest   text;
  v_first_room    text;
  v_first_booking uuid;
  v_title         text;
  v_message       text;
  v_inserted      integer := 0;
  v_rows          integer := 0;
  v_worker_secret text;
  v_base_url      text;
BEGIN
  FOR h IN
    SELECT id, clerk_org_id, COALESCE(NULLIF(timezone, ''), 'Africa/Accra') AS tz
    FROM public.hotels
    WHERE status = 'active'
      AND clerk_org_id IS NOT NULL
  LOOP
    BEGIN
      v_local_now := now() AT TIME ZONE h.tz;
    EXCEPTION WHEN OTHERS THEN
      v_local_now := now() AT TIME ZONE 'Africa/Accra';
    END;

    v_today := v_local_now::date;
    v_tomorrow := v_today + 1;
    v_hour := EXTRACT(HOUR FROM v_local_now)::integer;

    -- Morning-of departure reminder (07:00-10:59 local hotel time)
    IF v_hour >= 7 AND v_hour < 11 THEN
      WITH departing AS (
        SELECT DISTINCT ON (COALESCE(b.group_id, b.id))
          COALESCE(b.group_id, b.id) AS target_booking_id,
          COALESCE(NULLIF(btrim(g.full_name), ''), 'Guest') AS guest_name,
          COALESCE(NULLIF(btrim(rt.name), ''), 'Room') AS room_name,
          b.created_at AS sort_ts
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
        LEFT JOIN public.room_types rt ON rt.id = b.room_type_id
        WHERE b.hotel_id = h.id
          AND b.check_out = v_today
          AND b.status = 'checked_in'
        ORDER BY COALESCE(b.group_id, b.id), b.created_at
      )
      SELECT count(*)::integer,
             (array_agg(guest_name ORDER BY sort_ts, target_booking_id))[1],
             (array_agg(room_name ORDER BY sort_ts, target_booking_id))[1],
             (array_agg(target_booking_id ORDER BY sort_ts, target_booking_id))[1]
      INTO v_count, v_first_guest, v_first_room, v_first_booking
      FROM departing;

      IF COALESCE(v_count, 0) > 0 THEN
        IF v_count = 1 THEN
          v_title := 'Checking out today — ' || v_first_guest;
          v_message := v_first_room || ' · Scheduled departure today';
        ELSE
          v_title := v_count::text || ' departures scheduled today';
          v_message := v_first_guest || ' and ' || (v_count - 1)::text ||
                       CASE WHEN v_count = 2 THEN ' other guest check out today.' ELSE ' other guests check out today.' END;
          v_first_booking := NULL;
        END IF;

        INSERT INTO public.notifications (
          hotel_id, recipient_staff_id, type, title, message, booking_id, is_read, dedupe_key
        )
        SELECT
          h.id,
          s.id,
          'check_out_reminder',
          v_title,
          v_message,
          v_first_booking,
          false,
          'check-out-reminder:' || v_today::text
        FROM public.staff_profiles s
        WHERE s.clerk_org_id = h.clerk_org_id
          AND s.is_active
          AND COALESCE((s.notification_prefs ->> 'check_out_reminder')::boolean, true) = true
        ON CONFLICT (hotel_id, recipient_staff_id, dedupe_key)
          WHERE recipient_staff_id IS NOT NULL
            AND dedupe_key IS NOT NULL
            AND type IN ('check_in_reminder', 'check_out_reminder', 'staff_access_request')
        DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted := v_inserted + v_rows;
      END IF;
    END IF;

    -- Day-before arrival reminder (09:00-12:59 local hotel time) — confirmed stays only
    IF v_hour >= 9 AND v_hour < 13 THEN
      WITH arriving AS (
        SELECT DISTINCT ON (COALESCE(b.group_id, b.id))
          COALESCE(b.group_id, b.id) AS target_booking_id,
          COALESCE(NULLIF(btrim(g.full_name), ''), 'Guest') AS guest_name,
          COALESCE(NULLIF(btrim(rt.name), ''), 'Room') AS room_name,
          b.created_at AS sort_ts
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
        LEFT JOIN public.room_types rt ON rt.id = b.room_type_id
        WHERE b.hotel_id = h.id
          AND b.check_in = v_tomorrow
          AND b.status = 'confirmed'
        ORDER BY COALESCE(b.group_id, b.id), b.created_at
      )
      SELECT count(*)::integer,
             (array_agg(guest_name ORDER BY sort_ts, target_booking_id))[1],
             (array_agg(room_name ORDER BY sort_ts, target_booking_id))[1],
             (array_agg(target_booking_id ORDER BY sort_ts, target_booking_id))[1]
      INTO v_count, v_first_guest, v_first_room, v_first_booking
      FROM arriving;

      IF COALESCE(v_count, 0) > 0 THEN
        IF v_count = 1 THEN
          v_title := 'Arriving tomorrow — ' || v_first_guest;
          v_message := v_first_room || ' · Check-in ' || to_char(v_tomorrow, 'FMMon DD');
        ELSE
          v_title := v_count::text || ' arrivals tomorrow';
          v_message := v_first_guest || ' and ' || (v_count - 1)::text ||
                       CASE WHEN v_count = 2 THEN ' other guest arrive ' ELSE ' other guests arrive ' END ||
                       to_char(v_tomorrow, 'FMMon DD') || '.';
          v_first_booking := NULL;
        END IF;

        INSERT INTO public.notifications (
          hotel_id, recipient_staff_id, type, title, message, booking_id, is_read, dedupe_key
        )
        SELECT
          h.id,
          s.id,
          'check_in_reminder',
          v_title,
          v_message,
          v_first_booking,
          false,
          'check-in-reminder:' || v_tomorrow::text
        FROM public.staff_profiles s
        WHERE s.clerk_org_id = h.clerk_org_id
          AND s.is_active
          AND COALESCE((s.notification_prefs ->> 'check_in_reminder')::boolean, true) = true
        ON CONFLICT (hotel_id, recipient_staff_id, dedupe_key)
          WHERE recipient_staff_id IS NOT NULL
            AND dedupe_key IS NOT NULL
            AND type IN ('check_in_reminder', 'check_out_reminder', 'staff_access_request')
        DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted := v_inserted + v_rows;
      END IF;
    END IF;
  END LOOP;

  IF v_inserted > 0 THEN
    IF to_regprocedure('public.trigger_push_delivery_worker()') IS NOT NULL THEN
      EXECUTE 'SELECT public.trigger_push_delivery_worker()';
    ELSE
      SELECT ds.decrypted_secret INTO v_worker_secret
      FROM vault.decrypted_secrets ds
      WHERE ds.name = 'push_worker_secret'
      LIMIT 1;

      SELECT ds.decrypted_secret INTO v_base_url
      FROM vault.decrypted_secrets ds
      WHERE ds.name = 'push_worker_base_url'
      LIMIT 1;

      IF (v_base_url IS NULL OR btrim(v_base_url) = '')
         AND EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = 'payment_reconcile_base_url') THEN
        v_base_url := 'https://wtgldgyxtpbzjmaygeif.supabase.co';
      END IF;

      IF v_worker_secret IS NOT NULL AND btrim(v_worker_secret) <> ''
         AND v_base_url IS NOT NULL AND btrim(v_base_url) <> '' THEN
        PERFORM net.http_post(
          url := rtrim(btrim(v_base_url), '/') || '/functions/v1/deliver-push-notifications',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_worker_secret
          ),
          body := '{}'::jsonb
        );
      END IF;
    END IF;
  END IF;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_daily_stay_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_daily_stay_reminders() TO service_role;

COMMIT;
