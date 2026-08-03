-- Create platform_admin_audit_logs table
-- Tracks all configuration changes made by platform admins for compliance and troubleshooting

CREATE TABLE IF NOT EXISTS public.platform_admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.platform_admins(id) ON DELETE CASCADE,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g., 'update_bed24_config', 'create_room_mapping', 'force_sync'
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- e.g., 'bed24_config', 'room_mapping', 'bed24_sync'
  entity_id TEXT, -- Optional: specific entity ID (e.g., room_mapping.id)
  before_state JSONB, -- State before the change
  after_state JSONB, -- State after the change
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_admin_id 
  ON public.platform_admin_audit_logs(admin_id);

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_hotel_id 
  ON public.platform_admin_audit_logs(hotel_id);

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_created_at 
  ON public.platform_admin_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_action 
  ON public.platform_admin_audit_logs(action);

-- RLS policies: platform admins can view all audit logs
ALTER TABLE public.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Platform admins can read all audit logs
DROP POLICY IF EXISTS "platform_admins_read_audit_logs" ON public.platform_admin_audit_logs;
CREATE POLICY "platform_admins_read_audit_logs"
  ON public.platform_admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE platform_admins.supabase_user_id = auth.uid()
        AND platform_admins.is_active = true
    )
  );

-- Only allow inserts via service role (backend only)
DROP POLICY IF EXISTS "service_role_insert_audit_logs" ON public.platform_admin_audit_logs;
CREATE POLICY "service_role_insert_audit_logs"
  ON public.platform_admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false); -- Backend will use service role

-- Grant permissions
GRANT SELECT ON public.platform_admin_audit_logs TO authenticated;
GRANT INSERT ON public.platform_admin_audit_logs TO service_role;

-- Add comment
COMMENT ON TABLE public.platform_admin_audit_logs IS 
  'Audit trail for all platform admin actions on hotel integrations and configurations. Provides compliance tracking and troubleshooting history.';
