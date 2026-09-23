-- =============================================================================
-- 20260902140000_channel_distribution_scaffold.sql
--
-- The database half of channel-manager distribution, built now so that the rate,
-- restriction and inventory work that precedes it has somewhere to be read from,
-- and so that no later phase has to retrofit change-tracking onto write paths
-- that have already shipped.
--
-- Nothing here reaches the internet. Every piece is inert until a row in
-- channel_properties is switched on: until then enqueue_ari_dirty returns
-- immediately, the outbox stays empty, and a tracked write costs one index probe
-- per changed target. The HTTP worker, and rate_plan_options, are deliberately
-- not in this migration.
--
-- Three decisions are worth reading before the SQL:
--
--   * The outbox stores DATE RANGES, never payloads. A job says "re-project this
--     window", so pushing one twice sends the same state, a burst of edits
--     collapses into one row, and a 400-day rate change enqueues one job rather
--     than 400. Nothing in the queue can go stale, because nothing in it is a
--     copy of anything.
--   * Credentials are a Vault secret NAME (api_key_ref), never a secret. The
--     predecessor got this wrong: 20260802000000_remove_beds24_ota.sql dropped
--     hotels.beds24_api_key, a live API key sitting in a column that every staff
--     member's RLS policy could read. A CHECK constraint now refuses anything
--     that is not lowercase snake_case, so a pasted key fails to insert.
--   * ari_snapshot takes an INCLUSIVE p_to, unlike the two functions it joins.
--     It is called with an outbox row's date_from/date_to, and those describe a
--     set of dates; making the worker add a day to one of them is the one
--     off-by-one this feature cannot afford, so the arithmetic lives here once.
-- =============================================================================

-- ── 1. Which property, at which provider ─────────────────────────────────────
--
-- One row per hotel per provider. is_enabled is the master switch for the whole
-- feature: it gates enqueue_ari_dirty, and therefore every trigger below.

CREATE TABLE IF NOT EXISTS public.channel_properties (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  hotel_id             uuid        NOT NULL,
  provider             text        NOT NULL,
  external_property_id text        NOT NULL,
  is_enabled           boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT channel_properties_pkey PRIMARY KEY (id),
  CONSTRAINT channel_properties_hotel_provider_key UNIQUE (hotel_id, provider),
  -- Composite target, in the house style, so a mapping row can never point at
  -- one hotel's property with another hotel's room type.
  CONSTRAINT channel_properties_id_hotel_key UNIQUE (id, hotel_id),

  CONSTRAINT channel_properties_hotel_id_fkey FOREIGN KEY (hotel_id)
    REFERENCES public.hotels (id) ON DELETE CASCADE,

  CONSTRAINT channel_properties_provider_check CHECK (provider IN ('channex')),
  CONSTRAINT channel_properties_external_id_not_blank
    CHECK (length(btrim(external_property_id)) > 0)
);

COMMENT ON TABLE public.channel_properties IS
  'One row per hotel per channel-manager provider. is_enabled is the master switch for distribution: while no enabled row exists for a hotel, enqueue_ari_dirty is a no-op and nothing is queued for it.';
COMMENT ON COLUMN public.channel_properties.external_property_id IS
  'The provider''s own identifier for this property. Opaque to us; never parsed.';

-- Partial, because the only question asked of this table on a hot write path is
-- "is anything switched on at all".
CREATE INDEX IF NOT EXISTS idx_channel_properties_enabled
  ON public.channel_properties (hotel_id) WHERE is_enabled;

DROP TRIGGER IF EXISTS handle_channel_properties_updated_at ON public.channel_properties;
CREATE TRIGGER handle_channel_properties_updated_at
  BEFORE UPDATE ON public.channel_properties
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 2. Which of our rows is which of theirs ──────────────────────────────────
--
-- Two thin translation tables. They are what decides WHAT IS SENT; ari_snapshot
-- below decides WHAT IS TRUE, and deliberately does not consult them. Keeping
-- the two apart means the projection is testable before a single mapping exists,
-- which is the state every hotel is in on day one.

CREATE TABLE IF NOT EXISTS public.channel_room_type_mappings (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  hotel_id              uuid        NOT NULL,
  channel_property_id   uuid        NOT NULL,
  room_type_id          uuid        NOT NULL,
  external_room_type_id text        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT channel_room_type_mappings_pkey PRIMARY KEY (id),
  -- One room type maps to at most one of theirs, and vice versa, per property.
  CONSTRAINT channel_room_type_mappings_room_type_key
    UNIQUE (channel_property_id, room_type_id),
  CONSTRAINT channel_room_type_mappings_external_key
    UNIQUE (channel_property_id, external_room_type_id),

  CONSTRAINT channel_room_type_mappings_hotel_id_fkey FOREIGN KEY (hotel_id)
    REFERENCES public.hotels (id) ON DELETE CASCADE,
  CONSTRAINT channel_room_type_mappings_property_fkey
    FOREIGN KEY (channel_property_id, hotel_id)
    REFERENCES public.channel_properties (id, hotel_id) ON DELETE CASCADE,
  CONSTRAINT channel_room_type_mappings_room_type_fkey
    FOREIGN KEY (room_type_id, hotel_id)
    REFERENCES public.room_types (id, hotel_id) ON DELETE CASCADE,

  CONSTRAINT channel_room_type_mappings_external_id_not_blank
    CHECK (length(btrim(external_room_type_id)) > 0)
);

COMMENT ON TABLE public.channel_room_type_mappings IS
  'Translates one of our room types to the provider''s. Composite foreign keys carry hotel_id into both parents so a mapping cannot straddle two tenants.';

