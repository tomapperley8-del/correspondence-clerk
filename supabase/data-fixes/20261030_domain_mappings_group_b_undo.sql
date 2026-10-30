-- Undo 20261030_domain_mappings_group_b.sql.
BEGIN;
UPDATE correspondence c SET business_id = (b.before_row->>'business_id')::uuid,
       contact_id = (b.before_row->>'contact_id')::uuid
FROM cc_phase0_backup b
WHERE b.reason = 'group b 2026-10-30' AND b.table_name = 'correspondence' AND c.id = b.row_id;
UPDATE contacts k SET business_id = (b.before_row->>'business_id')::uuid
FROM cc_phase0_backup b
WHERE b.reason = 'group b 2026-10-30' AND b.table_name = 'contacts' AND k.id = b.row_id;
UPDATE businesses x SET name = b.before_row->>'name', normalized_name = b.before_row->>'normalized_name'
FROM cc_phase0_backup b
WHERE b.reason = 'group b 2026-10-30' AND b.table_name = 'businesses' AND x.id = b.row_id;
DELETE FROM domain_mappings WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'group b 2026-10-30' AND table_name = 'domain_mappings');
INSERT INTO domain_mappings SELECT (jsonb_populate_record(NULL::domain_mappings, b.before_row)).*
FROM cc_phase0_backup b WHERE b.reason = 'group b 2026-10-30' AND b.table_name = 'domain_mappings';
DELETE FROM contacts WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'group b 2026-10-30' AND table_name = 'contacts_created');
DELETE FROM businesses WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'group b 2026-10-30' AND table_name = 'businesses_created')
  AND NOT EXISTS (SELECT 1 FROM correspondence c WHERE c.business_id = businesses.id)
  AND NOT EXISTS (SELECT 1 FROM contacts k WHERE k.business_id = businesses.id);
COMMIT;
