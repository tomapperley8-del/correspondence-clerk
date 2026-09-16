-- 20260916_003_morning_pipeline.sql
--
-- Applied 2026-09-16. Part of the automation simplification, see
-- docs/automation-changes-2026-09-16.md.
--
-- Moves the deterministic morning work out of the Claude daily desk routine
-- and into one SQL function, called by the app's desk-email cron
-- (/api/cron/desk-email) just before it builds the email, and by pg_cron at
-- 06:50 UTC as a backstop.
--
--   1. sync_qbo_to_crm         (was the separate 07:20 pg_cron job)
--   2. refresh_system_tasks    (was step 5 of the routine, plus 02:10 pg_cron)
--   3. match_prospect_leads    (was step 6 of the routine)
--
-- CONSIDERED AND REJECTED: closing Tom's hand-written tasks in SQL whenever an
-- email goes to the linked business. A dry run found two candidates and both
-- were wrong ("reply to the pilot about payment" would have been closed by an
-- email about their comedy night). Hand-written tasks stay with the routine,
-- which reads them. The engine's own tasks already close themselves when their
-- condition clears, so SQL had nothing to add there.

CREATE OR REPLACE FUNCTION public.match_prospect_leads()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE v integer;
BEGIN
  -- Link a new lead to an existing business only on an exact, unique name.
  UPDATE prospect_leads pl
  SET matched_business_id = b.id,
      match_type = 'existing_no_deal'
  FROM businesses b
  WHERE pl.status = 'new'
    AND pl.matched_business_id IS NULL
    AND lower(btrim(b.name)) = lower(btrim(pl.business_name))
    AND (SELECT count(*) FROM businesses b2
          WHERE lower(btrim(b2.name)) = lower(btrim(pl.business_name))) = 1;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.run_morning_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_qbo     jsonb;
  v_engine  jsonb;
  v_matched integer;
BEGIN
  SELECT jsonb_object_agg(action, affected) INTO v_qbo FROM sync_qbo_to_crm(false);
  v_engine  := refresh_system_tasks(false);
  v_matched := match_prospect_leads();
  RETURN jsonb_build_object(
    'ran_at', now(),
    'qbo', v_qbo,
    'engine', v_engine,
    'prospects_matched', v_matched
  );
END;
$fn$;

COMMENT ON FUNCTION public.run_morning_pipeline() IS
  'Deterministic morning work: QuickBooks to CRM, task engine refresh, prospect matching. Called by /api/cron/desk-email and pg_cron morning-pipeline.';

REVOKE ALL ON FUNCTION public.run_morning_pipeline() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_prospect_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_morning_pipeline() TO service_role;
GRANT EXECUTE ON FUNCTION public.match_prospect_leads() TO service_role;

-- pg_cron: the separate QuickBooks job is folded into the pipeline.
SELECT cron.unschedule('apply-qbo-to-crm');
SELECT cron.schedule('morning-pipeline', '50 6 * * *',
                     $cron$SELECT public.run_morning_pipeline();$cron$);

-- Heartbeat schedule: the desk email is now sent by the app every day, and
-- prospecting is folded into the Monday outreach run.
INSERT INTO routine_schedule (routine, label, iso_days) VALUES
  ('desk_email', 'Morning desk email (app)', ARRAY[1,2,3,4,5,6,7])
ON CONFLICT (routine) DO UPDATE SET label = EXCLUDED.label, iso_days = EXCLUDED.iso_days, enabled = true;
UPDATE routine_schedule SET enabled = false WHERE routine = 'prospecting';
