-- Undo 20261030_sv_london_emails.sql: S&V LONDON's emails and contacts back, the 11 new records,
-- their new contacts and domain mappings removed. (The S&V mappings themselves stay removed; to
-- bring those back too, run 20261030_domain_mappings_cleanup_undo.sql.)
BEGIN;
UPDATE correspondence c SET business_id = (b.before_row->>'business_id')::uuid,
       contact_id = (b.before_row->>'contact_id')::uuid
FROM cc_phase0_backup b
WHERE b.reason = 'sv london 2026-10-30' AND b.table_name = 'correspondence' AND c.id = b.row_id;
UPDATE contacts k SET business_id = (b.before_row->>'business_id')::uuid, emails = b.before_row->'emails',
       normalized_email = b.before_row->>'normalized_email'
FROM cc_phase0_backup b
WHERE b.reason = 'sv london 2026-10-30' AND b.table_name = 'contacts' AND k.id = b.row_id;
DELETE FROM domain_mappings WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'sv london 2026-10-30' AND table_name = 'domain_mappings_created');
DELETE FROM contacts WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'sv london 2026-10-30' AND table_name = 'contacts_created');
DELETE FROM businesses WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'sv london 2026-10-30' AND table_name = 'businesses_created')
  AND NOT EXISTS (SELECT 1 FROM correspondence c WHERE c.business_id = businesses.id)
  AND NOT EXISTS (SELECT 1 FROM contacts k WHERE k.business_id = businesses.id);
COMMIT;
