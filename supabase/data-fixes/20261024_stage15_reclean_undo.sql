-- Undo 20261024_stage15_reclean.sql: puts each re-cleaned email's formatted_text_current and
-- formatting_status back as they were. Skips a row someone has corrected by hand since (edited_at set).
-- Relabels the backup 'stage15_reclean_2026_10_24_undone' so the script could run again.
-- Run with psql -v ON_ERROR_STOP=1, before rolling back migration 20261024_004_stage15_cleaned.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage15_reclean_2026_10_24') THEN
    RAISE EXCEPTION 'stage15_reclean_2026_10_24 is not applied';
  END IF;
END $$;

UPDATE correspondence k
SET formatted_text_current = b.before_row->>'formatted_text_current',
    formatting_status = b.before_row->>'formatting_status'
FROM cc_phase0_backup b
WHERE b.reason = 'stage15_reclean_2026_10_24' AND b.table_name = 'correspondence' AND b.row_id = k.id
  AND k.edited_at IS NULL;

UPDATE cc_phase0_backup SET reason = 'stage15_reclean_2026_10_24_undone' WHERE reason = 'stage15_reclean_2026_10_24';

COMMIT;
