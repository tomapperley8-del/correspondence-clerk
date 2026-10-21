-- Rollback for 20261021_001_done_sticks.sql. Run by hand only; not a migration.
-- Restores the definitions and rule settings saved by the migration itself.
--
-- Not reversed: v_inbound_tails keeps its extra reply_dismissed_at column,
-- because a view cannot drop a column in place and v_task_signals depends on
-- it. The column is harmless once v_task_signals no longer reads it.
-- Writes already made to correspondence (reply_dismissed_at, intent_meta.done,
-- cleared follow-up flags) stay; each one is listed on its task's signal_meta
-- (written_back_at, previous_flag) if they ever need undoing.

BEGIN;

DROP TRIGGER IF EXISTS tasks_write_back_to_source ON public.tasks;
DROP FUNCTION IF EXISTS public.tasks_write_back_to_source();

DO $$
DECLARE v text;
BEGIN
  SELECT before_row->>'def' INTO v FROM cc_phase0_backup
  WHERE reason = 'stage1_done_sticks_2026_10_21' AND row_id = md5('v_task_signals')::uuid
  ORDER BY taken_at DESC LIMIT 1;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_task_signals AS ' || v;

  SELECT before_row->>'def' INTO v FROM cc_phase0_backup
  WHERE reason = 'stage1_done_sticks_2026_10_21' AND row_id = md5('refresh_system_tasks')::uuid
  ORDER BY taken_at DESC LIMIT 1;
  EXECUTE v;
END $$;

UPDATE task_rules r
SET params = (k.before_row->'params')
FROM cc_phase0_backup k
WHERE k.reason = 'stage1_done_sticks_2026_10_21'
  AND k.table_name = 'task_rules'
  AND k.row_id = md5(r.id)::uuid;

COMMIT;
