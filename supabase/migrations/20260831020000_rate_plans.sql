-- Rate plans and occupancy-aware pricing (additive re-key).
--
-- Today a room type has exactly one sellable price: room_types.base_price with an
-- optional weekend_price, layered over by seasonal_rate_overrides and
-- daily_rate_overrides. That model cannot express "Room Only" at one price and
-- "Bed & Breakfast" at another for the same room, and it has no notion of
-- per-person pricing. Both are table stakes for selling through a channel
-- manager (Channex is the intended integration) and both have value on day one
-- for direct bookings.
--
-- public.rate_plans is modelled on the Channex rate-plan entity so the later
-- mapping is a copy rather than a translation. Verified against
-- docs.channex.io/api-v.1-documentation/rate-plans-collection: one room type per
-- plan, sell_mode per_room|per_person, rate_mode manual|derived|auto|cascade,
-- derived rules as [rule, argument] pairs, auto_rate_settings mandatory when
-- rate_mode = 'auto', and a 23-value meal_type vocabulary (Channex's own
-- spelling "carribean_breakfast" is kept verbatim so no translation is needed).
--
-- This migration is deliberately additive. New columns sit beside the old ones,
-- the legacy uniques stay in place, and nothing is dropped. Dropping
-- unique_room_type_date, unique_seasonal_rate_room_type and the numeric price
-- columns is a separate migration that must not ship until the application has
-- been reading and writing the new columns in production for at least one
-- release. Until the legacy uniques go, a room type still cannot hold two
-- different prices for the same date across two plans — the schema is ready for
-- multi-plan pricing, the constraint set is not yet.
--
-- Money is stored twice on purpose: the existing numeric(10,2) columns stay as
-- the source of truth for this release, and new *_minor bigint columns carry the
-- same amount in the currency's smallest unit. lib/money.ts is the reference
-- implementation; public.currency_exponent below mirrors its exception table and
-- Postgres round(numeric) is already half-away-from-zero, which is exactly what
-- roundHalfUpAway does, so the two agree by construction. The minor columns also
-- fix a latent defect for three-decimal currencies (BHD, KWD, ...) that
-- numeric(10,2) cannot represent at all.

