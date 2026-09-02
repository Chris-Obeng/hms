-- =============================================================================
-- Reconcile the rate tables with production, and repair the search_path defect.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The production database diverged from `20260711080000_seasonal_and_daily_rates.sql`.
-- That file is NOT an accurate description of the live schema and must not be
-- trusted when reasoning about it. Verified differences (read-only queries, 2026-08-30):
--
--   * `seasonal_rates` has NO `no_overlapping_seasons` EXCLUDE constraint remotely.
--   * `seasonal_rate_overrides.id` / `daily_rate_overrides.id` are uuid remotely,
--     not the `bigint GENERATED ALWAYS AS IDENTITY` the old file declares.
--   * `seasonal_rate_overrides` has NO `hotel_id` column remotely.
--   * All foreign keys on the two override tables are single-column, not composite.
--   * The price CHECK constraints admit 0 remotely (`>= 0`), not `> 0`, and carry
--     Postgres-generated names rather than the `check_*` names in that file.
--   * `room_types` carries two byte-identical UNIQUE (hotel_id, slug) constraints.
--
-- This migration is the reconciliation point: from here forward the migration
-- history and the live schema agree. It is written to be safe to run against
-- production AND against a freshly reset local database, so every statement is
-- idempotent and tolerates either shape.
--
-- It also repairs a latent security defect described in section 5.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop the season-overlap EXCLUDE constraint.
--
-- No-op remotely (it was never applied); meaningful after a local `db reset`,
-- which would otherwise replay it. Overlapping seasons become legal by design:
-- a later phase introduces a `priority` column so a short high-priority season
-- (a conference week) can sit inside a long low-priority one (summer). Only
-- overlap at the *same* priority is ambiguous, and that is enforced then by a
-- partial EXCLUDE, not by this blanket one.
-- -----------------------------------------------------------------------------
ALTER TABLE public.seasonal_rates DROP CONSTRAINT IF EXISTS no_overlapping_seasons;

-- -----------------------------------------------------------------------------
-- 2. Composite unique keys that later phases depend on.
--
-- Tenant-scoped foreign keys of the form
--   FOREIGN KEY (room_type_id, hotel_id) REFERENCES room_types (id, hotel_id)
-- require a matching unique constraint on the referenced side. Without these
-- two keys the migrations that add those FKs fail at `db push`. They are also
-- valuable on their own: they make it structurally impossible for a child row
-- to point at a parent belonging to a different hotel.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.room_types
    ADD CONSTRAINT room_types_id_hotel_id_key UNIQUE (id, hotel_id);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.seasonal_rates
    ADD CONSTRAINT seasonal_rates_id_hotel_id_key UNIQUE (id, hotel_id);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Remove the duplicate slug uniqueness on room_types.
--
-- `room_types_hotel_id_slug_key` and `room_types_hotel_id_slug_unique` are the
-- same constraint written twice, so every insert maintains two identical btree
-- indexes and error messages are non-deterministic between them. Keep the
-- `_key` name (the Postgres default, which the initial schema created) and drop
-- the hand-named duplicate.
-- -----------------------------------------------------------------------------
ALTER TABLE public.room_types DROP CONSTRAINT IF EXISTS room_types_hotel_id_slug_unique;

-- -----------------------------------------------------------------------------
-- 4. Prices must be strictly positive.
--
-- A rate of 0 is not a discount, it is a free room. It is never a legitimate
-- authored value: a complimentary stay is modelled as a normal rate plus a
-- 100% discount so the revenue report still shows what was given away.
-- Downstream channel distribution also rejects it outright — Channex requires
-- the `rate` field to be a positive integer in the currency's smallest unit.
--
-- Verified before writing this: zero rows in either table are priced 0, so
-- both constraints validate without a data migration.
--
-- Both the remote (Postgres-generated) and local (`check_*`) constraint names
-- are dropped so this works from either starting point.
-- -----------------------------------------------------------------------------
ALTER TABLE public.daily_rate_overrides
  DROP CONSTRAINT IF EXISTS daily_rate_overrides_price_check,
  DROP CONSTRAINT IF EXISTS check_daily_price;

