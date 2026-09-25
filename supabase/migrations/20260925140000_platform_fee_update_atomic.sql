-- Atomic platform-fee update + audit in one transaction.
--
-- Replaces the two-step write in the platform settings action (UPDATE
-- platform_settings, then a separate audit INSERT whose failure was only logged):
-- a fee change could persist with no audit trail, and the before-state read could
-- fall back to a zero-fee default when the read errored, poisoning the audit.
-- Here the before-state is captured under FOR UPDATE, the row is updated, and the
-- audit row is written in the same transaction — either all land or none do.
--
-- SECURITY DEFINER, service-role only. Called from the platform admin action via
-- supabaseAdmin. Re-runnable (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.update_platform_fee_atomic(
  p_admin_id          uuid,
  p_admin_email       text,
  p_fee_type          text,
  p_fee_percent       numeric,
  p_fee_flat_minor    bigint,
  p_fee_flat_currency text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_currency     text    := upper(p_fee_flat_currency);
  v_fee_percent  numeric := round(p_fee_percent, 2);
  v_b_type       text;
  v_b_percent    numeric;
  v_b_flat_minor bigint;
  v_b_currency   text;
BEGIN
  -- Validate — last line of defence behind the server action.
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin id is required';
  END IF;
  IF p_fee_type NOT IN ('percentage', 'flat') THEN
    RAISE EXCEPTION 'invalid fee_type: %', p_fee_type;
  END IF;
  IF v_fee_percent < 0 OR v_fee_percent > 100 THEN
    RAISE EXCEPTION 'fee_percent out of range: %', v_fee_percent;
  END IF;
  -- Sane upper bound on the flat fee; settlement caps it to the charge anyway.
  IF p_fee_flat_minor < 0 OR p_fee_flat_minor > 1000000000000 THEN
    RAISE EXCEPTION 'fee_flat_minor out of range: %', p_fee_flat_minor;
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid currency: %', p_fee_flat_currency;
  END IF;

  -- Capture before-state under lock — consistent snapshot, no zero-fee fallback.
  SELECT fee_type, fee_percent, fee_flat_minor, fee_flat_currency
    INTO v_b_type, v_b_percent, v_b_flat_minor, v_b_currency
    FROM public.platform_settings
   WHERE id = 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_settings row (id = 1) is missing';
  END IF;

  UPDATE public.platform_settings
     SET fee_type          = p_fee_type,
         fee_percent       = v_fee_percent,
         fee_flat_minor    = p_fee_flat_minor,
         fee_flat_currency = v_currency,
         updated_at        = now(),
         updated_by        = p_admin_id
   WHERE id = 1;

  INSERT INTO public.platform_admin_audit_logs (
    admin_id, admin_email, action, hotel_id,
    entity_type, entity_id, before_state, after_state
  ) VALUES (
    p_admin_id, p_admin_email, 'platform.fee_update', NULL,
    'platform_settings', '1',
    jsonb_build_object(
      'feeType', v_b_type,
      'feePercent', v_b_percent,
      'feeFlatMinor', v_b_flat_minor,
      'feeFlatCurrency', v_b_currency
    ),
    jsonb_build_object(
      'feeType', p_fee_type,
      'feePercent', v_fee_percent,
      'feeFlatMinor', p_fee_flat_minor,
      'feeFlatCurrency', v_currency
    )
  );
END
$fn$;

COMMENT ON FUNCTION public.update_platform_fee_atomic(
  uuid, text, text, numeric, bigint, text
) IS
  'Updates the platform_settings singleton (id = 1) and writes a platform_admin_audit_logs row in one transaction: before-state captured under FOR UPDATE, row updated, audit inserted. All-or-nothing; replaces the non-atomic UPDATE+INSERT in the platform settings action.';

REVOKE ALL ON FUNCTION public.update_platform_fee_atomic(
  uuid, text, text, numeric, bigint, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_platform_fee_atomic(
  uuid, text, text, numeric, bigint, text
) TO service_role;

-- Guard: same posture as the group RPCs (VOLATILE, SECURITY DEFINER, no
-- anon/authenticated EXECUTE, service_role can call).
DO $guard$
DECLARE
  v_sig  text := 'public.update_platform_fee_atomic(uuid, text, text, numeric, bigint, text)';
  v_prov "char";
  v_sec  boolean;
BEGIN
  SELECT p.provolatile, p.prosecdef INTO v_prov, v_sec
    FROM pg_proc p WHERE p.oid = v_sig::regprocedure;

  IF v_prov <> 'v' THEN
    RAISE EXCEPTION '% must be VOLATILE, found %', v_sig, v_prov;
  END IF;
  IF NOT v_sec THEN
    RAISE EXCEPTION '% must be SECURITY DEFINER', v_sig;
  END IF;
  IF has_function_privilege('anon', v_sig::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', v_sig::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '% must not be callable by anon or authenticated', v_sig;
  END IF;
  IF NOT has_function_privilege('service_role', v_sig::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '% must be callable by service_role', v_sig;
  END IF;
END;
$guard$;