CREATE INDEX IF NOT EXISTS idx_channel_room_type_mappings_room_type
  ON public.channel_room_type_mappings (room_type_id);

DROP TRIGGER IF EXISTS handle_channel_room_type_mappings_updated_at
  ON public.channel_room_type_mappings;
CREATE TRIGGER handle_channel_room_type_mappings_updated_at
  BEFORE UPDATE ON public.channel_room_type_mappings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.channel_rate_plan_mappings (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  hotel_id              uuid        NOT NULL,
  channel_property_id   uuid        NOT NULL,
  rate_plan_id          uuid        NOT NULL,
  external_rate_plan_id text        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT channel_rate_plan_mappings_pkey PRIMARY KEY (id),
  CONSTRAINT channel_rate_plan_mappings_rate_plan_key
    UNIQUE (channel_property_id, rate_plan_id),
  CONSTRAINT channel_rate_plan_mappings_external_key
    UNIQUE (channel_property_id, external_rate_plan_id),

  CONSTRAINT channel_rate_plan_mappings_hotel_id_fkey FOREIGN KEY (hotel_id)
    REFERENCES public.hotels (id) ON DELETE CASCADE,
  CONSTRAINT channel_rate_plan_mappings_property_fkey
    FOREIGN KEY (channel_property_id, hotel_id)
    REFERENCES public.channel_properties (id, hotel_id) ON DELETE CASCADE,
  CONSTRAINT channel_rate_plan_mappings_rate_plan_fkey
    FOREIGN KEY (rate_plan_id, hotel_id)
    REFERENCES public.rate_plans (id, hotel_id) ON DELETE CASCADE,

  CONSTRAINT channel_rate_plan_mappings_external_id_not_blank
    CHECK (length(btrim(external_rate_plan_id)) > 0)
);

COMMENT ON TABLE public.channel_rate_plan_mappings IS
  'Translates one of our rate plans to the provider''s. One row per plan today; per-occupancy fan-out belongs to rate_plan_options, which is not in this migration.';

CREATE INDEX IF NOT EXISTS idx_channel_rate_plan_mappings_rate_plan
  ON public.channel_rate_plan_mappings (rate_plan_id);

DROP TRIGGER IF EXISTS handle_channel_rate_plan_mappings_updated_at
  ON public.channel_rate_plan_mappings;
CREATE TRIGGER handle_channel_rate_plan_mappings_updated_at
  BEFORE UPDATE ON public.channel_rate_plan_mappings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 3. Credentials, which are not credentials ────────────────────────────────
--
-- api_key_ref names a Vault secret; the secret itself never enters this schema.
-- The CHECK is the point of the table: lowercase snake_case only, so a pasted
-- API key — which will contain uppercase, hyphens, dots or a length beyond 120 —
-- fails to insert rather than sitting in a column forever. The existing
-- push_worker_secret entry is the naming precedent.
--
-- No policies, ever. Reading a secret NAME is still enumeration of which hotels
-- are connected to what, and staff have no use for it.

CREATE TABLE IF NOT EXISTS public.channel_credentials (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  hotel_id            uuid        NOT NULL,
  channel_property_id uuid        NOT NULL,
  api_key_ref         text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT channel_credentials_pkey PRIMARY KEY (id),
  CONSTRAINT channel_credentials_property_key UNIQUE (channel_property_id),

  CONSTRAINT channel_credentials_hotel_id_fkey FOREIGN KEY (hotel_id)
    REFERENCES public.hotels (id) ON DELETE CASCADE,
  CONSTRAINT channel_credentials_property_fkey
    FOREIGN KEY (channel_property_id, hotel_id)
    REFERENCES public.channel_properties (id, hotel_id) ON DELETE CASCADE,

  CONSTRAINT channel_credentials_api_key_ref_is_a_reference
    CHECK (api_key_ref ~ '^[a-z0-9_]{3,120}$')
);

COMMENT ON TABLE public.channel_credentials IS
  'Vault secret NAMES for channel-manager access, never the secrets. RLS is enabled with zero policies and no grants beyond service_role: only the worker resolves a name through vault.decrypted_secrets. Do not add policies without review.';
COMMENT ON COLUMN public.channel_credentials.api_key_ref IS
  'Name of a Vault secret, e.g. channex_api_key_<hotel-slug>. The CHECK refuses anything that is not lowercase snake_case, so a pasted API key cannot be stored here by accident.';

DROP TRIGGER IF EXISTS handle_channel_credentials_updated_at ON public.channel_credentials;
CREATE TRIGGER handle_channel_credentials_updated_at
  BEFORE UPDATE ON public.channel_credentials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 4. The outbox: ranges, not payloads ──────────────────────────────────────
--
-- A row means "the state of these dates changed; re-project and push them". It
-- does not carry what to send. Three properties follow from that, and all three
-- are why this table is shaped like this:
--
--   * Idempotent. Pushing a job twice sends today's truth twice, not a stale
--     copy of what was true when the job was written.
--   * Collapsible. enqueue_ari_dirty widens an existing pending row instead of
--     inserting beside it, so a hundred edits to one month are one job.
--   * Cheap. Editing 400 days of rates enqueues one row, not four hundred.
--
-- date_from and date_to are both INCLUSIVE — they name a set of dates, and
-- ari_snapshot takes them unchanged.
--
-- NULL room_type_id or rate_plan_id means "every one of them", which is what a
-- season's date range moving, or a hotel-wide edit, actually implies.

