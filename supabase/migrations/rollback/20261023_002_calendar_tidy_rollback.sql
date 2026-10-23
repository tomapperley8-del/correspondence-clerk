-- Rollback for 20261023_002_calendar_tidy.sql: stop the nightly job and drop the function.
SELECT cron.unschedule('tidy-calendar');
DROP FUNCTION IF EXISTS public.tidy_calendar_tasks();

-- Optional: reopen meetings and events the job closed (run only if Tom asks).
-- UPDATE tasks SET status = 'open', completed_at = NULL,
--        signal_meta = signal_meta - 'auto_closed' - 'auto_closed_at'
-- WHERE signal_meta->>'auto_closed' = 'date_passed';
-- Newsletter items it moved keep their new date; signal_meta.rolled_from has the old one.
