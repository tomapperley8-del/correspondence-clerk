-- Undo 20261024_stage11b_1_categories.sql: puts each changed category back as it was.
-- Relabels the backup 'stage11b_categories_2026_10_24_undone' so the script could run again.
-- Run with psql -v ON_ERROR_STOP=1.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage11b_categories_2026_10_24') THEN
    RAISE EXCEPTION 'stage11b_categories_2026_10_24 is not applied';
  END IF;
END $$;

UPDATE businesses b SET category = k.before_row->>'category'
FROM cc_phase0_backup k
WHERE k.reason = 'stage11b_categories_2026_10_24' AND k.table_name = 'businesses' AND k.row_id = b.id;

UPDATE cc_phase0_backup SET reason = 'stage11b_categories_2026_10_24_undone' WHERE reason = 'stage11b_categories_2026_10_24';

COMMIT;
