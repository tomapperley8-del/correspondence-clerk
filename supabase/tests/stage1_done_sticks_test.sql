-- Stage 1 behaviour test. LOCAL DATABASE ONLY: it ticks, snoozes and un-ticks
-- real task rows and runs the task engine, so never run it against live.
--   docker exec supabase_db_correspondence-clerk psql -U postgres -d postgres -f /tmp/stage1_test.sql
-- Statements run one at a time (autocommit), because refresh_system_tasks()
-- creates a temp table that only drops at commit.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

DROP TABLE IF EXISTS _s1;
CREATE TABLE _s1 (kind text PRIMARY KEY, task_id uuid, signal_key text, cid uuid);

-- One open task of each kind that writes back, plus a renewal to snooze.
INSERT INTO _s1
SELECT DISTINCT ON (k) k, id, signal_key, nullif(split_part(signal_key, ':', 2), '')::uuid
FROM (SELECT split_part(signal_key, ':', 1) AS k, * FROM tasks
      WHERE status = 'open' AND signal_key IS NOT NULL) x
WHERE k IN ('reply', 'commitment', 'editorial', 'corr_flagged')
ORDER BY k, created_at;
INSERT INTO _s1
SELECT 'snooze', id, signal_key, NULL FROM tasks
WHERE status = 'open' AND signal_key LIKE 'renewal_due:%' ORDER BY created_at LIMIT 1;
SELECT 'picked: ' || string_agg(kind, ', ' ORDER BY kind) FROM _s1;

-- Tasks that already carry a snooze, so the engine check below can tell new ones apart.
DROP TABLE IF EXISTS _s1_snoozed_before;
CREATE TABLE _s1_snoozed_before AS
SELECT id FROM tasks WHERE status = 'open' AND signal_meta ? 'snooze_until';

-- 1. Tick them, as the To-dos page does.
UPDATE tasks t SET status = 'done', completed_at = now()
FROM _s1 s WHERE t.id = s.task_id AND s.kind <> 'snooze';

SELECT CASE WHEN bool_and(ok) THEN 'PASS' ELSE 'FAIL' END || ' 1 source written back: '
       || string_agg(kind || '=' || ok, ', ' ORDER BY kind)
FROM (
  SELECT s.kind,
         CASE s.kind
           WHEN 'reply'        THEN c.reply_dismissed_at IS NOT NULL
           WHEN 'editorial'    THEN c.reply_dismissed_at IS NOT NULL
           WHEN 'commitment'   THEN coalesce((c.intent_meta->>'done')::boolean, false)
           WHEN 'corr_flagged' THEN c.action_needed::text = 'none' AND c.due_at IS NULL
         END AS ok
  FROM _s1 s JOIN correspondence c ON c.id = s.cid WHERE s.kind <> 'snooze') r;

-- 2. Snooze the renewal by moving its date, as pressing S does.
UPDATE tasks t SET due_date = CURRENT_DATE + 10 FROM _s1 s WHERE t.id = s.task_id AND s.kind = 'snooze';
SELECT CASE WHEN (t.signal_meta->>'snooze_until')::date = CURRENT_DATE + 10 THEN 'PASS' ELSE 'FAIL' END
       || ' 2 snooze recorded in signal_meta'
FROM tasks t JOIN _s1 s ON s.task_id = t.id AND s.kind = 'snooze';

-- 3. Run the engine three times.
SELECT 'engine run 1: ' || refresh_system_tasks(false)::text;
SELECT 'engine run 2: ' || refresh_system_tasks(false)::text;
SELECT 'engine run 3: ' || refresh_system_tasks(false)::text;

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' 3 ticked items stayed closed (open rows for their keys: ' || count(*) || ')'
FROM tasks t JOIN _s1 s ON s.signal_key = t.signal_key
WHERE s.kind <> 'snooze' AND t.status = 'open';

SELECT CASE WHEN t.due_date = CURRENT_DATE + 10 AND t.status = 'open' THEN 'PASS' ELSE 'FAIL' END
       || ' 4 snooze survived 3 engine runs (due ' || t.due_date || ')'
FROM tasks t JOIN _s1 s ON s.task_id = t.id AND s.kind = 'snooze';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' 5 engine updates not mistaken for snoozes (new snoozes: ' || count(*) || ')'
FROM tasks t
WHERE t.status = 'open' AND t.signal_meta ? 'snooze_until'
  AND t.id NOT IN (SELECT id FROM _s1_snoozed_before)
  AND t.id NOT IN (SELECT task_id FROM _s1 WHERE kind = 'snooze');

-- 4. Un-tick the reply: the email goes back to needing a reply.
UPDATE tasks t SET status = 'open', completed_at = NULL FROM _s1 s WHERE t.id = s.task_id AND s.kind = 'reply';
SELECT CASE WHEN c.reply_dismissed_at IS NULL AND NOT (t.signal_meta ? 'written_back_at') THEN 'PASS' ELSE 'FAIL' END
       || ' 6 un-tick restored the email'
FROM _s1 s JOIN correspondence c ON c.id = s.cid JOIN tasks t ON t.id = s.task_id WHERE s.kind = 'reply';

SELECT 'engine run 4: ' || refresh_system_tasks(false)::text;
SELECT CASE WHEN count(*) = 1 AND bool_and(t.status = 'open') THEN 'PASS' ELSE 'FAIL' END
       || ' 7 un-ticked reply is one open task (rows: ' || count(*) || ')'
FROM tasks t JOIN _s1 s ON s.signal_key = t.signal_key AND s.kind = 'reply';

-- 5. Reply tasks are dated by the day the email arrived.
SELECT CASE WHEN count(*) FILTER (WHERE t.due_date <> c.entry_date::date) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' 8 reply tasks dated by arrival (' || count(*) || ' checked, oldest due ' || min(t.due_date) || ')'
FROM tasks t JOIN correspondence c ON c.id = split_part(t.signal_key, ':', 2)::uuid
WHERE t.status = 'open' AND t.signal_key LIKE 'reply:%'
  AND NOT (t.signal_meta ? 'snooze_until');

DROP TABLE _s1;
DROP TABLE _s1_snoozed_before;
