-- Undo for 20261102_stage17b_ad_emails.sql: restores linked_business_ids from the before-images and removes the rows it made.
BEGIN;
UPDATE correspondence x
   SET linked_business_ids = ARRAY(SELECT jsonb_array_elements_text(p.before_row->'linked_business_ids')::uuid)
  FROM cc_phase0_backup p
 WHERE p.table_name = 'correspondence' AND p.reason = 'stage17b ad emails 2026-11-02' AND p.row_id = x.id;
DELETE FROM ad_placements WHERE source = 'stage17b ad emails 2026-11-02';
DELETE FROM ad_reports WHERE source = 'stage17b ad emails 2026-11-02';
DELETE FROM ad_email_links;   -- only this script and Data health ticks make rows; Tom's confirmations go with it
COMMIT;
