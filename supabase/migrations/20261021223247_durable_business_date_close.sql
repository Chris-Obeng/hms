-- Durable operational business-date review. This is NOT a general ledger,
-- financial posting lock, or property-wide accounting-date advancement.
-- Apply forward after the existing booking_nights / role / money migrations.
-- No runtime caller can supply figures, actor identity, or a close timestamp.

CREATE SCHEMA IF NOT EXISTS night_audit_private;
REVOKE ALL ON SCHEMA night_audit_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA night_audit_private TO authenticated;

CREATE TABLE public.business_date_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  business_date date NOT NULL CHECK (business_date >= DATE '2000-01-01'),
  closed_at timestamptz,
  closed_by uuid,
  closed_by_name text,
  time_zone text,
  notes text CHECK (char_length(notes) <= 1000),
  source text NOT NULL CHECK (source IN ('durable_close', 'legacy_audit_log')),
  legacy_audit_log_id uuid,
  summary jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
  CONSTRAINT business_date_closes_hotel_date_key UNIQUE (hotel_id, business_date),
  CONSTRAINT business_date_closes_legacy_key UNIQUE (legacy_audit_log_id),
  CONSTRAINT business_date_closes_receipt CHECK (
    source = 'legacy_audit_log' OR
    (closed_at IS NOT NULL AND closed_by IS NOT NULL AND time_zone IS NOT NULL
     AND (summary ->> 'schemaVersion') IS NOT DISTINCT FROM '1')
  )
);

COMMENT ON TABLE public.business_date_closes IS
  'Immutable operational review receipts, one per hotel/business date. Summary is captured once; later booking/payment changes do not rewrite it. Does not post a ledger, freeze source records, or advance an accounting date. Legacy receipts retain unverified original payloads.';

