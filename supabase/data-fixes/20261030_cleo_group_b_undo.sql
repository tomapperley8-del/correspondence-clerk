-- Undo 30 Oct 2026 group B of Cleo's forwards (Tom's answers: orchestra, Hounslow Symphony, Dukes Meadows
-- Trust and the artist get records; Gifford Circus and Sumi Sastri get theirs).
-- 1. Emails back to their earlier business and contact.
UPDATE correspondence c SET business_id = (b.before_row->>'business_id')::uuid,
       contact_id = (b.before_row->>'contact_id')::uuid,
       reply_dismissed_at = (b.before_row->>'reply_dismissed_at')::timestamptz, updated_at = now()
FROM cc_phase0_backup b
WHERE b.reason = 'cleo group B 2026-10-30' AND b.table_name = 'correspondence' AND c.id = b.row_id;
-- 2. The two moved contacts back (info@ to B&Q CHISWICK, publicity@ to PHO).
UPDATE contacts k SET business_id = (b.before_row->>'business_id')::uuid, updated_at = now()
FROM cc_phase0_backup b
WHERE b.reason = 'cleo group B 2026-10-30' AND b.table_name = 'contacts' AND k.id = b.row_id;
-- 3. Remove the four records created (and the two contacts added to them).
DELETE FROM contacts WHERE business_id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'cleo group B 2026-10-30' AND table_name = 'businesses_created');
DELETE FROM businesses WHERE id IN (SELECT row_id FROM cc_phase0_backup
  WHERE reason = 'cleo group B 2026-10-30' AND table_name = 'businesses_created');
