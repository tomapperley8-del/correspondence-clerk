-- Undo 30 Oct 2026 West London Chorus tidy (Tom: "can you sort the emails").
-- 1. Put Cleo's two forwarded emails back on Cleopatra Campbell and Alice's role back.
UPDATE correspondence c SET business_id = (b.before_row->>'business_id')::uuid,
       contact_id = (b.before_row->>'contact_id')::uuid, updated_at = now()
FROM cc_phase0_backup b
WHERE b.reason = 'stage17a wlc emails 2026-10-30' AND b.table_name = 'correspondence' AND c.id = b.row_id;
UPDATE contacts k SET role = b.before_row->>'role', updated_at = now()
FROM cc_phase0_backup b
WHERE b.reason = 'stage17a wlc emails 2026-10-30' AND b.table_name = 'contacts' AND k.id = b.row_id;
-- 2. Then undo the merge of Alice Hicks into West London Chorus (the app's own undo):
SELECT undo_last_business_change('fe85e918-d8bf-4ec1-9650-95b02e71d4fc'::uuid);
