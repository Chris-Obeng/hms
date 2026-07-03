-- Expose platform_admins to the Data API so generated TypeScript types include it.
-- RLS is already enabled — authenticated users can only read their own row.
-- The service role (supabaseAdmin) bypasses RLS entirely and has full access.

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT SELECT ON public.platform_admins TO anon;
