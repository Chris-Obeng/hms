-- payments_paystack_reference_key -- bring a fresh local database into line with
-- production.
--
-- The live payments table has carried a UNIQUE constraint on paystack_reference
-- named payments_paystack_reference_key since before this repository held any
-- migrations: the production table was created with an inline `unique`, which
-- Postgres auto-named. 20231231235959_initial_schema.sql was written to be a
-- no-op there -- every CREATE is IF NOT EXISTS -- so the column it declares on a
-- fresh database is a plain `text` carrying no constraint at all.
--
-- That difference stayed invisible until 20260824023558_harden_payment_idempotency
-- dropped the redundant payments_paystack_reference_unique that 20240101000800
-- had added and put a COMMENT on payments_paystack_reference_key instead. On the
-- hosted project that comment lands on a constraint that exists. On a fresh
-- `supabase db reset` there was nothing to comment on and the reset failed, which
-- is why this slot sits where it does: after 800, and long before the hardening.
--
-- The guard is what makes one file correct against both databases. Locally the
-- constraint is absent and is created. On the hosted project it is already there,
-- and ADD CONSTRAINT reports that in one of two ways depending on which name
-- collides first -- duplicate_object for the constraint, duplicate_table for the
-- unique index backing it -- so both are swallowed. Without this guard
-- `supabase db push` would abort here, on a constraint production has held all
-- along.
--
-- Keep this file. It is not scaffolding: delete it and `supabase db reset` stops
-- reproducing production.

DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_paystack_reference_key
    UNIQUE (paystack_reference);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
