-- ============================================================================
-- Extensions
-- pgcrypto: required for gen_random_uuid() (Supabase has this by default)
-- pg_trgm:  trigram indexes for fuzzy guest search (name/email/phone)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
