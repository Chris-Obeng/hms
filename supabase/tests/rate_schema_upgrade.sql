-- Post-upgrade regression probe for both supported source paths:
-- hosted UUID identifiers without sequences and clean replay converged to UUID.
-- Set these before this probe in a hosted-shape rehearsal:
--   SET roomline.expected_seasonal_override_id = '<sentinel uuid>';
--   SET roomline.expected_daily_override_id = '<sentinel uuid>';
-- UUID sentinel values prove migration application preserved both existing IDs.

\set ON_ERROR_STOP on

BEGIN;

DO $schema$
DECLARE
  v_seasonal_type text;
  v_daily_type text;
  v_hotel_type text;
  v_hotel_nullable text;
  v_seasonal_seq regclass := to_regclass('public.seasonal_rate_overrides_id_seq');
  v_daily_seq regclass := to_regclass('public.daily_rate_overrides_id_seq');
BEGIN
  SELECT data_type INTO v_seasonal_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'seasonal_rate_overrides'
     AND column_name = 'id';

  SELECT data_type INTO v_daily_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'daily_rate_overrides'
     AND column_name = 'id';

  IF v_seasonal_type IS DISTINCT FROM 'uuid'
     OR v_daily_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION
      'FAIL override identifier shape: seasonal %, daily %, expected uuid',
      v_seasonal_type, v_daily_type;
  END IF;

  IF v_seasonal_seq IS NOT NULL OR v_daily_seq IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL UUID override sequences must be absent: seasonal %, daily %',
      v_seasonal_seq, v_daily_seq;
  END IF;

  SELECT data_type, is_nullable
    INTO v_hotel_type, v_hotel_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'seasonal_rate_overrides'
     AND column_name = 'hotel_id';

  IF v_hotel_type IS DISTINCT FROM 'uuid'
     OR v_hotel_nullable IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION
      'FAIL seasonal_rate_overrides.hotel_id: type %, nullable %, expected uuid NOT NULL',
      v_hotel_type, v_hotel_nullable;
  END IF;
END
$schema$;

DO $integrity$
DECLARE
  v_child_columns text[];
  v_parent_columns text[];
  v_bad_rows bigint;
BEGIN
  SELECT array_agg(child.attname ORDER BY keys.ordinality),
         array_agg(parent.attname ORDER BY keys.ordinality)
    INTO v_child_columns, v_parent_columns
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey)
      WITH ORDINALITY AS keys(child_attnum, parent_attnum, ordinality)
    JOIN pg_attribute child
      ON child.attrelid = c.conrelid AND child.attnum = keys.child_attnum
    JOIN pg_attribute parent
      ON parent.attrelid = c.confrelid AND parent.attnum = keys.parent_attnum
   WHERE c.conrelid = 'public.seasonal_rate_overrides'::regclass
     AND c.confrelid = 'public.seasonal_rates'::regclass
     AND c.contype = 'f'
   GROUP BY c.oid
  HAVING array_agg(child.attname ORDER BY keys.ordinality)
           = ARRAY['seasonal_rate_id', 'hotel_id']::name[]
     AND array_agg(parent.attname ORDER BY keys.ordinality)
           = ARRAY['id', 'hotel_id']::name[];

  IF v_child_columns IS NULL OR v_parent_columns IS NULL THEN
    RAISE EXCEPTION 'FAIL tenant-consistent seasonal-rate parent FK is absent';
  END IF;

  v_child_columns := NULL;
  v_parent_columns := NULL;

  SELECT array_agg(child.attname ORDER BY keys.ordinality),
         array_agg(parent.attname ORDER BY keys.ordinality)
    INTO v_child_columns, v_parent_columns
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey)
      WITH ORDINALITY AS keys(child_attnum, parent_attnum, ordinality)
    JOIN pg_attribute child
      ON child.attrelid = c.conrelid AND child.attnum = keys.child_attnum
    JOIN pg_attribute parent
      ON parent.attrelid = c.confrelid AND parent.attnum = keys.parent_attnum
   WHERE c.conrelid = 'public.seasonal_rate_overrides'::regclass
     AND c.confrelid = 'public.room_types'::regclass
     AND c.contype = 'f'
   GROUP BY c.oid
  HAVING array_agg(child.attname ORDER BY keys.ordinality)
           = ARRAY['room_type_id', 'hotel_id']::name[]
     AND array_agg(parent.attname ORDER BY keys.ordinality)
           = ARRAY['id', 'hotel_id']::name[];

  IF v_child_columns IS NULL OR v_parent_columns IS NULL THEN
    RAISE EXCEPTION 'FAIL tenant-consistent room-type parent FK is absent';
  END IF;

  SELECT count(*) INTO v_bad_rows
    FROM public.seasonal_rate_overrides o
    LEFT JOIN public.seasonal_rates sr
      ON sr.id = o.seasonal_rate_id AND sr.hotel_id = o.hotel_id
    LEFT JOIN public.room_types rt
      ON rt.id = o.room_type_id AND rt.hotel_id = o.hotel_id
   WHERE sr.id IS NULL OR rt.id IS NULL;

  IF v_bad_rows <> 0 THEN
    RAISE EXCEPTION
      'FAIL % override rows lack tenant-consistent season or room-type parents',
      v_bad_rows;
  END IF;
END
$integrity$;

DO $preservation$
DECLARE
  v_seasonal_id uuid;
  v_daily_id uuid;
BEGIN
  IF current_setting('roomline.expected_seasonal_override_id', true) IS NOT NULL THEN
    v_seasonal_id := current_setting('roomline.expected_seasonal_override_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.seasonal_rate_overrides WHERE id = v_seasonal_id
    ) THEN
      RAISE EXCEPTION 'FAIL hosted seasonal override sentinel % was not preserved', v_seasonal_id;
    END IF;
  END IF;

  IF current_setting('roomline.expected_daily_override_id', true) IS NOT NULL THEN
    v_daily_id := current_setting('roomline.expected_daily_override_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.daily_rate_overrides WHERE id = v_daily_id
    ) THEN
      RAISE EXCEPTION 'FAIL hosted daily override sentinel % was not preserved', v_daily_id;
    END IF;
  END IF;
END
$preservation$;

DO $compatibility$
BEGIN
  IF to_regclass('public.daily_rate_overrides_id_seq') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL UUID daily override sequence still exists';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.user_has_staff_role(uuid, text[])',
       'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated lost legacy role-policy helper EXECUTE';
  END IF;

  IF to_regprocedure('public.resolve_nightly_rates(uuid,uuid[],date,date,uuid,smallint)') IS NULL THEN
    RAISE EXCEPTION 'FAIL resolve_nightly_rates signature is absent';
  END IF;

  IF NOT has_function_privilege(
       'service_role',
       'public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role lost resolve_nightly_rates EXECUTE';
  END IF;
END
$compatibility$;

ROLLBACK;