DO $$
BEGIN
  ALTER TABLE public.daily_rate_overrides
    ADD CONSTRAINT daily_rate_overrides_price_positive CHECK (price > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.seasonal_rate_overrides
  DROP CONSTRAINT IF EXISTS seasonal_rate_overrides_base_price_check,
  DROP CONSTRAINT IF EXISTS check_seasonal_base_price,
  DROP CONSTRAINT IF EXISTS seasonal_rate_overrides_weekend_price_check,
  DROP CONSTRAINT IF EXISTS check_seasonal_weekend_price;

DO $$
BEGIN
  ALTER TABLE public.seasonal_rate_overrides
    ADD CONSTRAINT seasonal_rate_overrides_base_price_positive CHECK (base_price > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.seasonal_rate_overrides
    ADD CONSTRAINT seasonal_rate_overrides_weekend_price_positive
      CHECK (weekend_price IS NULL OR weekend_price > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Repair the `search_path` quoting defect on public functions.
--
-- THE BUG
-- -------
-- `20260823134958_harden_public_functions_and_counters.sql` and five later
-- migrations pin the search path with a *string literal*:
--
--     ALTER FUNCTION public.foo() SET search_path = 'public, extensions';
--
-- `search_path` is declared GUC_LIST_INPUT | GUC_LIST_QUOTE, so Postgres runs a
-- String constant through `quote_identifier` before storing it. The stored value
-- is therefore `search_path="public, extensions"` — ONE double-quoted identifier.
-- `check_search_path` then splits it with `SplitIdentifierString`, which sees a
-- single schema literally named `public, extensions`. No such schema exists, and
-- `recomputeNamespacePath` silently skips missing schemas rather than erroring.
--
-- Net effect: the intent was "pin the path to public and extensions", the result
-- was "the effective search path is the implicit pg_catalog and nothing else".
-- Twelve production functions carry this value, ten of them SECURITY DEFINER.
--
-- WHY NOTHING IS BROKEN TODAY
-- ---------------------------
-- Every affected body happens to schema-qualify every reference. This was
-- verified, not assumed: a scan of `pg_proc.prosrc` for schema-less identifiers
-- after FROM/JOIN/UPDATE/INTO returned only PL/pgSQL variables, CTE names and
-- `SKIP LOCKED`, and a second scan confirmed no bare `http_post`,
-- `decrypted_secrets` or extension-function calls anywhere. The defect is
-- latent: the first unqualified reference anyone adds to any of these bodies
-- fails at runtime with "relation does not exist", and until then ten
-- SECURITY DEFINER functions run with no pinned path at all.
--
-- THE FIX
-- -------
-- Re-issue the setting as an unqualified identifier list, which is what the
-- GUC parser expects. This loop repairs whatever carries the defect rather than
-- naming twelve signatures, so it also self-heals a fresh local `db reset`,
-- where the six offending migrations replay the same broken value.
--
-- The repaired path preserves each function's original declared intent as a
-- strict superset (`pg_catalog` first, then the schemas the author listed), so
-- it cannot narrow anything that works today. Neither `public` (PG15+ revokes
-- CREATE from PUBLIC) nor `extensions` (owned by supabase_admin) is writable by
-- application roles, so neither is a search_path hijacking vector.
--
-- Deliberately NOT touched:
--   * `search_path=""` — the intentional empty path on the booking-reference
--     generators, which fully qualify everything and want no path at all.
--   * a quoted value that names one schema that really exists (a mixed-case or
--     reserved-word schema), which is correct quoting rather than a defect.
-- -----------------------------------------------------------------------------
DO $repair$
DECLARE
  r         record;
  v_inner   text;
  v_schemas text[];
  v_final   text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           cfg                       AS setting
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'              -- plain functions only; no procedures carry proconfig here
       AND cfg LIKE 'search_path=%"%'   -- a quote in the value means it was stored as one identifier
     ORDER BY 1
  LOOP
    v_inner := btrim(btrim(split_part(r.setting, '=', 2)), '"');

    CONTINUE WHEN v_inner = '';

    CONTINUE WHEN EXISTS (SELECT 1 FROM pg_namespace ns WHERE ns.nspname = v_inner);

    SELECT array_agg(btrim(t.raw) ORDER BY t.ord)
      INTO v_schemas
      FROM unnest(string_to_array(v_inner, ',')) WITH ORDINALITY AS t(raw, ord)
     WHERE btrim(t.raw) ~ '^[a-z_][a-z0-9_]*$'
       AND btrim(t.raw) <> 'pg_catalog'
       AND EXISTS (SELECT 1 FROM pg_namespace ns WHERE ns.nspname = btrim(t.raw));

    IF v_schemas IS NULL THEN
      -- Nothing resolvable to pin to. Leave the function exactly as it is and
      -- make the skip loud rather than pretending the repair happened.
      RAISE WARNING 'search_path repair skipped for % (no resolvable schema in %)', r.sig, r.setting;
      CONTINUE;
    END IF;

    v_final := 'pg_catalog, ' || array_to_string(v_schemas, ', ');

    EXECUTE format('ALTER FUNCTION %s SET search_path = %s', r.sig, v_final);

    RAISE NOTICE 'search_path repaired on %: % becomes %', r.sig, r.setting, v_final;
  END LOOP;
END
$repair$;

-- -----------------------------------------------------------------------------
-- 6. Require manager-or-above to author rates.
--
-- THE GAP
-- -------
-- All twelve existing policies on the three rate tables grant plain
-- `authenticated` with tenant isolation but NO role gate. Tenant isolation
-- itself is intact — verified against `pg_policies`, every policy funnels
-- through `public.get_user_hotel_ids()`, and there is no cross-tenant leak.
-- What is missing is authority: `requireMinRole("manager", …)` lives only in
-- the server actions, so any authenticated staff member — a front-desk agent
-- included — can rewrite this hotel's prices by calling PostgREST directly with
-- their own session token and bypassing the app layer entirely.
--
-- Rates are the revenue surface of the business. The database has to enforce
-- who may change them, not just the UI that usually does.
--
-- THE SHAPE
-- ---------
-- RESTRICTIVE policies AND with the existing permissive ones, so tenant
-- isolation still applies and this adds a second, independent condition.
-- Applied to INSERT/UPDATE/DELETE only: reading rates stays open to all staff
-- of the hotel, because the front desk has to quote a price to take a booking.
--
-- `seasonal_rate_overrides` has no `hotel_id` column, so its owning hotel is
-- reached through the parent season — the same indirection its existing
-- permissive policies already use.
--
-- Follows the house pattern established in
-- `20260824150411_harden_rls_role_gates_and_payment_attribution.sql`.
-- -----------------------------------------------------------------------------

-- seasonal_rates -------------------------------------------------------------
DROP POLICY IF EXISTS seasonal_rates_insert_requires_manager ON public.seasonal_rates;
CREATE POLICY seasonal_rates_insert_requires_manager
  ON public.seasonal_rates AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

DROP POLICY IF EXISTS seasonal_rates_update_requires_manager ON public.seasonal_rates;
CREATE POLICY seasonal_rates_update_requires_manager
  ON public.seasonal_rates AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]))
  WITH CHECK (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

DROP POLICY IF EXISTS seasonal_rates_delete_requires_manager ON public.seasonal_rates;
CREATE POLICY seasonal_rates_delete_requires_manager
  ON public.seasonal_rates AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

-- daily_rate_overrides -------------------------------------------------------
DROP POLICY IF EXISTS daily_rate_overrides_insert_requires_manager ON public.daily_rate_overrides;
CREATE POLICY daily_rate_overrides_insert_requires_manager
  ON public.daily_rate_overrides AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

DROP POLICY IF EXISTS daily_rate_overrides_update_requires_manager ON public.daily_rate_overrides;
CREATE POLICY daily_rate_overrides_update_requires_manager
  ON public.daily_rate_overrides AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]))
  WITH CHECK (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

DROP POLICY IF EXISTS daily_rate_overrides_delete_requires_manager ON public.daily_rate_overrides;
CREATE POLICY daily_rate_overrides_delete_requires_manager
  ON public.daily_rate_overrides AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin'::text, 'manager'::text]));

-- seasonal_rate_overrides (hotel reached through the parent season) -----------
DROP POLICY IF EXISTS seasonal_rate_overrides_insert_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_insert_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_staff_role(
      (SELECT sr.hotel_id FROM public.seasonal_rates sr WHERE sr.id = seasonal_rate_id),
      ARRAY['super_admin'::text, 'manager'::text]
    )
  );

