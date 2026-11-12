-- Client and service-role privilege contract.

BEGIN;

\set ON_ERROR_STOP on

DO $privileges$
DECLARE
  v_role  text;
  v_table text;
  v_bad   text;
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.payments', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot read payments';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    FOREACH v_table IN ARRAY ARRAY[
      'booking_reference_counters',
      'notification_delivery_outbox',
      'notification_logs',
      'staff_invitations',
      'channel_credentials',
      'ari_sync_outbox',
      'payment_attempts',
      'platform_settings'
    ] LOOP
      IF has_table_privilege(v_role, 'public.' || v_table, 'SELECT')
         OR has_table_privilege(v_role, 'public.' || v_table, 'INSERT')
         OR has_table_privilege(v_role, 'public.' || v_table, 'UPDATE')
         OR has_table_privilege(v_role, 'public.' || v_table, 'DELETE') THEN
        RAISE EXCEPTION 'FAIL % can access service-only table %', v_role, v_table;
      END IF;
    END LOOP;
  END LOOP;

  -- anon has no direct table privileges anywhere in public
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND (
       has_table_privilege('anon', c.oid, 'SELECT')
       OR has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE')
       OR has_table_privilege('anon', c.oid, 'TRUNCATE')
     );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL anon retains table privileges on public tables: %', v_bad;
  END IF;

  IF has_table_privilege('authenticated', 'public.payments', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.payments', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL authenticated can mutate payments directly';
  END IF;

  IF has_function_privilege(
       'public',
       'public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)',
       'EXECUTE')
     OR has_function_privilege(
       'anon',
       'public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL public or anon can execute record_payment_atomic';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.room_type_available_counts(uuid[], date, date)',
       'EXECUTE')
     OR has_function_privilege(
       'anon',
       'public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute pricing or availability SECURITY DEFINER RPCs';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)',
       'EXECUTE')
     OR NOT has_function_privilege(
       'service_role',
       'public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL intended role lacks record_payment_atomic execute';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.user_has_staff_role(uuid, text[])',
       'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated lacks legacy policy helper execute';
  END IF;

  RAISE NOTICE 'PASS privilege_contract: service-only tables, anon revokes, and payment RPC grants verified';
END
$privileges$;

DO $defaults$
DECLARE
  v_acl aclitem[];
BEGIN
  SELECT defaclacl INTO v_acl
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
   WHERE d.defaclrole = 'postgres'::regrole
     AND n.nspname = 'public'
     AND d.defaclobjtype = 'r';

  IF coalesce(v_acl, '{}'::aclitem[])::text ~
       '(anon|authenticated)=[^,}/]*(D|x|t|m)' THEN
    RAISE EXCEPTION 'FAIL client roles retain elevated default table privileges: %', v_acl;
  END IF;

  RAISE NOTICE 'PASS privilege_contract: default ACLs hold no elevated D/x/t/m client bits';
END
$defaults$;

ROLLBACK;