ALTER TABLE public.business_date_closes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_date_closes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.business_date_closes TO authenticated, service_role;
CREATE POLICY business_date_closes_staff_read ON public.business_date_closes
  FOR SELECT TO authenticated USING (
    public.user_role_at_least(hotel_id, 'read_only')
    AND EXISTS (
      SELECT 1 FROM public.hotels h WHERE h.id = hotel_id
       AND (coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id') IS NULL
         OR h.clerk_org_id = coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id'))
      AND coalesce(h.status, 'active') = 'active'
    )
  );

CREATE FUNCTION night_audit_private.reject_close_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Business-date close receipts are immutable; reopening is not supported.'
    USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION night_audit_private.reject_close_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_date_closes_immutable
  BEFORE UPDATE OR DELETE ON public.business_date_closes
  FOR EACH ROW EXECUTE FUNCTION night_audit_private.reject_close_change();

-- Import only explicit, valid business dates. NEVER infer one from created_at.
-- Earliest persisted event wins for duplicate legacy dates; all source audit
-- rows remain untouched. Missing/invalid dates are retained in audit_logs only.
-- Original figures are unverified (old code used gross totals/current rooms),
-- so the new UI does not present them as a reconciled financial snapshot.
DO $backfill$
DECLARE
  r record;
  d date;
  skipped integer := 0;
BEGIN
  FOR r IN SELECT * FROM public.audit_logs
    WHERE action = 'night_audit.completed'
    ORDER BY created_at ASC NULLS LAST, id
  LOOP
    BEGIN
      IF coalesce(r.after_state->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;
      d := (r.after_state->>'date')::date;
      IF d < DATE '2000-01-01' OR to_char(d, 'YYYY-MM-DD') <> r.after_state->>'date' THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      skipped := skipped + 1;
      CONTINUE;
    END;
    INSERT INTO public.business_date_closes (
      hotel_id, business_date, closed_at, closed_by, closed_by_name,
      notes, source, legacy_audit_log_id, summary
    ) VALUES (
      r.hotel_id, d, r.created_at, r.staff_id, r.staff_name,
      left(r.after_state->>'notes', 1000), 'legacy_audit_log', r.id,
      jsonb_build_object('legacyAudit', r.after_state)
    ) ON CONFLICT (hotel_id, business_date) DO NOTHING;
  END LOOP;
  RAISE NOTICE 'Night-audit legacy records without a valid explicit business date: %. Original rows retained.', skipped;
END;
$backfill$;

-- All elevated access lives in a non-exposed schema. This primitive authorizes
-- BOTH read and close from the JWT subject + hotel membership + active staff row.
-- Older Clerk "supabase" templates only carry sub; membership remains mandatory.
-- When a signed active-org claim is present it narrows access further.
-- Public RPC wrappers are SECURITY INVOKER. No service-role bypass is provided.
CREATE FUNCTION night_audit_private.business_date_review(
  p_hotel_id uuid, p_business_date text, p_close boolean, p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_hotel public.hotels%ROWTYPE;
  v_actor public.staff_profiles%ROWTYPE;
  v_receipt public.business_date_closes%ROWTYPE;
  v_date date;
  v_today date;
  v_start timestamptz;
  v_end timestamptz;
  v_summary jsonb;
  v_replayed boolean := false;
BEGIN
  IF p_close IS NULL THEN
    RAISE EXCEPTION 'Invalid review mode.' USING ERRCODE = '22023';
  END IF;
  SELECT h.* INTO v_hotel FROM public.hotels h
    WHERE h.id = p_hotel_id
      AND (coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id') IS NULL
        OR h.clerk_org_id = coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id'))
      AND coalesce(h.status, 'active') = 'active'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active hotel access is required.' USING ERRCODE = '42501';
  END IF;
  SELECT sp.* INTO v_actor FROM public.staff_profiles sp
    WHERE sp.clerk_org_id = v_hotel.clerk_org_id
      AND sp.clerk_user_id = auth.jwt()->>'sub'
      AND sp.is_active IS TRUE
      AND public.staff_role_level(sp.role) >= public.staff_role_level(CASE WHEN p_close THEN 'manager' ELSE 'read_only' END)
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active authorized staff access is required; closing requires a manager.'
      USING ERRCODE = '42501';
  END IF;
  IF v_hotel.timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_hotel.timezone
  ) THEN
    RAISE EXCEPTION 'Set a valid property timezone before reviewing a business date.' USING ERRCODE = '22023';
  END IF;
  IF v_hotel.currency IS NULL OR v_hotel.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Set a valid property currency before reviewing a business date.' USING ERRCODE = '22023';
  END IF;
  v_today := (statement_timestamp() AT TIME ZONE v_hotel.timezone)::date;
  IF p_business_date IS NULL AND NOT p_close THEN
    v_date := v_today - 1;
  ELSE
    IF p_business_date IS NULL OR p_business_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Business date must be a real YYYY-MM-DD date.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_date := p_business_date::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Business date must be a real YYYY-MM-DD date.' USING ERRCODE = '22023';
    END;
  END IF;
  IF v_date < DATE '2000-01-01' OR v_date > v_today THEN
    RAISE EXCEPTION 'Business date must be between 2000-01-01 and the property current date.' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'Notes must not exceed 1000 characters.' USING ERRCODE = '22023';
  END IF;

  IF p_close THEN
    -- Transaction-scoped lock serializes same-key closers; unique constraint is
    -- the final invariant, including if a new writer is introduced later.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'business-date-close:' || p_hotel_id::text || ':' || v_date::text, 0
    ));
  END IF;
  SELECT * INTO v_receipt FROM public.business_date_closes
    WHERE hotel_id = p_hotel_id AND business_date = v_date;
  IF FOUND THEN
    v_replayed := p_close;
    -- Read the receipt, not today's booking/room/payment state. Notes and actor
    -- are first-writer-wins and retries cannot replace them.
    v_summary := v_receipt.summary;
  ELSE
    IF p_close AND v_date >= v_today THEN
      RAISE EXCEPTION 'Wait until this property calendar day has ended before closing it.' USING ERRCODE = '22023';
    END IF;
    v_start := v_date::timestamp AT TIME ZONE v_hotel.timezone;
    v_end := (v_date + 1)::timestamp AT TIME ZONE v_hotel.timezone;
    -- One SQL statement gives every aggregate the same MVCC snapshot. It does
    -- not use PostgREST row listings and is not truncated by the 1,000-row cap.
    WITH stays AS MATERIALIZED (
      SELECT b.* FROM public.bookings b
      WHERE b.hotel_id = p_hotel_id AND b.status IN ('checked_in', 'checked_out')
        AND b.check_in <= v_date AND b.check_out > v_date
    ), reconciled AS (
      SELECT b.id, b.reference, b.rooms_count,
        coalesce(n.night_count, 0) = b.check_out - b.check_in
          AND coalesce(n.valid_nights, false)
          AND n.total_minor = public.to_minor(b.subtotal, b.currency)
          AND b.currency = v_hotel.currency AS valid,
        n.day_minor, n.reconstructed
      FROM stays b
      LEFT JOIN LATERAL (
        SELECT count(*) AS night_count,
          bool_and(bn.stay_date >= b.check_in AND bn.stay_date < b.check_out
            AND bn.currency = v_hotel.currency AND bn.rooms_count = b.rooms_count) AS valid_nights,
          sum(bn.rate_minor::numeric * bn.rooms_count) AS total_minor,
          sum(bn.rate_minor::numeric * bn.rooms_count) FILTER (WHERE bn.stay_date = v_date) AS day_minor,
          bool_or(bn.source = 'reconstructed') AS reconstructed
        FROM public.booking_nights bn
        WHERE bn.booking_id = b.id AND bn.hotel_id = p_hotel_id
      ) n ON true
    ), room_totals AS (
      SELECT count(*) FILTER (WHERE valid IS NOT TRUE) AS issues,
        coalesce(sum(rooms_count), 0) AS room_nights,
        coalesce(sum(day_minor), 0) AS revenue_minor,
        count(*) FILTER (WHERE reconstructed) AS reconstructed_stays
      FROM reconciled
    ), unresolved AS MATERIALIZED (
      SELECT b.id, b.reference, g.full_name AS guest_name, r.room_number,
        CASE WHEN b.status = 'confirmed' THEN 'pending_arrival' ELSE 'pending_departure' END AS kind
      FROM public.bookings b
      LEFT JOIN public.guests g ON g.id = b.guest_id AND g.hotel_id = p_hotel_id
      LEFT JOIN public.rooms r ON r.id = b.room_id AND r.hotel_id = p_hotel_id
      WHERE b.hotel_id = p_hotel_id AND (
        (b.status = 'confirmed' AND b.check_in <= v_date) OR
        (b.status = 'checked_in' AND b.check_out <= v_date)
      )
    ), operation_totals AS (
      SELECT count(*) FILTER (WHERE kind = 'pending_arrival') AS arrivals,
        count(*) FILTER (WHERE kind = 'pending_departure') AS departures FROM unresolved
    ), receipts AS MATERIALIZED (
      SELECT p.* FROM public.payments p WHERE p.hotel_id = p_hotel_id
        AND p.status = 'success' AND p.paid_at >= v_start AND p.paid_at < v_end
    ), payment_totals AS (
      SELECT count(*) FILTER (WHERE currency IS DISTINCT FROM v_hotel.currency) AS issues,
        coalesce(sum(public.to_minor(amount, currency)), 0) AS amount_minor,
        count(*) AS payment_count FROM receipts
    ), methods AS (
      SELECT coalesce(method, 'other') AS method, count(*) AS count,
        sum(public.to_minor(amount, currency))::text AS "amountMinor"
      FROM receipts WHERE currency = v_hotel.currency GROUP BY coalesce(method, 'other')
    )
    SELECT jsonb_build_object(
      'schemaVersion', 1, 'businessDate', v_date, 'timeZone', v_hotel.timezone,
      'currency', v_hotel.currency, 'capturedAt', clock_timestamp(),
      'roomNights', rt.room_nights,
      'roomRevenueMinor', CASE WHEN rt.issues = 0 THEN rt.revenue_minor::text ELSE NULL END,
      'rateIssues', rt.issues, 'reconstructedStays', rt.reconstructed_stays,
      'rateIssueBookings', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'reference', r.reference) ORDER BY r.reference, r.id)
        FROM (SELECT * FROM reconciled WHERE valid IS NOT TRUE ORDER BY reference, id LIMIT 25) r), '[]'::jsonb),
      'pendingArrivals', ot.arrivals, 'pendingDepartures', ot.departures,
      'unresolvedBookings', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'reference', u.reference, 'guestName', coalesce(u.guest_name, 'Unknown guest'),
        'roomNumber', u.room_number, 'type', u.kind) ORDER BY u.reference, u.id)
        FROM (SELECT * FROM unresolved ORDER BY reference, id LIMIT 50) u), '[]'::jsonb),
      'collectionsMinor', CASE WHEN pt.issues = 0 THEN pt.amount_minor::text ELSE NULL END,
      'paymentIssues', pt.issues, 'paymentCount', pt.payment_count,
      'paymentsByMethod', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.method) FROM methods m), '[]'::jsonb)
    ) INTO v_summary FROM room_totals rt CROSS JOIN operation_totals ot CROSS JOIN payment_totals pt;

    IF p_close THEN
      IF (v_summary->>'pendingArrivals')::bigint + (v_summary->>'pendingDepartures')::bigint > 0 THEN
        RAISE EXCEPTION 'Resolve all arrivals and departures due on or before this business date before closing.' USING ERRCODE = '23514';
      END IF;
      IF (v_summary->>'rateIssues')::bigint + (v_summary->>'paymentIssues')::bigint > 0 THEN
        RAISE EXCEPTION 'Reconcile missing nightly charges, room-charge differences, or mixed currencies before closing.' USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.business_date_closes (
        hotel_id, business_date, closed_at, closed_by, closed_by_name, time_zone, notes, source, summary
      ) VALUES (
        p_hotel_id, v_date, clock_timestamp(), v_actor.id, v_actor.full_name,
        v_hotel.timezone, nullif(btrim(p_notes), ''), 'durable_close', v_summary
      ) RETURNING * INTO v_receipt;
      -- Deliberately no EXCEPTION handler: failed persistence aborts the RPC.
      IF v_receipt.id IS NULL THEN
        RAISE EXCEPTION 'Business-date close was not persisted.' USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'businessDate', v_date, 'propertyToday', v_today,
    'isClosed', v_receipt.id IS NOT NULL, 'closeId', v_receipt.id,
    'source', coalesce(v_receipt.source, 'preview'), 'replayed', v_replayed,
    'closedAt', v_receipt.closed_at, 'closedBy', v_receipt.closed_by_name,
    'notes', v_receipt.notes, 'summary', v_summary
  );
END;
$fn$;
REVOKE ALL ON FUNCTION night_audit_private.business_date_review(uuid, text, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION night_audit_private.business_date_review(uuid, text, boolean, text) TO authenticated;

CREATE FUNCTION public.get_night_audit_summary(p_hotel_id uuid, p_business_date text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT night_audit_private.business_date_review(p_hotel_id, p_business_date, false, NULL);
$$;
CREATE FUNCTION public.close_night_audit(p_hotel_id uuid, p_business_date text, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT night_audit_private.business_date_review(p_hotel_id, p_business_date, true, p_notes);
$$;
REVOKE ALL ON FUNCTION public.get_night_audit_summary(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_night_audit(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_night_audit_summary(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_night_audit(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
