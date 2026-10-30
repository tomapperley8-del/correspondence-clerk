-- Undo 20261030_british_podcast_awards.sql.
BEGIN;
UPDATE correspondence c SET business_id = (b.before_row->>'business_id')::uuid,
       contact_id = (b.before_row->>'contact_id')::uuid
FROM cc_phase0_backup b
WHERE b.reason = 'podcast awards 2026-10-30' AND b.table_name = 'correspondence' AND c.id = b.row_id;
UPDATE contacts k SET business_id = (b.before_row->>'business_id')::uuid
FROM cc_phase0_backup b
WHERE b.reason = 'podcast awards 2026-10-30' AND b.table_name = 'contacts' AND k.id = b.row_id;
DELETE FROM businesses WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'podcast awards 2026-10-30' AND table_name = 'businesses_created')
  AND NOT EXISTS (SELECT 1 FROM correspondence c WHERE c.business_id = businesses.id)
  AND NOT EXISTS (SELECT 1 FROM contacts k WHERE k.business_id = businesses.id);
COMMIT;
