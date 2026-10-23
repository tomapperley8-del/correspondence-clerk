-- Undo 20261024_stage11b_3_contacts.sql: puts each touched contact's emails and phones back as they were.
-- Relabels the backup 'stage11b_contacts_2026_10_24_undone' so the script could run again.
-- Run with psql -v ON_ERROR_STOP=1.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage11b_contacts_2026_10_24') THEN
    RAISE EXCEPTION 'stage11b_contacts_2026_10_24 is not applied';
  END IF;
END $$;

UPDATE contacts k SET emails = nullif(c.before_row->'emails', 'null'::jsonb), phones = nullif(c.before_row->'phones', 'null'::jsonb)
FROM cc_phase0_backup c
WHERE c.reason = 'stage11b_contacts_2026_10_24' AND c.table_name = 'contacts' AND c.row_id = k.id;

UPDATE cc_phase0_backup SET reason = 'stage11b_contacts_2026_10_24_undone' WHERE reason = 'stage11b_contacts_2026_10_24';

COMMIT;
