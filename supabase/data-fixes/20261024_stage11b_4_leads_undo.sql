-- Undo 20261024_stage11b_4_leads.sql: puts the leads and linked businesses back and removes the businesses it made (refused if anything has been added to them since).
-- Relabels the backup 'stage11b_leads_2026_10_24_undone' so the script could run again.
-- Run with psql -v ON_ERROR_STOP=1.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage11b_leads_2026_10_24') THEN
    RAISE EXCEPTION 'stage11b_leads_2026_10_24 is not applied';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cc_phase0_backup k WHERE k.reason = 'stage11b_leads_2026_10_24' AND k.table_name = 'businesses' AND k.before_row->>'stage11b' = 'created'
             AND (EXISTS (SELECT 1 FROM correspondence c WHERE c.business_id = k.row_id)
               OR EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = k.row_id)
               OR EXISTS (SELECT 1 FROM contracts c WHERE c.business_id = k.row_id)
               OR EXISTS (SELECT 1 FROM tasks t WHERE t.business_id = k.row_id))) THEN
    RAISE EXCEPTION 'a new business has entries, contacts, contracts or tasks now; undo by hand';
  END IF;
END $$;

UPDATE prospect_leads l SET matched_business_id = (k.before_row->>'matched_business_id')::uuid,
  match_type = k.before_row->>'match_type', status = k.before_row->>'status'
FROM cc_phase0_backup k WHERE k.reason = 'stage11b_leads_2026_10_24' AND k.table_name = 'prospect_leads' AND k.row_id = l.id;

UPDATE businesses b SET outreach_stage = k.before_row->>'outreach_stage',
  outreach_identified_at = (k.before_row->>'outreach_identified_at')::date
FROM cc_phase0_backup k WHERE k.reason = 'stage11b_leads_2026_10_24' AND k.table_name = 'businesses' AND k.before_row->>'stage11b' IS NULL AND k.row_id = b.id;

DELETE FROM businesses b USING cc_phase0_backup k
WHERE k.reason = 'stage11b_leads_2026_10_24' AND k.table_name = 'businesses' AND k.before_row->>'stage11b' = 'created' AND k.row_id = b.id;

UPDATE cc_phase0_backup SET reason = 'stage11b_leads_2026_10_24_undone' WHERE reason = 'stage11b_leads_2026_10_24';

COMMIT;
