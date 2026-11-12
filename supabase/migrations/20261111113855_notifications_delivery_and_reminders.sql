-- 1. Partial indexes for fast staff notification feed + unread badge counts
CREATE INDEX IF NOT EXISTS idx_notifications_hotel_active_created
  ON public.notifications (hotel_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_hotel_unread
  ON public.notifications (hotel_id, recipient_staff_id)
  WHERE is_read = false AND archived_at IS NULL;

-- 2. Per-staff dedupe key index for scheduled reminders and targeted idempotent alerts
CREATE UNIQUE INDEX IF NOT EXISTS notifications_staff_dedupe_key_uniq
  ON public.notifications (hotel_id, recipient_staff_id, dedupe_key)
  WHERE recipient_staff_id IS NOT NULL AND dedupe_key IS NOT NULL;

-- 3. Harden push outbox trigger:
--    - Only enqueue push jobs when the recipient actually has an active push subscription
--    - On hotel-wide rows (recipient_staff_id IS NULL), exclude the actor and respect
--      per-staff notification_prefs for toggleable event types
CREATE OR REPLACE FUNCTION public.enqueue_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.recipient_staff_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.push_subscriptions ps
      WHERE ps.staff_id = NEW.recipient_staff_id
        AND ps.disabled_at IS NULL
    ) THEN
      INSERT INTO public.notification_delivery_outbox (notification_id, recipient_staff_id)
      VALUES (NEW.id, NEW.recipient_staff_id)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    INSERT INTO public.notification_delivery_outbox (notification_id, recipient_staff_id)
    SELECT NEW.id, s.id
    FROM public.staff_profiles s
    WHERE s.clerk_org_id = (
      SELECT h.clerk_org_id FROM public.hotels h WHERE h.id = NEW.hotel_id
    )
      AND s.is_active
      AND (NEW.created_by_staff_id IS NULL OR s.id <> NEW.created_by_staff_id)
      AND (
        NEW.type IS NULL
        OR NEW.type IN ('payment_failed', 'channel_conflict', 'test_push')
        OR COALESCE((s.notification_prefs ->> NEW.type)::boolean, true) = true
      )
      AND EXISTS (
        SELECT 1
        FROM public.push_subscriptions ps
        WHERE ps.staff_id = s.id
          AND ps.disabled_at IS NULL
      )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification_push() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_push() TO authenticated, service_role;

-- 4. Fix push_subscriptions RLS initplan re-evaluation advisor warnings
DROP POLICY IF EXISTS push_subscriptions_self_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_select
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    staff_id IN (
      SELECT sp.id
      FROM public.staff_profiles sp
      WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_insert
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    staff_id IN (
      SELECT sp.id
      FROM public.staff_profiles sp
      WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_update ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_update
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    staff_id IN (
      SELECT sp.id
      FROM public.staff_profiles sp
      WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    )
  )
  WITH CHECK (
    staff_id IN (
      SELECT sp.id
      FROM public.staff_profiles sp
      WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    )
  );

DROP POLICY IF EXISTS push_subscriptions_self_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_delete
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (
    staff_id IN (
      SELECT sp.id
      FROM public.staff_profiles sp
      WHERE sp.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')
    )
  );

-- 5. Timezone-aware daily check-in (day-before) and check-out (morning-of) staff reminders
CREATE OR REPLACE FUNCTION public.dispatch_daily_stay_reminders()
RETURNS integer
LANGUAGE plpgsql
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
  v_project_url   text := 'https://wtgldgyxtpbzjmaygeif.supabase.co';
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

    -- Morning-of departure reminder (07:00–10:59 local hotel time)
    IF v_hour >= 7 AND v_hour < 11 THEN
      WITH departing AS (
        SELECT DISTINCT ON (COALESCE(b.group_id, b.id))
          COALESCE(b.group_id, b.id) AS target_booking_id,
          COALESCE(NULLIF(btrim(g.full_name), ''), 'Guest') AS guest_name,
          COALESCE(NULLIF(btrim(rt.name), ''), 'Room') AS room_name
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
        LEFT JOIN public.room_types rt ON rt.id = b.room_type_id
        WHERE b.hotel_id = h.id
          AND b.check_out = v_today
          AND b.status = 'checked_in'
        ORDER BY COALESCE(b.group_id, b.id), b.created_at
      )
      SELECT count(*)::integer,
             (array_agg(guest_name))[1],
             (array_agg(room_name))[1],
             (array_agg(target_booking_id))[1]
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
          WHERE recipient_staff_id IS NOT NULL AND dedupe_key IS NOT NULL
        DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted := v_inserted + v_rows;
      END IF;
    END IF;

    -- Day-before arrival reminder (09:00–12:59 local hotel time)
    IF v_hour >= 9 AND v_hour < 13 THEN
      WITH arriving AS (
        SELECT DISTINCT ON (COALESCE(b.group_id, b.id))
          COALESCE(b.group_id, b.id) AS target_booking_id,
          COALESCE(NULLIF(btrim(g.full_name), ''), 'Guest') AS guest_name,
          COALESCE(NULLIF(btrim(rt.name), ''), 'Room') AS room_name
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
        LEFT JOIN public.room_types rt ON rt.id = b.room_type_id
        WHERE b.hotel_id = h.id
          AND b.check_in = v_tomorrow
          AND b.status IN ('confirmed', 'pending')
        ORDER BY COALESCE(b.group_id, b.id), b.created_at
      )
      SELECT count(*)::integer,
             (array_agg(guest_name))[1],
             (array_agg(room_name))[1],
             (array_agg(target_booking_id))[1]
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
          WHERE recipient_staff_id IS NOT NULL AND dedupe_key IS NOT NULL
        DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted := v_inserted + v_rows;
      END IF;
    END IF;
  END LOOP;

  IF v_inserted > 0 THEN
    SELECT decrypted_secret INTO v_worker_secret
    FROM vault.decrypted_secrets
    WHERE name = 'push_worker_secret'
    LIMIT 1;

    IF v_worker_secret IS NOT NULL AND btrim(v_worker_secret) <> '' THEN
      PERFORM net.http_post(
        url := v_project_url || '/functions/v1/deliver-push-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_worker_secret
        ),
        body := '{}'::jsonb
      );
    END IF;
  END IF;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_daily_stay_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_daily_stay_reminders() TO service_role;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'dispatch-daily-stay-reminders';
  IF v_count > 0 THEN
    PERFORM cron.unschedule('dispatch-daily-stay-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'dispatch-daily-stay-reminders',
  '15 * * * *',
  $$SELECT public.dispatch_daily_stay_reminders();$$
);
