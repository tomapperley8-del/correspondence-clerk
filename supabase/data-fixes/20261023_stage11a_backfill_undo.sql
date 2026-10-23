-- Undo for 20261023_stage11a_backfill.sql: stops the nightly refresh and puts
-- status and last_contacted_at back from the earliest Stage 11a backup of each
-- business. Run the migration rollback afterwards if the truth layer is to go too
-- (otherwise the contract triggers keep refreshing single businesses).
SELECT cron.unschedule('refresh-business-truth')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-business-truth');

UPDATE public.businesses b
SET status = k.before_row->>'status',
    last_contacted_at = (k.before_row->>'last_contacted_at')::timestamptz
FROM (
  SELECT DISTINCT ON (row_id) row_id, before_row
  FROM public.cc_phase0_backup
  WHERE table_name = 'businesses' AND reason LIKE 'stage11a truth %'
  ORDER BY row_id, taken_at, id
) k
WHERE b.id = k.row_id;
