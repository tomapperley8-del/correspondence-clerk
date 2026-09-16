-- 20260916_002_routine_heartbeats.sql
--
-- Applied 2026-09-16.
--
-- WHY
--
-- On 14 and 15 Sep every cloud routine (daily desk, outreach, prospecting)
-- stopped after one turn because the account's weekly usage limit was reached.
-- Nothing noticed. A routine that never starts cannot report its own failure,
-- so the check has to live somewhere that always runs: the database.
--
-- HOW
--
-- Each routine's last act is one INSERT into routine_heartbeat. At 10:30 UTC
-- every day, check_routine_heartbeats() compares that against
-- routine_schedule. Any routine that was due and has no heartbeat for today
-- gets an open priority task on Tom's list. When the routine next finishes,
-- the task closes itself.
--
-- The tasks carry no rule_id in signal_meta, so refresh_system_tasks() leaves
-- them alone, and a non-null signal_key gets them past
-- block_legacy_task_generators().

CREATE TABLE IF NOT EXISTS public.routine_heartbeat (
  id          bigserial PRIMARY KEY,
  routine     text        NOT NULL,
  ran_on      date        NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  finished_at timestamptz NOT NULL DEFAULT now(),
  summary     text
);
CREATE INDEX IF NOT EXISTS idx_routine_heartbeat_day ON public.routine_heartbeat (routine, ran_on);

COMMENT ON TABLE public.routine_heartbeat IS
  'One row per completed cloud routine run. Written by the routine as its last step: INSERT INTO routine_heartbeat (routine, summary) VALUES (''<key>'', ''<one line>'').';

CREATE TABLE IF NOT EXISTS public.routine_schedule (
  routine      text PRIMARY KEY,
  label        text  NOT NULL,
  iso_days     int[] NOT NULL,   -- 1 = Monday ... 7 = Sunday, UTC
  enabled      boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.routine_schedule IS
  'Which cloud routines should have finished by the 10:30 UTC heartbeat check, and on which days.';

INSERT INTO public.routine_schedule (routine, label, iso_days) VALUES
  ('daily_desk',  'CC daily desk',                    ARRAY[1,2,3,4,5]),
  ('outreach',    'CC daily outreach (drafts only)',  ARRAY[1,2,3,4,5]),
  ('prospecting', 'Business prospecting',             ARRAY[1])
ON CONFLICT (routine) DO UPDATE SET label = EXCLUDED.label, iso_days = EXCLUDED.iso_days;

ALTER TABLE public.routine_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_schedule  ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.routine_heartbeat, public.routine_schedule TO service_role;
GRANT USAGE ON SEQUENCE public.routine_heartbeat_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.check_routine_heartbeats()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'UTC')::date;
  v_opened int := 0;
  v_closed int := 0;
BEGIN
  -- close missed-run tasks for any routine that has since finished
  UPDATE tasks t
  SET status = 'done', completed_at = now(), updated_at = now(),
      notes = coalesce(t.notes,'') || E'\n\n[closed automatically: the routine has run again]'
  WHERE t.status <> 'done'
    AND t.signal_meta->>'kind' = 'routine_missed'
    AND EXISTS (SELECT 1 FROM routine_heartbeat h
                WHERE h.routine = t.signal_meta->>'routine'
                  AND h.finished_at > t.created_at);
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  INSERT INTO tasks (organization_id, title, notes, due_date, status, is_priority,
                     category, source, type, signal_key, signal_meta)
  SELECT '00000000-0000-0000-0000-000000000001',
         'Routine did not finish today: ' || s.label,
         'No completion was recorded for "' || s.label || '" today. '
         || 'The usual cause is the weekly Claude usage limit, or a permission prompt left waiting. '
         || 'Open the routine on claude.ai to see its last run, then run it again. '
         || 'This task closes itself the next time the routine finishes.',
         v_today, 'open', true, 'work', 'signal', 'task',
         'routine_missed:' || s.routine || ':' || v_today,
         jsonb_build_object('kind','routine_missed','routine',s.routine,'day',v_today)
  FROM routine_schedule s
  WHERE s.enabled
    AND extract(isodow FROM v_today)::int = ANY (s.iso_days)
    AND NOT EXISTS (SELECT 1 FROM routine_heartbeat h
                    WHERE h.routine = s.routine AND h.ran_on = v_today)
    AND NOT EXISTS (SELECT 1 FROM tasks t
                    WHERE t.signal_key = 'routine_missed:' || s.routine || ':' || v_today);
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  RETURN jsonb_build_object('opened', v_opened, 'closed', v_closed);
END;
$fn$;

COMMENT ON FUNCTION public.check_routine_heartbeats() IS
  'Opens a priority task for any scheduled cloud routine with no heartbeat today, and closes such tasks once the routine runs again. Scheduled by pg_cron as check-routine-heartbeats, 10:30 UTC daily.';

SELECT cron.schedule('check-routine-heartbeats', '30 10 * * *',
                     $cron$SELECT public.check_routine_heartbeats();$cron$);