DROP POLICY IF EXISTS seasonal_rate_overrides_update_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_update_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.user_has_staff_role(
      (SELECT sr.hotel_id FROM public.seasonal_rates sr WHERE sr.id = seasonal_rate_id),
      ARRAY['super_admin'::text, 'manager'::text]
    )
  )
  WITH CHECK (
    public.user_has_staff_role(
      (SELECT sr.hotel_id FROM public.seasonal_rates sr WHERE sr.id = seasonal_rate_id),
      ARRAY['super_admin'::text, 'manager'::text]
    )
  );

DROP POLICY IF EXISTS seasonal_rate_overrides_delete_requires_manager ON public.seasonal_rate_overrides;
CREATE POLICY seasonal_rate_overrides_delete_requires_manager
  ON public.seasonal_rate_overrides AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    public.user_has_staff_role(
      (SELECT sr.hotel_id FROM public.seasonal_rates sr WHERE sr.id = seasonal_rate_id),
      ARRAY['super_admin'::text, 'manager'::text]
    )
  );

-- -----------------------------------------------------------------------------
-- 7. Record the reconciliation on the table itself.
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.seasonal_rates IS
  'Date-ranged rate seasons. The live schema of this table and its two override '
  'tables diverged from 20260711080000_seasonal_and_daily_rates.sql; do not read '
  'that file as a description of production. 20260830163000_reconcile_rate_table_drift.sql '
  'is the reconciliation point — migration history and the live schema agree from '
  'there forward. Seasons are permitted to overlap; a later migration adds a '
  'priority column and forbids overlap only at equal priority.';
