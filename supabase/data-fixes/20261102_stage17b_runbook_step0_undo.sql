-- Undo 20261102_stage17b_runbook_step0.sql: the daily_desk runbook back to the text it had.
BEGIN;
UPDATE system_runbook r SET body = b.before_row->>'body', updated_at = now()
FROM cc_phase0_backup b
WHERE b.reason = 'stage17b runbook 2026-11-02' AND b.table_name = 'system_runbook' AND r.id = 'daily_desk'
  AND b.id = (SELECT max(id) FROM cc_phase0_backup WHERE reason = 'stage17b runbook 2026-11-02' AND table_name = 'system_runbook');
COMMIT;
