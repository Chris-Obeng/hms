-- Trigger functions require EXECUTE privilege for any role whose DML fires
-- them. Staff-scoped notifications inserts run as `authenticated`, so the
-- blanket PUBLIC revoke in the previous migration would have broken them.
GRANT EXECUTE ON FUNCTION public.enqueue_notification_push() TO authenticated;