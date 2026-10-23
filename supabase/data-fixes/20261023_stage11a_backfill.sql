-- Stage 11a go-live data step (run once, after migration 20261023_001_business_truth).
-- 1. Copies the derived status and last in touch from v_businesses onto
--    businesses. refresh_business_truth() backs up every changed row to
--    cc_phase0_backup (reason 'stage11a truth <timestamp>') before changing it.
-- 2. Schedules the nightly refresh at 02:05 UTC (before refresh-system-tasks at
--    02:10), so a deal passing its end date or its 60 days' grace moves the
--    stored status the same night.
-- Undo: 20261023_stage11a_backfill_undo.sql
DO $$
BEGIN
  IF to_regclass('public.v_businesses') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 20261023_001_business_truth first';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-business-truth') THEN
    RAISE EXCEPTION 'Already run: cron job refresh-business-truth exists';
  END IF;
END $$;

SELECT public.refresh_business_truth(NULL) AS businesses_changed;

SELECT cron.schedule('refresh-business-truth', '5 2 * * *', $$SELECT public.refresh_business_truth(NULL)$$);

-- Check: nothing left to change
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.v_businesses
  WHERE status IS DISTINCT FROM status_stored
     OR (last_contacted_at IS NOT NULL AND last_contacted_at IS DISTINCT FROM last_contacted_at_stored);
  IF n > 0 THEN RAISE EXCEPTION '% businesses still differ after the refresh', n; END IF;
END $$;