CREATE TABLE IF NOT EXISTS public.ari_sync_outbox (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  hotel_id        uuid        NOT NULL,
  room_type_id    uuid,
  rate_plan_id    uuid,
  date_from       date        NOT NULL,
  date_to         date        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  attempt_count   integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at       timestamptz,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ari_sync_outbox_pkey PRIMARY KEY (id),

  CONSTRAINT ari_sync_outbox_hotel_id_fkey FOREIGN KEY (hotel_id)
    REFERENCES public.hotels (id) ON DELETE CASCADE,
  -- No composite FK to room_types or rate_plans: a job outlives the row that
  -- dirtied it on purpose. Deleting a room type is itself a change the channel
  -- needs told about, and the projection simply returns nothing for it.

  CONSTRAINT ari_sync_outbox_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'retry', 'dead_letter')),
  CONSTRAINT ari_sync_outbox_range_check CHECK (date_to >= date_from),
  CONSTRAINT ari_sync_outbox_attempt_count_check CHECK (attempt_count >= 0)
);

COMMENT ON TABLE public.ari_sync_outbox IS
  'Work queue of date ranges whose availability, rates or restrictions changed. Stores ranges, never payloads, so a job cannot go stale and duplicates are harmless. RLS is enabled with zero policies: this is service_role-only infrastructure. Do not add policies without review.';
COMMENT ON COLUMN public.ari_sync_outbox.date_to IS
  'Inclusive last date of the dirty window, matching ari_snapshot''s inclusive p_to.';
COMMENT ON COLUMN public.ari_sync_outbox.room_type_id IS
  'NULL means every room type in the hotel — what a hotel-wide or season-level change implies.';

-- Claim order. Partial, because sent and dead_letter rows are only ever read by
-- the pruner, and they are the rows that accumulate.
CREATE INDEX IF NOT EXISTS idx_ari_sync_outbox_claim
  ON public.ari_sync_outbox (next_attempt_at)
  WHERE status IN ('pending', 'retry');

-- The merge probe in enqueue_ari_dirty: pending rows for one hotel only.
CREATE INDEX IF NOT EXISTS idx_ari_sync_outbox_pending_merge
  ON public.ari_sync_outbox (hotel_id, room_type_id, rate_plan_id)
  WHERE status = 'pending';

-- Retention sweeps by terminal state and age.
CREATE INDEX IF NOT EXISTS idx_ari_sync_outbox_status_updated
  ON public.ari_sync_outbox (status, updated_at);

DROP TRIGGER IF EXISTS handle_ari_sync_outbox_updated_at ON public.ari_sync_outbox;
CREATE TRIGGER handle_ari_sync_outbox_updated_at
  BEFORE UPDATE ON public.ari_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 5. Row-level security ────────────────────────────────────────────────────
--
-- The three configuration tables take the house shape: a permissive
-- org-isolation policy for reads, plus restrictive per-operation gates for
-- writes. The gate is super_admin alone, narrower than the super_admin+manager
-- ladder used for rates and restrictions, because these rows decide what leaves
-- the building: one wrong room-type mapping publishes the wrong inventory to
-- every connected OTA simultaneously, and unlike a bad rate it is not visible on
-- any screen a manager looks at. Widening it later is one policy replacement.

ALTER TABLE public.channel_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_properties_org_isolation ON public.channel_properties;
CREATE POLICY channel_properties_org_isolation ON public.channel_properties
  USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));

DROP POLICY IF EXISTS channel_properties_insert_requires_owner ON public.channel_properties;
CREATE POLICY channel_properties_insert_requires_owner ON public.channel_properties
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'super_admin'));

DROP POLICY IF EXISTS channel_properties_update_requires_owner ON public.channel_properties;
CREATE POLICY channel_properties_update_requires_owner ON public.channel_properties
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'super_admin'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'super_admin'));

DROP POLICY IF EXISTS channel_properties_delete_requires_owner ON public.channel_properties;
CREATE POLICY channel_properties_delete_requires_owner ON public.channel_properties
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'super_admin'));

-- Default privileges (20260831150000_privilege_parity.sql) hand anon ALL on new
-- tables; there is no anon database path in this app, so the residue goes.
REVOKE ALL ON public.channel_properties FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_properties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_properties TO service_role;

ALTER TABLE public.channel_room_type_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_room_type_mappings_org_isolation
  ON public.channel_room_type_mappings;
CREATE POLICY channel_room_type_mappings_org_isolation
  ON public.channel_room_type_mappings
  USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));

DROP POLICY IF EXISTS channel_room_type_mappings_insert_requires_owner
  ON public.channel_room_type_mappings;
CREATE POLICY channel_room_type_mappings_insert_requires_owner
  ON public.channel_room_type_mappings
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'super_admin'));

DROP POLICY IF EXISTS channel_room_type_mappings_update_requires_owner
  ON public.channel_room_type_mappings;
CREATE POLICY channel_room_type_mappings_update_requires_owner
  ON public.channel_room_type_mappings
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'super_admin'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'super_admin'));

DROP POLICY IF EXISTS channel_room_type_mappings_delete_requires_owner
  ON public.channel_room_type_mappings;
CREATE POLICY channel_room_type_mappings_delete_requires_owner
  ON public.channel_room_type_mappings
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'super_admin'));

REVOKE ALL ON public.channel_room_type_mappings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_room_type_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_room_type_mappings TO service_role;

ALTER TABLE public.channel_rate_plan_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_rate_plan_mappings_org_isolation
  ON public.channel_rate_plan_mappings;
