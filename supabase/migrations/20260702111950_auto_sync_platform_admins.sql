-- ============================================================================
-- Auto-sync platform admins from auth.users + remove stale Clerk dependency
-- ============================================================================

-- Step 1: Drop policies that depend on clerk_user_id
DROP POLICY IF EXISTS "platform_admins_self_access" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admin_full_access" ON public.hotels;

-- Step 2: Drop clerk_user_id column (dependencies now removed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_admins'
      AND column_name = 'clerk_user_id'
  ) THEN
    ALTER TABLE public.platform_admins DROP COLUMN clerk_user_id;
  END IF;
END $$;

-- Step 3: Recreate self-access RLS using supabase_user_id (Supabase Auth uid)
DROP POLICY IF EXISTS "platform_admins_self_read" ON public.platform_admins;
CREATE POLICY "platform_admins_self_read"
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = supabase_user_id AND is_active = true);

-- Step 4: Auto-sync trigger — new auth.users row → platform_admins row
CREATE OR REPLACE FUNCTION public.handle_new_platform_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_admins (supabase_user_id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'admin',
    false  -- requires explicit activation by a super_admin
  )
  ON CONFLICT (supabase_user_id) DO NOTHING;  -- idempotent
  RETURN NEW;
END;
$$;

-- Revoke from public roles (SECURITY DEFINER function must not be callable via REST/anon)
REVOKE EXECUTE ON FUNCTION public.handle_new_platform_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_platform_admin() FROM anon, authenticated;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_platform_admin();
