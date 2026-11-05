-- Undo 20261105_audit_data_fixes.sql from the before-images (reason 'audit 2026-11-05').
-- The Robert Dyas merge is undone by hand from the 'merge_businesses' row (src = the record as it
-- was; result = what moved): clear merged_into and status on the source and move its email and
-- contact back.
BEGIN;
UPDATE contracts c SET is_current = (b.before_row->>'is_current')::boolean
FROM cc_phase0_backup b WHERE b.reason = 'audit 2026-11-05' AND b.table_name = 'contracts' AND b.row_id = c.id;
INSERT INTO contracts SELECT (jsonb_populate_record(NULL::contracts, b.before_row)).*
FROM cc_phase0_backup b WHERE b.reason = 'audit 2026-11-05' AND b.table_name = 'contracts'
  AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.id = b.row_id);
INSERT INTO contacts SELECT (jsonb_populate_record(NULL::contacts, b.before_row)).*
FROM cc_phase0_backup b WHERE b.reason = 'audit 2026-11-05' AND b.table_name = 'contacts'
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = b.row_id);
UPDATE correspondence r SET business_id = (b.before_row->>'business_id')::uuid
FROM cc_phase0_backup b WHERE b.reason = 'audit 2026-11-05' AND b.table_name = 'correspondence' AND b.row_id = r.id;
INSERT INTO domain_mappings SELECT (jsonb_populate_record(NULL::domain_mappings, b.before_row)).*
FROM cc_phase0_backup b WHERE b.reason = 'audit 2026-11-05' AND b.table_name = 'domain_mappings'
  AND NOT EXISTS (SELECT 1 FROM domain_mappings m WHERE m.id = b.row_id);
SELECT refresh_business_truth(NULL);
COMMIT;
