-- Stage 10: refresh_business_truth() also clears the stored last-in-touch date when the
-- business has no emails left (it used to keep the old date, so Data health flagged the
-- row for ever). Only the function body changes; before-images still go to cc_phase0_backup.
CREATE OR REPLACE FUNCTION public.refresh_business_truth(p_business_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET client_min_messages TO 'warning'
AS $function$
DECLARE
  n integer;
  why text := 'stage11a truth ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS');
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _truth_changes (id uuid PRIMARY KEY, status text, last_contacted_at timestamptz) ON COMMIT DROP;
  TRUNCATE _truth_changes;

  INSERT INTO _truth_changes
  SELECT v.id, v.status, v.last_contacted_at
  FROM v_businesses v
  WHERE (p_business_id IS NULL OR v.id = p_business_id)
    AND (v.status IS DISTINCT FROM v.status_stored
         OR v.last_contacted_at IS DISTINCT FROM v.last_contacted_at_stored);

  INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
  SELECT 'businesses', b.id, to_jsonb(b), why
  FROM businesses b JOIN _truth_changes c ON c.id = b.id;

  UPDATE businesses b
  SET status = c.status,
      last_contacted_at = c.last_contacted_at
  FROM _truth_changes c
  WHERE b.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;
