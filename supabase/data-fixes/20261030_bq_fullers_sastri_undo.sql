-- Undo 30 Oct 2026 tidy of B&Q CHISWICK, FULLER'S GRIFFIN (June Ford-Crush) and the Sami Sastri duplicate
-- (Tom: "sort the b and q chiswick thing, take june ford crush off fullers griffin, and fix sami sastri").
-- Run in this order. Before-images: cc_phase0_backup reason 'bq fullers sastri 2026-10-30'.
-- 1. Emails back.
UPDATE correspondence c SET business_id = (b.before_row->>'business_id')::uuid,
       contact_id = (b.before_row->>'contact_id')::uuid, updated_at = now()
FROM cc_phase0_backup b
WHERE b.reason = 'bq fullers sastri 2026-10-30' AND b.table_name = 'correspondence' AND c.id = b.row_id;
-- 2. Changed contacts back; the deleted Sami Sastri duplicate re-inserted.
UPDATE contacts k SET business_id = (b.before_row->>'business_id')::uuid, name = b.before_row->>'name',
       emails = b.before_row->'emails', normalized_email = b.before_row->>'normalized_email',
       name_is_placeholder = (b.before_row->>'name_is_placeholder')::boolean, updated_at = now()
FROM cc_phase0_backup b
WHERE b.reason = 'bq fullers sastri 2026-10-30' AND b.table_name = 'contacts' AND k.id = b.row_id;
INSERT INTO contacts SELECT (jsonb_populate_record(NULL::contacts, b.before_row)).*
FROM cc_phase0_backup b
WHERE b.reason = 'bq fullers sastri 2026-10-30' AND b.table_name = 'contacts'
  AND NOT EXISTS (SELECT 1 FROM contacts k WHERE k.id = b.row_id);
-- 3. Domain mappings back (re-creates chiswickcalendar.co.uk -> B&Q, which was wrong; skip that row if undoing for real).
DELETE FROM domain_mappings WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'bq fullers sastri 2026-10-30' AND table_name = 'domain_mappings');
INSERT INTO domain_mappings SELECT (jsonb_populate_record(NULL::domain_mappings, b.before_row)).*
FROM cc_phase0_backup b WHERE b.reason = 'bq fullers sastri 2026-10-30' AND b.table_name = 'domain_mappings';
-- 4. New contacts and records removed.
DELETE FROM contacts WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'bq fullers sastri 2026-10-30' AND table_name = 'contacts_created');
DELETE FROM businesses WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'bq fullers sastri 2026-10-30' AND table_name = 'businesses_created');
