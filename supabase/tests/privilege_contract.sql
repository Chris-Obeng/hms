-- Client and service-role privilege contract.

BEGIN;

\set ON_ERROR_STOP on

DO $privileges$
DECLARE
  v_role text;
  v_table text;
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.payments', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot read payments';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['PUBLIC', 'anon', 'authenticated'] LOOP
    FOREACH v_table IN ARRAY ARRAY[
      'booking_reference_counters',
      'notification_delivery_outbox',
      'notification_logs'
    ] LOOP
      IF has_table_privilege(v_role, 'public.' || v_table, 'SELECT')
         OR has_table_privilege(v_role, 'public.' || v_table, 'INSERT')
         OR has_table_privilege(v_role, 'public.' || v_table, 'UPDATE')
         OR has_table_privilege(v_role, 'public.' || v_table, 'DELETE') THEN
        RAISE EXCEPTION 'FAIL % can access service-only table %', v_role, v_table;
      END IF;
    END LOOP;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.payments', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.payments', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL authenticated can mutate payments directly';
  END IF;

  IF has_function_privilege(
       'PUBLIC',
       'public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)',
       'EXECUTE')
     OR has_function_privilege(
       'anon',
       'public.record_payment_atomic(uuid, uuid, numeric, text, text, text, uuid)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL public or anon can execute record_payment_atomic';
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
       '(anon|authenticated)=[^,}]*(D|x|t|m)' THEN
    RAISE EXCEPTION 'FAIL client roles retain elevated default table privileges: %', v_acl;
  END IF;
END
$defaults$;

ROLLBACK;
