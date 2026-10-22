-- Undo 20261022_stage9_mastersheet.sql: puts notes, email and phone back on each touched business exactly
-- as they were (reason 'stage9_mastersheet_2026_10_22'), leaving any other later edits alone, and relabels that backup so the
-- script could be run again. updated_at is stamped afresh by the trigger.
-- Run with psql -v ON_ERROR_STOP=1.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage9_mastersheet_2026_10_22') THEN
    RAISE EXCEPTION 'stage9_mastersheet_2026_10_22 is not applied';
  END IF;
END $$;

UPDATE businesses b SET
  notes = k.before_row->>'notes',
  email = k.before_row->>'email',
  phone = k.before_row->>'phone'
FROM cc_phase0_backup k
WHERE k.reason = 'stage9_mastersheet_2026_10_22' AND k.table_name = 'businesses' AND k.row_id = b.id;

UPDATE cc_phase0_backup SET reason = 'stage9_mastersheet_2026_10_22_undone' WHERE reason = 'stage9_mastersheet_2026_10_22';

COMMIT;
