-- 20260924_001_lift_unsent_drafts_daily.sql
--
-- Tom's rule is "every day": an unsent money or renewal draft is lifted back to
-- the top of Outlook Drafts on every morning run, not every other one.
--
-- v_member_care_queue waited 2 days after a draft was written or lifted, so a
-- draft written at 10:45 was skipped by the next morning's 07:05 run and Tom
-- saw nothing new about it that day. 20 hours means each morning run lifts
-- whatever the previous day left unsent. Applied by rewriting the live view
-- definition in place, so nothing else in it changed.
DO $$
DECLARE def text;
BEGIN
  def := pg_get_viewdef('public.v_member_care_queue'::regclass, true);
  def := replace(def, '''2 days''::interval', '''20:00:00''::interval');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_member_care_queue AS ' || def;
END $$;

REVOKE ALL ON public.v_member_care_queue FROM anon, authenticated;
GRANT SELECT ON public.v_member_care_queue TO service_role;
