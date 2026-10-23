-- Stage 12 (UI overhaul): meetings, events and newsletter items never go overdue.
--
-- Tom, 23 Oct 2026: past meetings and events "obviously shouldn't be overdue,
-- if they're gone, just get rid of them". They are hand-written tasks, so
-- without this they would count as overdue to-dos in Do now, the nav badge,
-- v_business_attention and the desk email. Closing them in the database keeps
-- every one of those readers in step without changing any of them.
--
-- Each night, just after midnight London time:
--   * open Meeting and Event tasks dated before today are closed (status done),
--     marked signal_meta.auto_closed = 'date_passed' so they can be found again;
--   * open For Newsletter tasks dated before today move to the coming
--     Wednesday, so an item not used yet stays on the list instead of being lost
--     (signal_meta.rolled_from keeps the old date).
-- Calls and deadlines are left alone: those are still to do.
--
-- cc.task_engine is set for the run so tasks_write_back_to_source doesn't
-- record the newsletter roll-forward as a snooze.
-- Rollback: supabase/migrations/rollback/20261023_002_calendar_tidy_rollback.sql

CREATE OR REPLACE FUNCTION public.tidy_calendar_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_today date := cc_today();
  v_wednesday date := v_today + ((3 - extract(isodow FROM v_today)::int + 7) % 7);
  v_closed int;
  v_rolled int;
BEGIN
  PERFORM set_config('cc.task_engine', 'on', true);

  UPDATE tasks t
  SET status = 'done',
      completed_at = now(),
      signal_meta = coalesce(t.signal_meta, '{}'::jsonb)
                    || jsonb_build_object('auto_closed', 'date_passed', 'auto_closed_at', now())
  FROM task_categories c
  WHERE c.id = t.task_category_id
    AND c.name IN ('Meeting', 'Event')
    AND t.status = 'open'
    AND t.source = 'manual'
    AND t.due_date < v_today;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE tasks t
  SET signal_meta = coalesce(t.signal_meta, '{}'::jsonb)
                    || jsonb_build_object('rolled_from', t.due_date, 'rolled_at', now()),
      due_date = v_wednesday
  FROM task_categories c
  WHERE c.id = t.task_category_id
    AND c.name = 'For Newsletter'
    AND t.status = 'open'
    AND t.source = 'manual'
    AND t.due_date < v_today;
  GET DIAGNOSTICS v_rolled = ROW_COUNT;

  PERFORM set_config('cc.task_engine', 'off', true);
  RETURN jsonb_build_object('today', v_today, 'meetings_events_closed', v_closed,
                            'newsletter_rolled', v_rolled, 'newsletter_to', v_wednesday);
END
$$;

REVOKE ALL ON FUNCTION public.tidy_calendar_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tidy_calendar_tasks() TO service_role;

-- 00:05 UTC is just after midnight London time in both GMT and BST.
SELECT cron.schedule('tidy-calendar', '5 0 * * *', $cron$SELECT public.tidy_calendar_tasks();$cron$);