CREATE POLICY channel_rate_plan_mappings_org_isolation
  ON public.channel_rate_plan_mappings
  USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));

DROP POLICY IF EXISTS channel_rate_plan_mappings_insert_requires_owner
  ON public.channel_rate_plan_mappings;
CREATE POLICY channel_rate_plan_mappings_insert_requires_owner
  ON public.channel_rate_plan_mappings
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'super_admin'));

DROP POLICY IF EXISTS channel_rate_plan_mappings_update_requires_owner
  ON public.channel_rate_plan_mappings;
CREATE POLICY channel_rate_plan_mappings_update_requires_owner
  ON public.channel_rate_plan_mappings
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'super_admin'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'super_admin'));

DROP POLICY IF EXISTS channel_rate_plan_mappings_delete_requires_owner
  ON public.channel_rate_plan_mappings;
CREATE POLICY channel_rate_plan_mappings_delete_requires_owner
  ON public.channel_rate_plan_mappings
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'super_admin'));

REVOKE ALL ON public.channel_rate_plan_mappings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_rate_plan_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_rate_plan_mappings TO service_role;

-- Credentials and the outbox: RLS on, no policies at all, and no grants to the
-- two browser-reachable roles. service_role bypasses RLS, so the worker still
-- reads them; nothing else can, and adding a policy is the only way to change
-- that — which is what the table comments forbid without review.
ALTER TABLE public.channel_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.channel_credentials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_credentials TO service_role;

ALTER TABLE public.ari_sync_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ari_sync_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ari_sync_outbox TO service_role;

-- ── 6. Is distribution on for this hotel ─────────────────────────────────────
--
-- SECURITY DEFINER because the callers include triggers firing under anon: a
-- guest booking changes inventory, and it must dirty the feed even though anon
-- cannot see channel_properties. The partial index makes this one probe.

CREATE OR REPLACE FUNCTION public.ari_distribution_active(p_hotel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_properties cp
    WHERE cp.hotel_id = p_hotel_id AND cp.is_enabled
  );
$$;

COMMENT ON FUNCTION public.ari_distribution_active(uuid) IS
  'True when this hotel has at least one enabled channel_properties row. Every distribution write path checks this first, so the whole feature costs one index probe per changed target while it is switched off.';

