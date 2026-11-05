-- Undo 20261105_003_rehome_quickbooks_emails: the pipeline as it was, the function dropped, and
-- every moved email put back from its before-image.
CREATE OR REPLACE FUNCTION public.run_morning_pipeline()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_terms integer; v_one_offs integer; v_qbo jsonb; v_engine jsonb; v_matched integer;
BEGIN
  SELECT count(*) INTO v_terms FROM record_qbo_terms(false);
  v_one_offs := record_qbo_one_offs();
  SELECT jsonb_object_agg(action, affected) INTO v_qbo FROM sync_qbo_to_crm(false);
  v_engine  := refresh_system_tasks(false);
  v_matched := match_prospect_leads();
  RETURN jsonb_build_object('ran_at', now(), 'contracts_from_quickbooks', v_terms,
    'one_off_sales_recorded', v_one_offs, 'qbo', v_qbo, 'engine', v_engine, 'prospects_matched', v_matched);
END $function$;

DROP FUNCTION IF EXISTS public.rehome_quickbooks_emails();

UPDATE correspondence c
SET business_id = (b.before_row->>'business_id')::uuid,
    contact_id = (b.before_row->>'contact_id')::uuid,
    cc_contact_ids = coalesce((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(b.before_row->'cc_contact_ids') x), '{}'),
    direction = b.before_row->>'direction',
    ai_metadata = b.before_row->'ai_metadata'
FROM cc_phase0_backup b
WHERE b.reason = 'rehome quickbooks emails' AND b.table_name = 'correspondence' AND b.row_id = c.id;

SELECT refresh_business_truth(NULL);
