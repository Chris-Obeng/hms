-- Transactional tenant-integrity regression tests.

BEGIN;

\set ON_ERROR_STOP on

DO $catalog$
DECLARE
  v_child name[];
  v_parent name[];
BEGIN
  SELECT array_agg(child.attname ORDER BY keys.ordinality),
         array_agg(parent.attname ORDER BY keys.ordinality)
    INTO v_child, v_parent
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey)
      WITH ORDINALITY AS keys(child_attnum, parent_attnum, ordinality)
    JOIN pg_attribute child
      ON child.attrelid = c.conrelid AND child.attnum = keys.child_attnum
    JOIN pg_attribute parent
      ON parent.attrelid = c.confrelid AND parent.attnum = keys.parent_attnum
   WHERE c.conrelid = 'public.payments'::regclass
     AND c.confrelid = 'public.bookings'::regclass
     AND c.contype = 'f'
   GROUP BY c.oid
  HAVING array_agg(child.attname ORDER BY keys.ordinality)
           = ARRAY['booking_id', 'hotel_id']::name[]
     AND array_agg(parent.attname ORDER BY keys.ordinality)
           = ARRAY['id', 'hotel_id']::name[];

  IF v_child IS NULL OR v_parent IS NULL THEN
    RAISE EXCEPTION 'FAIL payments composite booking tenant FK is absent';
  END IF;

  v_child := NULL;
  v_parent := NULL;

  SELECT array_agg(child.attname ORDER BY keys.ordinality),
         array_agg(parent.attname ORDER BY keys.ordinality)
    INTO v_child, v_parent
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey)
      WITH ORDINALITY AS keys(child_attnum, parent_attnum, ordinality)
    JOIN pg_attribute child
      ON child.attrelid = c.conrelid AND child.attnum = keys.child_attnum
    JOIN pg_attribute parent
      ON parent.attrelid = c.confrelid AND parent.attnum = keys.parent_attnum
   WHERE c.conrelid = 'public.booking_nights'::regclass
     AND c.confrelid = 'public.bookings'::regclass
     AND c.contype = 'f'
   GROUP BY c.oid
  HAVING array_agg(child.attname ORDER BY keys.ordinality)
           = ARRAY['booking_id', 'hotel_id']::name[]
     AND array_agg(parent.attname ORDER BY keys.ordinality)
           = ARRAY['id', 'hotel_id']::name[];

  IF v_child IS NULL OR v_parent IS NULL THEN
    RAISE EXCEPTION 'FAIL booking_nights composite booking tenant FK is absent';
  END IF;
END
$catalog$;

DO $integrity$
DECLARE
  v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.payments p
    LEFT JOIN public.bookings b
      ON b.id = p.booking_id AND b.hotel_id = p.hotel_id
   WHERE b.id IS NULL;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'FAIL % payments lack tenant-consistent bookings', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.booking_nights n
    LEFT JOIN public.bookings b
      ON b.id = n.booking_id AND b.hotel_id = n.hotel_id
   WHERE b.id IS NULL;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'FAIL % booking nights lack tenant-consistent bookings', v_bad;
  END IF;
END
$integrity$;

ROLLBACK;