REVOKE ALL ON FUNCTION public.ari_distribution_active(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ari_distribution_active(uuid) TO service_role;

-- ── 7. The projection ────────────────────────────────────────────────────────
--
-- One function, no materialized table, so there is nothing to drift out of date
-- and nothing to backfill. It answers "what is true for these dates" by joining
-- the three systems that already own the answer: the availability projection,
-- the rate resolver, and the restriction rows.
--
-- It deliberately does NOT consult the mapping tables. Those decide what is
-- SENT; this decides what is TRUE. Keeping them apart is what lets the whole
-- projection be tested today, on a hotel with no mappings and no provider.
--
-- p_to is INCLUSIVE, unlike the two functions it calls. It is handed an outbox
-- row's date_from/date_to, which name a set of dates; the +1 lives here, once,
-- rather than in every worker that ever calls it.
--
-- p_room_type_ids defaults to every room type in the hotel. A job that dirtied
-- one room type passes just that one, so a 400-day single-room-type change does
-- not re-project the whole property.

CREATE OR REPLACE FUNCTION public.ari_snapshot(
  p_hotel_id       uuid,
  p_from           date,
  p_to             date,
  p_room_type_ids  uuid[] DEFAULT NULL
)
RETURNS TABLE (
  room_type_id        uuid,
  rate_plan_id        uuid,
  stay_date           date,
  occupancy           smallint,
  availability        integer,
  rate_minor          bigint,
  currency            text,
  min_stay            smallint,
  min_stay_arrival    smallint,
  min_stay_through    smallint,
  max_stay            smallint,
  closed_to_arrival   boolean,
  closed_to_departure boolean,
  stop_sell           boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH targets AS (
    SELECT COALESCE(
      p_room_type_ids,
      ARRAY(SELECT rt.id FROM public.room_types rt WHERE rt.hotel_id = p_hotel_id)
    ) AS ids
  ),
  -- Both set-returning functions are called once, from their own CTE, rather
  -- than laterally per row.
  rates AS (
    SELECT n.* FROM targets t,
      public.resolve_nightly_rates(p_hotel_id, t.ids, p_from, p_to + 1, NULL, 0::smallint) n
  ),
  avail AS (
    SELECT v.* FROM targets t,
      public.room_type_availability_by_date(t.ids, p_from, p_to + 1, NULL) v
  )
  SELECT
    r.room_type_id,
    r.rate_plan_id,
    r.stay_date,
    r.occupancy,
    -- A rate without an availability row should be impossible; if it ever
    -- happens, send zero rather than let a channel sell a room we cannot count.
    COALESCE(a.available, 0)::integer AS availability,
    r.rate_minor,
    r.currency,
    x.min_stay,
    x.min_stay_arrival,
    x.min_stay_through,
    -- 0 clears a maximum in our schema (Channex semantics); the worker maps this
    -- NULL back to 0 when it needs to clear one at the provider.
    NULLIF(x.max_stay, 0)::smallint AS max_stay,
    COALESCE(x.closed_to_arrival, false)   AS closed_to_arrival,
    COALESCE(x.closed_to_departure, false) AS closed_to_departure,
    COALESCE(x.stop_sell, false)           AS stop_sell
  FROM rates r
  LEFT JOIN avail a
    ON a.room_type_id = r.room_type_id
   AND a.stay_date    = r.stay_date
  -- Restrictions hang off the plan that priced the night, which is the same key
  -- the availability grid builds in getResolvedRates.
  LEFT JOIN public.rate_restrictions x
    ON x.hotel_id     = p_hotel_id
   AND x.rate_plan_id = r.rate_plan_id
   AND x.date         = r.stay_date
  ORDER BY r.room_type_id, r.stay_date, r.occupancy
$$;

COMMENT ON FUNCTION public.ari_snapshot(uuid, date, date, uuid[]) IS
  'Availability, rate and restriction state per room type, date and occupancy, joined from room_type_availability_by_date, resolve_nightly_rates and rate_restrictions. p_to is INCLUSIVE — it is fed an outbox row''s date_from/date_to unchanged, and adds the day the two inner functions need. max_stay comes back NULL where our 0 means cleared. Mapping tables are not consulted: this is what is true, not what is sent. Restricted to service_role, like the availability projection it wraps.';

REVOKE ALL ON FUNCTION public.ari_snapshot(uuid, date, date, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ari_snapshot(uuid, date, date, uuid[]) TO service_role;

-- ── 8. Marking dates dirty ───────────────────────────────────────────────────
--
-- The single entry point every write path uses. Four things it does, in order,
-- and each is load-bearing:
--
--   1. Returns immediately unless distribution is switched on. This is what
--      makes the whole feature free today.
--   2. Clamps the window to [current_date, current_date + 400]. A retroactive
--      edit to last year cannot be pushed anywhere, and nobody sells past a
--      400-day horizon, so an accidental year-3000 date cannot enqueue a job
--      spanning a millennium.
--   3. Widens an existing overlapping-or-adjacent pending job instead of
--      inserting beside it, so an afternoon of edits is one job.
--   4. Otherwise inserts one row.
--
-- SECURITY DEFINER: called from triggers that fire under anon (a guest booking)
-- and authenticated (a manager editing rates), neither of which has any grant on
-- ari_sync_outbox — and must not be given one.

CREATE OR REPLACE FUNCTION public.enqueue_ari_dirty(
  p_hotel_id      uuid,
  p_from          date,
  p_to            date,
  p_room_type_id  uuid DEFAULT NULL,
  p_rate_plan_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_from date;
  v_to   date;
  v_id   uuid;
BEGIN
  IF p_hotel_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.ari_distribution_active(p_hotel_id) THEN
    RETURN;
  END IF;

  v_from := GREATEST(p_from, current_date);
  v_to   := LEAST(p_to, current_date + 400);

  -- Wholly in the past, or wholly beyond the horizon: nothing to distribute.
  IF v_to < v_from THEN
    RETURN;
  END IF;

  -- Overlapping or adjacent (hence the +/- 1) pending job for the same target.
  -- IS NOT DISTINCT FROM so a hotel-wide job, whose room_type_id is NULL, merges
  -- with another hotel-wide job rather than with every specific one.
  --
  -- SKIP LOCKED: if a concurrent writer holds the candidate, we insert our own
  -- row instead of waiting. Two overlapping jobs are harmless — each re-projects
  -- current truth — and a write path must never block on the queue.
  SELECT o.id INTO v_id
  FROM public.ari_sync_outbox o
  WHERE o.hotel_id = p_hotel_id
    AND o.status = 'pending'
    AND o.room_type_id IS NOT DISTINCT FROM p_room_type_id
    AND o.rate_plan_id IS NOT DISTINCT FROM p_rate_plan_id
    AND o.date_from <= v_to + 1
    AND o.date_to   >= v_from - 1
  ORDER BY o.date_from
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NOT NULL THEN
    UPDATE public.ari_sync_outbox o
       SET date_from = LEAST(o.date_from, v_from),
           date_to   = GREATEST(o.date_to, v_to)
     WHERE o.id = v_id;
    RETURN;
  END IF;

  INSERT INTO public.ari_sync_outbox
    (hotel_id, room_type_id, rate_plan_id, date_from, date_to)
  VALUES
    (p_hotel_id, p_room_type_id, p_rate_plan_id, v_from, v_to);
END;
$$;

COMMENT ON FUNCTION public.enqueue_ari_dirty(uuid, date, date, uuid, uuid) IS
  'Marks a date range as needing a push. No-op unless the hotel has an enabled channel_properties row. Clamps to [current_date, current_date + 400] and merges into an overlapping or adjacent pending job, so a burst of edits collapses into one row and a 400-day change enqueues one job rather than 400. NULL room_type_id or rate_plan_id means every one of them.';

REVOKE ALL ON FUNCTION public.enqueue_ari_dirty(uuid, date, date, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ari_dirty(uuid, date, date, uuid, uuid) TO service_role;

-- ── 9. Claiming work ─────────────────────────────────────────────────────────
--
-- A copy of claim_push_jobs, deliberately: the same FOR UPDATE SKIP LOCKED
-- pattern, the same clamped limit, the same service_role-only grant. Two workers
-- can run at once and will never take the same job.

CREATE OR REPLACE FUNCTION public.claim_ari_jobs(p_limit integer DEFAULT 50)
RETURNS SETOF public.ari_sync_outbox
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.ari_sync_outbox o
  SET status = 'processing', locked_at = now(), updated_at = now()
  WHERE o.id IN (
    SELECT j.id FROM public.ari_sync_outbox j
    WHERE j.status IN ('pending', 'retry') AND j.next_attempt_at <= now()
    ORDER BY j.next_attempt_at
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING o.*;
$$;

COMMENT ON FUNCTION public.claim_ari_jobs(integer) IS
  'Atomically claims up to p_limit due ARI jobs (capped at 200) and marks them processing. FOR UPDATE SKIP LOCKED, so concurrent workers never claim the same row. Mirrors claim_push_jobs.';

REVOKE ALL ON FUNCTION public.claim_ari_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ari_jobs(integer) TO service_role;

-- ── 10. Change tracking ──────────────────────────────────────────────────────
--
-- Six tables can change what an OTA would be shown, and all six are tracked in
-- the database rather than in the TypeScript that writes them. A distribution
-- feed that silently misses a change oversells rooms; a new server action, an
-- admin fixing a row by hand, a future import script and a cascade all have to be
-- caught, and only a trigger catches all four.
--
-- Statement-level with transition tables, not row-level: one statement that
-- rewrites 400 nights should aggregate to one call per target, not fire 400
-- times. Each table needs three separate triggers because Postgres forbids
-- transition tables on a multi-event trigger, and each function guards on TG_OP
-- because plpgsql plans a branch only when it is reached — so the DELETE trigger
-- never plans the new_rows statement, and vice versa.
--
-- An UPDATE deliberately runs both branches: moving a date range dirties the
-- dates it left as well as the ones it arrived at.

CREATE OR REPLACE FUNCTION public.ari_dirty_from_daily_rate_overrides()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, g.room_type_id, g.rate_plan_id)
    FROM (
      SELECT nr.hotel_id, nr.room_type_id, nr.rate_plan_id,
             min(nr.date) AS d_from, max(nr.date) AS d_to
      FROM new_rows nr GROUP BY nr.hotel_id, nr.room_type_id, nr.rate_plan_id
    ) g;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, g.room_type_id, g.rate_plan_id)
    FROM (
      SELECT orr.hotel_id, orr.room_type_id, orr.rate_plan_id,
             min(orr.date) AS d_from, max(orr.date) AS d_to
      FROM old_rows orr GROUP BY orr.hotel_id, orr.room_type_id, orr.rate_plan_id
    ) g;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.ari_dirty_from_daily_rate_overrides() IS
  'Statement-level: collapses a bulk override write into one queued window per (room type, rate plan).';

DROP TRIGGER IF EXISTS trg_ari_dirty_daily_rate_overrides_ins ON public.daily_rate_overrides;
CREATE TRIGGER trg_ari_dirty_daily_rate_overrides_ins
  AFTER INSERT ON public.daily_rate_overrides
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_daily_rate_overrides();

DROP TRIGGER IF EXISTS trg_ari_dirty_daily_rate_overrides_upd ON public.daily_rate_overrides;
CREATE TRIGGER trg_ari_dirty_daily_rate_overrides_upd
  AFTER UPDATE ON public.daily_rate_overrides
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_daily_rate_overrides();

DROP TRIGGER IF EXISTS trg_ari_dirty_daily_rate_overrides_del ON public.daily_rate_overrides;
CREATE TRIGGER trg_ari_dirty_daily_rate_overrides_del
  AFTER DELETE ON public.daily_rate_overrides
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_daily_rate_overrides();

-- rate_restrictions names only the rate plan, so the room type is recovered by
-- join. LEFT JOIN, not JOIN: when the plan is deleted the restriction rows
-- cascade with it, and a job with a null room type still re-projects the right
-- dates rather than being dropped for want of a lookup.
CREATE OR REPLACE FUNCTION public.ari_dirty_from_rate_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, rp.room_type_id, g.rate_plan_id)
    FROM (
      SELECT nr.hotel_id, nr.rate_plan_id, min(nr.date) AS d_from, max(nr.date) AS d_to
      FROM new_rows nr GROUP BY nr.hotel_id, nr.rate_plan_id
    ) g
    LEFT JOIN public.rate_plans rp ON rp.id = g.rate_plan_id AND rp.hotel_id = g.hotel_id;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, rp.room_type_id, g.rate_plan_id)
    FROM (
      SELECT orr.hotel_id, orr.rate_plan_id, min(orr.date) AS d_from, max(orr.date) AS d_to
      FROM old_rows orr GROUP BY orr.hotel_id, orr.rate_plan_id
    ) g
    LEFT JOIN public.rate_plans rp ON rp.id = g.rate_plan_id AND rp.hotel_id = g.hotel_id;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.ari_dirty_from_rate_restrictions() IS
  'Statement-level: queues the changed restriction dates, recovering the room type from the rate plan.';

DROP TRIGGER IF EXISTS trg_ari_dirty_rate_restrictions_ins ON public.rate_restrictions;
CREATE TRIGGER trg_ari_dirty_rate_restrictions_ins
  AFTER INSERT ON public.rate_restrictions
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_rate_restrictions();

DROP TRIGGER IF EXISTS trg_ari_dirty_rate_restrictions_upd ON public.rate_restrictions;
CREATE TRIGGER trg_ari_dirty_rate_restrictions_upd
  AFTER UPDATE ON public.rate_restrictions
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_rate_restrictions();

DROP TRIGGER IF EXISTS trg_ari_dirty_rate_restrictions_del ON public.rate_restrictions;
CREATE TRIGGER trg_ari_dirty_rate_restrictions_del
  AFTER DELETE ON public.rate_restrictions
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_rate_restrictions();

-- A seasonal override carries no dates of its own; the season it hangs off does.
-- If the season itself was deleted the join finds nothing and enqueue_ari_dirty
-- returns on the null window — which loses nothing, because that same statement
-- also fires the seasonal_rates trigger below, and that one knows the dates.
CREATE OR REPLACE FUNCTION public.ari_dirty_from_seasonal_rate_overrides()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, sr.start_date, sr.end_date, g.room_type_id, g.rate_plan_id)
    FROM (
      SELECT DISTINCT nr.hotel_id, nr.seasonal_rate_id, nr.room_type_id, nr.rate_plan_id
      FROM new_rows nr
    ) g
    JOIN public.seasonal_rates sr ON sr.id = g.seasonal_rate_id AND sr.hotel_id = g.hotel_id;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, sr.start_date, sr.end_date, g.room_type_id, g.rate_plan_id)
    FROM (
      SELECT DISTINCT orr.hotel_id, orr.seasonal_rate_id, orr.room_type_id, orr.rate_plan_id
      FROM old_rows orr
    ) g
    JOIN public.seasonal_rates sr ON sr.id = g.seasonal_rate_id AND sr.hotel_id = g.hotel_id;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.ari_dirty_from_seasonal_rate_overrides() IS
  'Statement-level: queues each touched season window per (room type, rate plan).';

