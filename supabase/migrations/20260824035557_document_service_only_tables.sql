COMMENT ON TABLE public.notification_delivery_outbox IS
  'Service-role-only delivery outbox for web push. RLS enabled with no policies = deny-all for anon/authenticated; the deliver-push-notifications edge function writes via SUPABASE_SERVICE_ROLE_KEY. Do not add policies without review.';

COMMENT ON TABLE public.staff_invitations IS
  'Service-role-only pending staff invitations. RLS enabled with no policies = deny-all for anon/authenticated; consumed via SUPABASE_SERVICE_ROLE_KEY during invite acceptance. Do not add policies without review.';
