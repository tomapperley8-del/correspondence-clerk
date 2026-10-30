-- Undo 30 Oct 2026 move of 53 forwarded emails from Cleopatra Campbell to the senders' businesses
-- (Tom: "Yes, move group A"; list in supabase/.local/17a/cleo_proposal.md).
UPDATE correspondence c SET business_id = (b.before_row->>'business_id')::uuid,
       contact_id = (b.before_row->>'contact_id')::uuid,
       reply_dismissed_at = (b.before_row->>'reply_dismissed_at')::timestamptz,
       updated_at = now()
FROM cc_phase0_backup b
WHERE b.reason = 'cleo forwards 2026-10-30' AND b.table_name = 'correspondence' AND c.id = b.row_id;