DROP TRIGGER IF EXISTS trg_ari_dirty_seasonal_rate_overrides_ins ON public.seasonal_rate_overrides;
CREATE TRIGGER trg_ari_dirty_seasonal_rate_overrides_ins
  AFTER INSERT ON public.seasonal_rate_overrides
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_seasonal_rate_overrides();

DROP TRIGGER IF EXISTS trg_ari_dirty_seasonal_rate_overrides_upd ON public.seasonal_rate_overrides;
CREATE TRIGGER trg_ari_dirty_seasonal_rate_overrides_upd
  AFTER UPDATE ON public.seasonal_rate_overrides
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_seasonal_rate_overrides();

DROP TRIGGER IF EXISTS trg_ari_dirty_seasonal_rate_overrides_del ON public.seasonal_rate_overrides;
CREATE TRIGGER trg_ari_dirty_seasonal_rate_overrides_del
  AFTER DELETE ON public.seasonal_rate_overrides
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_seasonal_rate_overrides();

-- A season is hotel-wide by construction: it names no room type, and changing its
-- dates or priority reprices every room type that has no daily override for those
-- nights. So the job is queued with a null room type and null rate plan, and
-- end_date is passed through unchanged because seasonal_rates.end_date is
-- inclusive — unlike availability_blocks and bookings below.
CREATE OR REPLACE FUNCTION public.ari_dirty_from_seasonal_rates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, NULL::uuid, NULL::uuid)
    FROM (
      SELECT nr.hotel_id, min(nr.start_date) AS d_from, max(nr.end_date) AS d_to
      FROM new_rows nr GROUP BY nr.hotel_id
    ) g;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, NULL::uuid, NULL::uuid)
    FROM (
      SELECT orr.hotel_id, min(orr.start_date) AS d_from, max(orr.end_date) AS d_to
      FROM old_rows orr GROUP BY orr.hotel_id
    ) g;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.ari_dirty_from_seasonal_rates() IS
  'Statement-level: queues the touched season span hotel-wide, since a season names no room type.';