-- ── Money helpers ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.currency_exponent(p_currency text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Mirrors CURRENCY_EXPONENT in lib/money.ts: only the exceptions are listed,
  -- everything else is the ISO 4217 default of two decimal places.
  SELECT CASE
    WHEN upper(coalesce(p_currency, 'GHS')) IN (
      'BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW',
      'PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF'
    ) THEN 0
    WHEN upper(coalesce(p_currency, 'GHS')) IN (
      'BHD','IQD','JOD','KWD','LYD','OMR','TND'
    ) THEN 3
    ELSE 2
  END;
$$;

COMMENT ON FUNCTION public.currency_exponent(text) IS
  'ISO 4217 minor-unit exponent for a currency code. Mirrors CURRENCY_EXPONENT in lib/money.ts; defaults to 2 for unlisted codes.';

CREATE OR REPLACE FUNCTION public.to_minor(p_amount numeric, p_currency text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  -- 10::numeric ^ exponent stays exact; power() would route through double
  -- precision. round(numeric) is half-away-from-zero, matching roundHalfUpAway.
  SELECT round(p_amount * (10::numeric ^ public.currency_exponent(p_currency)))::bigint;
$$;

COMMENT ON FUNCTION public.to_minor(numeric, text) IS
  'Converts a major-unit amount to the currency''s smallest unit. STRICT: NULL in, NULL out. Matches toMinor() in lib/money.ts.';

CREATE OR REPLACE FUNCTION public.hotel_currency(p_hotel_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_currency text;
BEGIN
  SELECT h.currency INTO v_currency FROM public.hotels h WHERE h.id = p_hotel_id;
  IF NOT FOUND THEN
    -- Guessing a currency here would silently produce wrong minor amounts, so
    -- refuse instead. Callers only ever pass a hotel_id that a foreign key
    -- already guarantees exists; a miss means RLS hid the row.
    RAISE EXCEPTION 'hotel % not found or not visible', p_hotel_id
      USING ERRCODE = 'no_data_found';
  END IF;
  -- hotels.currency is nullable; DEFAULT_CURRENCY in lib/money.ts is GHS.
  RETURN coalesce(v_currency, 'GHS');
END;
$$;

COMMENT ON FUNCTION public.hotel_currency(uuid) IS
  'Currency code for a hotel, falling back to GHS when unset. Raises no_data_found when the hotel is absent or invisible.';

REVOKE ALL ON FUNCTION public.currency_exponent(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.to_minor(numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotel_currency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.currency_exponent(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.to_minor(numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotel_currency(uuid) TO authenticated, service_role;

-- ── rate_plans ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_plans (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  hotel_id            uuid        NOT NULL,
  room_type_id        uuid        NOT NULL,
  title               text        NOT NULL,
  code                text        NOT NULL,
  sell_mode           text        NOT NULL DEFAULT 'per_room',
  rate_mode           text        NOT NULL DEFAULT 'manual',
  parent_rate_plan_id uuid,
  derived_rules       jsonb,
  auto_rate_settings  jsonb,
  meal_type           text        NOT NULL DEFAULT 'none',
  currency            text,
  is_default          boolean     NOT NULL DEFAULT false,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rate_plans_pkey PRIMARY KEY (id),

  -- Composite uniques so the child tables can carry (child_id, hotel_id) foreign
  -- keys in the house style: a row can never point at another hotel's plan.
  CONSTRAINT rate_plans_id_hotel_id_key UNIQUE (id, hotel_id),

  CONSTRAINT rate_plans_hotel_id_fkey FOREIGN KEY (hotel_id)
    REFERENCES public.hotels (id) ON DELETE CASCADE,
  CONSTRAINT rate_plans_room_type_fk FOREIGN KEY (room_type_id, hotel_id)
    REFERENCES public.room_types (id, hotel_id) ON DELETE CASCADE,
  -- A column list is required here: plain ON DELETE SET NULL would also null
  -- hotel_id, which is NOT NULL, and every parent deletion would fail.
  CONSTRAINT rate_plans_parent_fk FOREIGN KEY (parent_rate_plan_id, hotel_id)
    REFERENCES public.rate_plans (id, hotel_id) ON DELETE SET NULL (parent_rate_plan_id),

  -- Channex requires a plan title to be unique within a property. Enforcing it
  -- per room type instead keeps "Bed & Breakfast" usable on every room type; the
  -- Channex mapping in a later phase qualifies the title with the room type
  -- name, which is unique per property because this pair is.
  CONSTRAINT rate_plans_hotel_room_type_title_key UNIQUE (hotel_id, room_type_id, title),
  CONSTRAINT rate_plans_hotel_room_type_code_key  UNIQUE (hotel_id, room_type_id, code),

  CONSTRAINT rate_plans_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 255),
  CONSTRAINT rate_plans_code_format  CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  CONSTRAINT rate_plans_sell_mode_valid CHECK (sell_mode IN ('per_room', 'per_person')),
  CONSTRAINT rate_plans_rate_mode_valid CHECK (rate_mode IN ('manual', 'derived', 'auto', 'cascade')),
  CONSTRAINT rate_plans_meal_type_valid CHECK (meal_type IN (
    'none','all_inclusive','breakfast','lunch','dinner','american',
    'bed_and_breakfast','buffet_breakfast','carribean_breakfast',
    'continental_breakfast','english_breakfast','european_plan','family_plan',
    'full_board','full_breakfast','half_board','room_only','self_catering',
    'bermuda','dinner_bed_and_breakfast_plan','family_american',
    'breakfast_and_lunch','lunch_and_dinner'
  )),
  CONSTRAINT rate_plans_currency_format CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CONSTRAINT rate_plans_no_self_parent CHECK (parent_rate_plan_id IS NULL OR parent_rate_plan_id <> id),
  -- Channex derives the rate from the parent plan, so there has to be one.
  CONSTRAINT rate_plans_derived_needs_parent CHECK (
    rate_mode NOT IN ('derived', 'cascade') OR parent_rate_plan_id IS NOT NULL
  ),
  -- Channex rejects rate_mode 'auto' without auto_rate_settings.
  CONSTRAINT rate_plans_auto_needs_settings CHECK (
    rate_mode <> 'auto' OR auto_rate_settings IS NOT NULL
  )
);

COMMENT ON TABLE public.rate_plans IS
  'Sellable rate plans, one per room type per plan (Channex rate-plan shape). Every room type has exactly one is_default plan; overrides and ARI hang off a plan, not off the room type.';
COMMENT ON COLUMN public.rate_plans.code IS
  'Stable short identifier used in URLs, imports and channel mappings. Unique per room type, not per hotel, so every room type can carry the same STD/BB codes.';
COMMENT ON COLUMN public.rate_plans.currency IS
  'Per-plan ISO 4217 override. NULL inherits hotels.currency, which is the normal case; Channex allows a plan to sell in a different currency than the property.';
COMMENT ON COLUMN public.rate_plans.derived_rules IS
  'Channex derived-rule pairs applied left to right, e.g. {"rate": [["increase_by_percent","5"],["increase_by_amount","12.00"]]}. Only meaningful when rate_mode is derived or cascade.';
COMMENT ON COLUMN public.rate_plans.auto_rate_settings IS
  'Channex auto-rate configuration. Mandatory when rate_mode = ''auto'', enforced by rate_plans_auto_needs_settings.';
COMMENT ON COLUMN public.rate_plans.is_default IS
  'The plan that unqualified pricing falls back to. Exactly one per room type (rate_plans_one_default_per_room_type). Deleting it would orphan every override write for that room type, so the UI must not offer it.';

CREATE INDEX IF NOT EXISTS idx_rate_plans_hotel_id ON public.rate_plans (hotel_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_room_type_id ON public.rate_plans (room_type_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_parent ON public.rate_plans (parent_rate_plan_id)
  WHERE parent_rate_plan_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rate_plans_one_default_per_room_type
  ON public.rate_plans (room_type_id) WHERE is_default;

DROP TRIGGER IF EXISTS handle_rate_plans_updated_at ON public.rate_plans;
CREATE TRIGGER handle_rate_plans_updated_at
  BEFORE UPDATE ON public.rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Rate plans decide what a guest is charged, so they follow the access-control
-- shape of the pricing tables (seasonal_rates, daily_rate_overrides): one
-- permissive tenant-isolation policy for all commands, plus restrictive manager
-- gates on the three write commands. That is deliberately stricter than the
-- delete-only gate on room_types.

ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_plans_org_isolation ON public.rate_plans;
CREATE POLICY rate_plans_org_isolation ON public.rate_plans
  USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));

DROP POLICY IF EXISTS rate_plans_insert_requires_manager ON public.rate_plans;
CREATE POLICY rate_plans_insert_requires_manager ON public.rate_plans
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_has_staff_role(hotel_id, ARRAY['super_admin', 'manager']));

DROP POLICY IF EXISTS rate_plans_update_requires_manager ON public.rate_plans;
CREATE POLICY rate_plans_update_requires_manager ON public.rate_plans
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin', 'manager']))
  WITH CHECK (public.user_has_staff_role(hotel_id, ARRAY['super_admin', 'manager']));

DROP POLICY IF EXISTS rate_plans_delete_requires_manager ON public.rate_plans;
CREATE POLICY rate_plans_delete_requires_manager ON public.rate_plans
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_staff_role(hotel_id, ARRAY['super_admin', 'manager']));

-- Table privileges are what RLS then filters. On the hosted project these arrive
-- from Supabase default privileges, but a database rebuilt from migrations alone
-- does not get them, so state them explicitly. The public booking funnel reads
-- through the service-role client, so anon needs nothing here.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_plans TO service_role;

-- ── Every room type gets a default plan ───────────────────────────────────────
-- Backfill first, then keep the invariant in the database. An application-level
-- guarantee would not survive seed scripts, SQL run through the dashboard, or a
-- future channel import, and Phase 5 goes on to make rate_plan_id NOT NULL on
-- the override tables, so a room type without a plan becomes unwritable.

INSERT INTO public.rate_plans (hotel_id, room_type_id, title, code, is_default)
SELECT rt.hotel_id, rt.id, 'Standard', 'STD', true
FROM public.room_types rt
WHERE NOT EXISTS (
  SELECT 1 FROM public.rate_plans rp
  WHERE rp.room_type_id = rt.id AND rp.is_default
);

CREATE OR REPLACE FUNCTION public.ensure_default_rate_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- SECURITY DEFINER on purpose: creating a room type is not manager-gated, but
  -- writing a rate plan is. Without it, a front-desk user adding a room type
  -- would trip rate_plans_insert_requires_manager and lose the room type too.
  INSERT INTO public.rate_plans (hotel_id, room_type_id, title, code, is_default)
  VALUES (NEW.hotel_id, NEW.id, 'Standard', 'STD', true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_default_rate_plan() IS
  'Creates the STD/Standard default rate plan for a newly inserted room type. ON CONFLICT DO NOTHING so an explicit plan supplied in the same transaction wins.';

-- EXECUTE on a trigger function is checked when the trigger is created, not when
-- it fires, so revoking here does not stop the trigger.
REVOKE ALL ON FUNCTION public.ensure_default_rate_plan() FROM PUBLIC;

DROP TRIGGER IF EXISTS ensure_default_rate_plan ON public.room_types;
CREATE TRIGGER ensure_default_rate_plan
  AFTER INSERT ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.ensure_default_rate_plan();

-- Deleting a parent plan runs the composite FK's ON DELETE SET NULL, which is a
-- normal UPDATE and therefore re-checks rate_plans_derived_needs_parent. Without
-- this trigger, deleting a plan that has a derived or cascade child fails with a
-- check violation naming a different row. Demoting the children first makes the
-- delete well defined: they keep their own prices as independent manual plans.
CREATE OR REPLACE FUNCTION public.demote_derived_rate_plan_children()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.rate_plans
     SET rate_mode     = 'manual',
         derived_rules = NULL
   WHERE parent_rate_plan_id = OLD.id
     AND rate_mode IN ('derived', 'cascade');
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.demote_derived_rate_plan_children() IS
  'Before a rate plan is deleted, turns its derived and cascade children into manual plans so the ON DELETE SET NULL on parent_rate_plan_id does not trip rate_plans_derived_needs_parent.';

REVOKE ALL ON FUNCTION public.demote_derived_rate_plan_children() FROM PUBLIC;

DROP TRIGGER IF EXISTS demote_derived_rate_plan_children ON public.rate_plans;
CREATE TRIGGER demote_derived_rate_plan_children
  BEFORE DELETE ON public.rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.demote_derived_rate_plan_children();

-- ── Additive re-key: minor-unit money and a plan on every price row ───────────
-- Nothing is dropped here. The numeric(10,2) columns stay authoritative for this
-- release and the legacy uniques stay in force, which does mean a room type
-- still cannot price the same date differently across two plans yet. Dropping
-- unique_room_type_date and unique_seasonal_rate_room_type is a separate
-- migration, gated on the application having read and written the new columns in
-- production for a full release.

ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS base_price_minor    bigint,
  ADD COLUMN IF NOT EXISTS weekend_price_minor bigint;

ALTER TABLE public.daily_rate_overrides
  ADD COLUMN IF NOT EXISTS rate_plan_id uuid,
  ADD COLUMN IF NOT EXISTS occupancy    smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_minor  bigint;

ALTER TABLE public.seasonal_rate_overrides
  ADD COLUMN IF NOT EXISTS rate_plan_id        uuid,
  ADD COLUMN IF NOT EXISTS occupancy           smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_price_minor    bigint,
  ADD COLUMN IF NOT EXISTS weekend_price_minor bigint;

COMMENT ON COLUMN public.room_types.base_price_minor IS
  'base_price in the hotel currency smallest unit, kept in step by sync_room_type_price_minor(). Exists because numeric(10,2) cannot represent three-decimal currencies (BHD, KWD) at all, and integer money removes float drift from every downstream sum.';
COMMENT ON COLUMN public.daily_rate_overrides.occupancy IS
  '0 means the per-room rate, which is the only value this release writes. A positive value is the guest count a per-person plan rate applies to (Channex occupancy option).';
COMMENT ON COLUMN public.daily_rate_overrides.rate_plan_id IS
  'Owning rate plan. Defaulted to the room type default plan by sync_daily_rate_override_minor() so existing insert paths keep working unchanged.';

DO $$
BEGIN
  ALTER TABLE public.room_types
    ADD CONSTRAINT room_types_base_price_minor_nonneg
      CHECK (base_price_minor IS NULL OR base_price_minor >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  -- Mirrors the absence of a numeric constraint on weekend_price: only sign is
  -- checked, so pre-existing zero rates keep validating.
  ALTER TABLE public.room_types
    ADD CONSTRAINT room_types_weekend_price_minor_nonneg
      CHECK (weekend_price_minor IS NULL OR weekend_price_minor >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.daily_rate_overrides
    ADD CONSTRAINT daily_rate_overrides_price_minor_positive
      CHECK (price_minor IS NULL OR price_minor > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.daily_rate_overrides
    ADD CONSTRAINT daily_rate_overrides_occupancy_range
      CHECK (occupancy >= 0 AND occupancy <= 30);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.daily_rate_overrides
    ADD CONSTRAINT daily_rate_overrides_rate_plan_fk
      FOREIGN KEY (rate_plan_id, hotel_id)
      REFERENCES public.rate_plans (id, hotel_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.seasonal_rate_overrides
    ADD CONSTRAINT seasonal_rate_overrides_base_price_minor_positive
      CHECK (base_price_minor IS NULL OR base_price_minor > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.seasonal_rate_overrides
    ADD CONSTRAINT seasonal_rate_overrides_weekend_price_minor_positive
      CHECK (weekend_price_minor IS NULL OR weekend_price_minor > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.seasonal_rate_overrides
    ADD CONSTRAINT seasonal_rate_overrides_occupancy_range
      CHECK (occupancy >= 0 AND occupancy <= 30);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.seasonal_rate_overrides
    ADD CONSTRAINT seasonal_rate_overrides_rate_plan_fk
      FOREIGN KEY (rate_plan_id, hotel_id)
      REFERENCES public.rate_plans (id, hotel_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- to_minor() is STRICT, so a NULL weekend price stays NULL rather than becoming
-- zero. hotels.currency is nullable; GHS is the application default.

UPDATE public.room_types rt
SET base_price_minor    = public.to_minor(rt.base_price, coalesce(h.currency, 'GHS')),
    weekend_price_minor = public.to_minor(rt.weekend_price, coalesce(h.currency, 'GHS'))
FROM public.hotels h
WHERE h.id = rt.hotel_id
  AND rt.base_price_minor IS NULL;

UPDATE public.daily_rate_overrides o
SET price_minor  = public.to_minor(o.price, coalesce(h.currency, 'GHS')),
    rate_plan_id = rp.id
FROM public.hotels h,
     public.rate_plans rp
WHERE h.id = o.hotel_id
  AND rp.room_type_id = o.room_type_id
  AND rp.is_default
  AND (o.price_minor IS NULL OR o.rate_plan_id IS NULL);

UPDATE public.seasonal_rate_overrides o
SET base_price_minor    = public.to_minor(o.base_price, coalesce(h.currency, 'GHS')),
    weekend_price_minor = public.to_minor(o.weekend_price, coalesce(h.currency, 'GHS')),
    rate_plan_id        = rp.id
FROM public.hotels h,
     public.rate_plans rp
WHERE h.id = o.hotel_id
  AND rp.room_type_id = o.room_type_id
  AND rp.is_default
  AND (o.base_price_minor IS NULL OR o.rate_plan_id IS NULL);

-- ── Keeping the two representations in step ───────────────────────────────────
-- A generated column cannot be used: the currency lives on hotels and a
-- generated expression may only read its own row. Three focused BEFORE triggers
-- instead of one TG_TABLE_NAME switch, so no function ever references a column
-- that its table does not have.
--
-- All three are SECURITY DEFINER for the hotels lookup in hotel_currency(): the
-- writer may legitimately hold no SELECT path to that row under RLS, and a
-- silently missing currency would produce silently wrong minor amounts. They run
-- as postgres (BYPASSRLS), which is also why hotel_currency() itself does not
-- need to be SECURITY DEFINER.
--
-- Not handled here, on purpose: changing hotels.currency does not recompute
-- existing rows. Changing a live currency is a money-migration decision, not a
-- cascade, and it needs an operator-run backfill plus a rate review.

CREATE OR REPLACE FUNCTION public.sync_room_type_price_minor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_currency text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.base_price IS NOT DISTINCT FROM OLD.base_price
     AND NEW.weekend_price IS NOT DISTINCT FROM OLD.weekend_price
     AND NEW.hotel_id IS NOT DISTINCT FROM OLD.hotel_id
     AND NEW.base_price_minor IS NOT DISTINCT FROM OLD.base_price_minor
     AND NEW.weekend_price_minor IS NOT DISTINCT FROM OLD.weekend_price_minor
  THEN
    RETURN NEW;
  END IF;

  v_currency := public.hotel_currency(NEW.hotel_id);
  NEW.base_price_minor    := public.to_minor(NEW.base_price, v_currency);
  NEW.weekend_price_minor := public.to_minor(NEW.weekend_price, v_currency);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_room_type_price_minor() IS
  'Derives room_types.base_price_minor and weekend_price_minor from the numeric columns and the hotel currency. Client-supplied minor values are always overwritten.';

CREATE OR REPLACE FUNCTION public.sync_daily_rate_override_minor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_currency text;
  v_room_type_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.rate_plan_id IS NOT NULL
     AND NEW.rate_plan_id IS NOT DISTINCT FROM OLD.rate_plan_id
     AND NEW.price IS NOT DISTINCT FROM OLD.price
     AND NEW.hotel_id IS NOT DISTINCT FROM OLD.hotel_id
     AND NEW.room_type_id IS NOT DISTINCT FROM OLD.room_type_id
     AND NEW.price_minor IS NOT DISTINCT FROM OLD.price_minor
  THEN
    RETURN NEW;
  END IF;

  IF NEW.rate_plan_id IS NULL THEN
    -- Existing callers write (room_type_id, date, price) and know nothing about
    -- plans. Aim them at the room type default plan so rate_plan_id can be
    -- NOT NULL without touching a single insert path.
    SELECT rp.id INTO NEW.rate_plan_id
    FROM public.rate_plans rp
    WHERE rp.room_type_id = NEW.room_type_id AND rp.is_default;

    IF NEW.rate_plan_id IS NULL THEN
      RAISE EXCEPTION 'room type % has no default rate plan', NEW.room_type_id
        USING ERRCODE = 'no_data_found';
    END IF;
  ELSE
    -- The composite foreign key only proves the plan is in the same hotel. A
    -- plan belonging to a different room type would price the wrong room.
    SELECT rp.room_type_id INTO v_room_type_id
    FROM public.rate_plans rp WHERE rp.id = NEW.rate_plan_id;

    IF v_room_type_id IS DISTINCT FROM NEW.room_type_id THEN
      RAISE EXCEPTION 'rate plan % belongs to room type %, not %',
        NEW.rate_plan_id, v_room_type_id, NEW.room_type_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  v_currency := public.hotel_currency(NEW.hotel_id);
  NEW.price_minor := public.to_minor(NEW.price, v_currency);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_daily_rate_override_minor() IS
  'Defaults daily_rate_overrides.rate_plan_id to the room type default plan, rejects a plan from another room type, and derives price_minor from price and the hotel currency.';

CREATE OR REPLACE FUNCTION public.sync_seasonal_rate_override_minor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_currency text;
  v_room_type_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.rate_plan_id IS NOT NULL
     AND NEW.rate_plan_id IS NOT DISTINCT FROM OLD.rate_plan_id
     AND NEW.base_price IS NOT DISTINCT FROM OLD.base_price
     AND NEW.weekend_price IS NOT DISTINCT FROM OLD.weekend_price
     AND NEW.hotel_id IS NOT DISTINCT FROM OLD.hotel_id
     AND NEW.room_type_id IS NOT DISTINCT FROM OLD.room_type_id
     AND NEW.base_price_minor IS NOT DISTINCT FROM OLD.base_price_minor
     AND NEW.weekend_price_minor IS NOT DISTINCT FROM OLD.weekend_price_minor
  THEN
    RETURN NEW;
  END IF;

  IF NEW.rate_plan_id IS NULL THEN
    SELECT rp.id INTO NEW.rate_plan_id
    FROM public.rate_plans rp
    WHERE rp.room_type_id = NEW.room_type_id AND rp.is_default;

    IF NEW.rate_plan_id IS NULL THEN
      RAISE EXCEPTION 'room type % has no default rate plan', NEW.room_type_id
        USING ERRCODE = 'no_data_found';
    END IF;
  ELSE
    SELECT rp.room_type_id INTO v_room_type_id
    FROM public.rate_plans rp WHERE rp.id = NEW.rate_plan_id;

    IF v_room_type_id IS DISTINCT FROM NEW.room_type_id THEN
      RAISE EXCEPTION 'rate plan % belongs to room type %, not %',
        NEW.rate_plan_id, v_room_type_id, NEW.room_type_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  v_currency := public.hotel_currency(NEW.hotel_id);
  NEW.base_price_minor    := public.to_minor(NEW.base_price, v_currency);
  NEW.weekend_price_minor := public.to_minor(NEW.weekend_price, v_currency);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_seasonal_rate_override_minor() IS
  'Defaults seasonal_rate_overrides.rate_plan_id to the room type default plan, rejects a plan from another room type, and derives the minor-unit prices from the numeric columns and the hotel currency.';

REVOKE ALL ON FUNCTION public.sync_room_type_price_minor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_daily_rate_override_minor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_seasonal_rate_override_minor() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_room_type_price_minor ON public.room_types;
CREATE TRIGGER sync_room_type_price_minor
  BEFORE INSERT OR UPDATE ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.sync_room_type_price_minor();

DROP TRIGGER IF EXISTS sync_daily_rate_override_minor ON public.daily_rate_overrides;
CREATE TRIGGER sync_daily_rate_override_minor
  BEFORE INSERT OR UPDATE ON public.daily_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.sync_daily_rate_override_minor();

DROP TRIGGER IF EXISTS sync_seasonal_rate_override_minor ON public.seasonal_rate_overrides;
CREATE TRIGGER sync_seasonal_rate_override_minor
  BEFORE INSERT OR UPDATE ON public.seasonal_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.sync_seasonal_rate_override_minor();

-- ── Tighten, now that the backfill and the triggers guarantee the values ───────

ALTER TABLE public.room_types
  ALTER COLUMN base_price_minor SET NOT NULL;

ALTER TABLE public.daily_rate_overrides
  ALTER COLUMN rate_plan_id SET NOT NULL,
  ALTER COLUMN price_minor  SET NOT NULL;

ALTER TABLE public.seasonal_rate_overrides
  ALTER COLUMN rate_plan_id     SET NOT NULL,
  ALTER COLUMN base_price_minor SET NOT NULL;

-- The plan-scoped uniques land alongside the legacy ones rather than replacing
-- them. Application writes must move to these keys in the same commit that
-- starts sending rate_plan_id: bulkUpsertDailyRateOverrides currently upserts on
-- (room_type_id, date) and would otherwise merge two plans' rates into one row.

DO $$
BEGIN
  ALTER TABLE public.daily_rate_overrides
    ADD CONSTRAINT daily_rate_overrides_plan_date_occ_key
      UNIQUE (rate_plan_id, date, occupancy);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.seasonal_rate_overrides
    ADD CONSTRAINT seasonal_rate_overrides_plan_occ_key
      UNIQUE (seasonal_rate_id, rate_plan_id, occupancy);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- Left for later phases, so the boundary is explicit: rate restrictions
-- (min_stay_arrival, min_stay_through, closed_to_arrival, closed_to_departure,
-- stop_sell), children_fee and infant_fee, tax_set_id, the ten Channex inherit_*
-- flags, and the Channex mapping tables. Also unresolved by design: a default
-- plan can still be deleted directly. A BEFORE DELETE guard would have to
-- distinguish a direct delete from the ON DELETE CASCADE that arrives when its
-- room type is deleted, so the rule belongs in the application and in the UI.
