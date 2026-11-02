-- Flag the current contracts ending on the placeholder 2030-01-01 as ongoing (8 rows on 2 Nov 2026).
-- Needs migration 20261102_004. Before-images in cc_phase0_backup (reason 'contract_ongoing 2026-11-02').
-- Undo: 20261102_contract_ongoing_backfill_undo.sql
DO $b$
BEGIN
  IF EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'contract_ongoing 2026-11-02') THEN
    RAISE EXCEPTION 'already applied';
  END IF;
  INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
  X, 'contract_ongoing 2026-11-02'
  FROM contracts c WHERE c.contract_end = DATE '2030-01-01' AND c.is_current AND NOT c.is_ongoing;
  UPDATE contracts c SET is_ongoing = true
  WHERE c.id IN (SELECT row_id::uuid FROM cc_phase0_backup WHERE reason = 'contract_ongoing 2026-11-02');
END $b$;