DROP TRIGGER IF EXISTS trg_ari_dirty_seasonal_rates_ins ON public.seasonal_rates;
CREATE TRIGGER trg_ari_dirty_seasonal_rates_ins
  AFTER INSERT ON public.seasonal_rates
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_seasonal_rates();

DROP TRIGGER IF EXISTS trg_ari_dirty_seasonal_rates_upd ON public.seasonal_rates;
CREATE TRIGGER trg_ari_dirty_seasonal_rates_upd
  AFTER UPDATE ON public.seasonal_rates
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_seasonal_rates();

DROP TRIGGER IF EXISTS trg_ari_dirty_seasonal_rates_del ON public.seasonal_rates;
CREATE TRIGGER trg_ari_dirty_seasonal_rates_del
  AFTER DELETE ON public.seasonal_rates
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_seasonal_rates();

-- Blocks are held against a physical room, so the room type is recovered by join
-- and the rate plan is left null: taking a room out of service changes how many
-- of that type can be sold, not what any of them costs. end_date is exclusive
-- here, so the last blocked night is end_date - 1.
CREATE OR REPLACE FUNCTION public.ari_dirty_from_availability_blocks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, g.room_type_id, NULL::uuid)
    FROM (
      SELECT nr.hotel_id, r.room_type_id,
             min(nr.start_date) AS d_from, max(nr.end_date) - 1 AS d_to
      FROM new_rows nr
      LEFT JOIN public.rooms r ON r.id = nr.room_id AND r.hotel_id = nr.hotel_id
      GROUP BY nr.hotel_id, r.room_type_id
    ) g;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, g.room_type_id, NULL::uuid)
    FROM (
      SELECT orr.hotel_id, r.room_type_id,
             min(orr.start_date) AS d_from, max(orr.end_date) - 1 AS d_to
      FROM old_rows orr
      LEFT JOIN public.rooms r ON r.id = orr.room_id AND r.hotel_id = orr.hotel_id
      GROUP BY orr.hotel_id, r.room_type_id
    ) g;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.ari_dirty_from_availability_blocks() IS
  'Statement-level: queues blocked nights per room type; end_date is exclusive, so the span ends a day earlier.';

DROP TRIGGER IF EXISTS trg_ari_dirty_availability_blocks_ins ON public.availability_blocks;
CREATE TRIGGER trg_ari_dirty_availability_blocks_ins
  AFTER INSERT ON public.availability_blocks
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_availability_blocks();

