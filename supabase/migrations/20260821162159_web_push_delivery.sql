CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  device_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_staff_active ON public.push_subscriptions(staff_id) WHERE disabled_at IS NULL;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_self_select ON public.push_subscriptions FOR SELECT TO authenticated
USING (staff_id IN (SELECT id FROM public.staff_profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub')));
CREATE POLICY push_subscriptions_self_insert ON public.push_subscriptions FOR INSERT TO authenticated
WITH CHECK (staff_id IN (SELECT id FROM public.staff_profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub')));
CREATE POLICY push_subscriptions_self_update ON public.push_subscriptions FOR UPDATE TO authenticated
USING (staff_id IN (SELECT id FROM public.staff_profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub')))
WITH CHECK (staff_id IN (SELECT id FROM public.staff_profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub')));
CREATE POLICY push_subscriptions_self_delete ON public.push_subscriptions FOR DELETE TO authenticated
USING (staff_id IN (SELECT id FROM public.staff_profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub')));

CREATE TABLE public.notification_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_staff_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','retry','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id, recipient_staff_id)
);

CREATE INDEX idx_notification_outbox_pending ON public.notification_delivery_outbox(next_attempt_at)
WHERE status IN ('pending','retry');
ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_delivery_outbox FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_notification_push() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.recipient_staff_id IS NOT NULL THEN
    INSERT INTO public.notification_delivery_outbox(notification_id, recipient_staff_id)
    VALUES (NEW.id, NEW.recipient_staff_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER enqueue_notification_push_after_insert
AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_push();
