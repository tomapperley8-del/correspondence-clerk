BEGIN;
UPDATE task_rules r SET enabled = coalesce((b.before_row->>'enabled')::boolean, true)
FROM cc_phase0_backup b WHERE b.reason = 'stage10 rules off 2026-11-02' AND b.table_name = 'task_rules' AND r.id = b.before_row->>'id';
INSERT INTO tasks SELECT (jsonb_populate_record(NULL::tasks, b.before_row)).*
FROM cc_phase0_backup b WHERE b.reason = 'stage10 rules off 2026-11-02' AND b.table_name = 'tasks'
  AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = b.row_id);
DELETE FROM cc_phase0_backup WHERE reason = 'stage10 rules off 2026-11-02';
COMMIT;