DROP TRIGGER IF EXISTS trg_ari_dirty_availability_blocks_upd ON public.availability_blocks;
CREATE TRIGGER trg_ari_dirty_availability_blocks_upd
  AFTER UPDATE ON public.availability_blocks
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_availability_blocks();

DROP TRIGGER IF EXISTS trg_ari_dirty_availability_blocks_del ON public.availability_blocks;
CREATE TRIGGER trg_ari_dirty_availability_blocks_del
  AFTER DELETE ON public.availability_blocks
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_availability_blocks();

-- Bookings are the reason this queue exists: a room sold on the website has to
-- stop being sellable on every OTA within seconds, and one sold on an OTA has to
-- stop being sellable here. UPDATE is tracked as deliberately as INSERT, because
-- a cancellation or a moved stay gives inventory back. check_out is exclusive, so
-- the last occupied night is check_out - 1. bookings.room_type_id is authoritative
-- and needs no join; a booking not yet assigned a physical room still holds one
-- of that type.
CREATE OR REPLACE FUNCTION public.ari_dirty_from_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, g.room_type_id, NULL::uuid)
    FROM (
      SELECT nr.hotel_id, nr.room_type_id,
             min(nr.check_in) AS d_from, max(nr.check_out) - 1 AS d_to
      FROM new_rows nr GROUP BY nr.hotel_id, nr.room_type_id
    ) g;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    PERFORM public.enqueue_ari_dirty(g.hotel_id, g.d_from, g.d_to, g.room_type_id, NULL::uuid)
    FROM (
      SELECT orr.hotel_id, orr.room_type_id,
             min(orr.check_in) AS d_from, max(orr.check_out) - 1 AS d_to
      FROM old_rows orr GROUP BY orr.hotel_id, orr.room_type_id
    ) g;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.ari_dirty_from_bookings() IS
  'Statement-level: queues occupied nights per room type; check_out is exclusive, and UPDATE counts because cancelling returns inventory.';

DROP TRIGGER IF EXISTS trg_ari_dirty_bookings_ins ON public.bookings;
CREATE TRIGGER trg_ari_dirty_bookings_ins
  AFTER INSERT ON public.bookings
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_bookings();

DROP TRIGGER IF EXISTS trg_ari_dirty_bookings_upd ON public.bookings;
CREATE TRIGGER trg_ari_dirty_bookings_upd
  AFTER UPDATE ON public.bookings
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_bookings();

DROP TRIGGER IF EXISTS trg_ari_dirty_bookings_del ON public.bookings;
CREATE TRIGGER trg_ari_dirty_bookings_del
  AFTER DELETE ON public.bookings
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.ari_dirty_from_bookings();

-- ── 11. What an inbound channel booking needs ────────────────────────────────
--
-- Reservations arrive from an OTA as well as leaving as inventory, and three
-- things must exist before one can be stored at all: a source value that says
-- where it came from, somewhere to keep the channel's own identifier so a
-- modification finds the same row, and a way to tell a human that a push was
-- rejected. Adding them now keeps the eventual Channex work to application code.
--
-- Both CHECK constraints are widened, never narrowed, so no existing row can be
-- invalidated: each is dropped and rebuilt from its current membership plus one
-- new value.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'new_booking'::text, 'booking_cancelled'::text, 'payment_received'::text, 'payment_failed'::text,
    'staff_access_request'::text, 'check_in_reminder'::text, 'check_out_reminder'::text, 'test_push'::text,
    -- New: a push to the channel manager was refused, or the channel sent a
    -- booking for inventory we no longer have. Both need a person, not a retry.
    'channel_conflict'::text
  ]));

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_check
  CHECK (source IS NULL OR source IN (
    'direct', 'bookings_com', 'manual', 'phone', 'walk_in',
    -- New: arrived through the channel manager. Kept distinct from
    -- 'bookings_com' because the channel, not the OTA behind it, is what we
    -- reconcile and bill against.
    'channel'
  ));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS channel_provider     text,
  ADD COLUMN IF NOT EXISTS external_booking_id  text;

COMMENT ON COLUMN public.bookings.channel_provider IS
  'Channel manager that delivered this booking (e.g. channex). Null for every booking made here.';
COMMENT ON COLUMN public.bookings.external_booking_id IS
  'The channel''s own identifier for this reservation, so a modification updates the same row instead of duplicating it.';

DO $$
BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_channel_provider_format
    CHECK (channel_provider IS NULL OR channel_provider ~ '^[a-z0-9_]{2,40}$');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  -- An identifier without the provider that issued it cannot be matched against
  -- anything, and a provider with no identifier records nothing. Both or neither.
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_channel_identity_complete
    CHECK ((channel_provider IS NULL) = (external_booking_id IS NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- Idempotency for inbound reservations: a channel that re-delivers or retries a
-- booking must land on the same row. Scoped by hotel_id, one deviation from the
-- plan's two-column key: a channel account can serve several properties, ids are
-- only promised unique per property, and a hotel-blind key would fail an insert —
-- and thereby disclose a row's existence — because a different tenant used that
-- id first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_channel_identity
  ON public.bookings (hotel_id, channel_provider, external_booking_id)
  WHERE external_booking_id IS NOT NULL;

-- Reading it back the other way, for the reconciliation screen that will list
-- what a channel sent us today.
CREATE INDEX IF NOT EXISTS idx_bookings_channel_provider
  ON public.bookings (hotel_id, channel_provider, created_at DESC)
  WHERE channel_provider IS NOT NULL;
