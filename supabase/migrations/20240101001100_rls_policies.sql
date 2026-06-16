-- ============================================================================
-- Row Level Security: org isolation for every hotel-scoped table
--
-- Hotel-scoped tables (hotel_id FK): use get_user_hotel_ids()
-- staff_profiles (uses clerk_org_id, not hotel_id): use get_user_clerk_org_ids()
-- platform_admins: self-access (admin can only see their own row)
--
-- The service role key bypasses RLS automatically — webhook handlers and
-- server-to-server writes using SUPABASE_SERVICE_ROLE_KEY are unaffected.
-- ============================================================================

-- Helper: enable RLS idempotently (no IF NOT EXISTS for ALTER TABLE)
DO $$ BEGIN
  ALTER TABLE public.hotels                 ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.staff_profiles         ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.room_types             ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.rooms                  ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.guests                 ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.bookings               ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payments               ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.availability_blocks    ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.beds24_property_mappings ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.beds24_sync_log        ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.audit_logs             ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.platform_admins        ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Helper: drop-then-create policy
-- (Postgres has no CREATE POLICY IF NOT EXISTS, so this is the standard
-- pattern.)

-- --------------------------------------------------------------------------
-- hotels — staff can read+update their own hotel
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "hotels_org_isolation" ON public.hotels;
CREATE POLICY "hotels_org_isolation"
  ON public.hotels
  FOR ALL
  USING (id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (id IN (SELECT public.get_user_hotel_ids()));

-- --------------------------------------------------------------------------
-- staff_profiles — uses clerk_org_id (not hotel_id)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_profiles_org_isolation" ON public.staff_profiles;
CREATE POLICY "staff_profiles_org_isolation"
  ON public.staff_profiles
  FOR ALL
  USING (clerk_org_id IN (SELECT public.get_user_clerk_org_ids()))
  WITH CHECK (clerk_org_id IN (SELECT public.get_user_clerk_org_ids()));

-- --------------------------------------------------------------------------
-- All other hotel-scoped tables: hotel_id IN (SELECT get_user_hotel_ids())
-- --------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'room_types', 'rooms', 'guests', 'bookings', 'payments',
    'availability_blocks', 'notifications',
    'beds24_property_mappings', 'beds24_sync_log', 'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_org_isolation ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_org_isolation ON public.%I FOR ALL '
      'USING (hotel_id IN (SELECT public.get_user_hotel_ids())) '
      'WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()))',
      t, t
    );
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- platform_admins — only the platform admin can see their own row
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "platform_admins_self_access" ON public.platform_admins;
CREATE POLICY "platform_admins_self_access"
  ON public.platform_admins
  FOR ALL
  USING (
    clerk_user_id = (auth.jwt() ->> 'sub')
    AND is_active = true
  )
  WITH CHECK (clerk_user_id = (auth.jwt() ->> 'sub'));
