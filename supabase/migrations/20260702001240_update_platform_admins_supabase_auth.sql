-- ============================================================================
-- Update platform_admins to use Supabase Auth (not Clerk)
--
-- How to add a platform admin after applying this migration:
--   1. Supabase Dashboard → Authentication → Users → "Add user"
--      Enter email + strong password. Copy the UUID shown.
--   2. Run in SQL Editor:
--      INSERT INTO platform_admins (supabase_user_id, email, full_name, role, is_active)
--      VALUES ('<uuid>', 'you@RoomLineprp.com', 'Your Name', 'super_admin', true);
-- ============================================================================

-- Add supabase_user_id column (nullable initially so existing rows don't break)
ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS supabase_user_id uuid;

-- Unique constraint on supabase_user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_admins_supabase_user_id_key'
      AND conrelid = 'public.platform_admins'::regclass
  ) THEN
    ALTER TABLE public.platform_admins
      ADD CONSTRAINT platform_admins_supabase_user_id_key UNIQUE (supabase_user_id);
  END IF;
END $$;

-- Unique constraint on email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_admins_email_key'
      AND conrelid = 'public.platform_admins'::regclass
  ) THEN
    ALTER TABLE public.platform_admins
      ADD CONSTRAINT platform_admins_email_key UNIQUE (email);
  END IF;
END $$;

-- Default role
ALTER TABLE public.platform_admins
  ALTER COLUMN role SET DEFAULT 'admin';

-- Enable RLS (idempotent)
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- RLS policy: platform admins can read only their own row
DROP POLICY IF EXISTS "platform_admins_self_read" ON public.platform_admins;
CREATE POLICY "platform_admins_self_read"
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = supabase_user_id);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_platform_admins_supabase_user_id
  ON public.platform_admins (supabase_user_id);

CREATE INDEX IF NOT EXISTS idx_platform_admins_email
  ON public.platform_admins (email);
