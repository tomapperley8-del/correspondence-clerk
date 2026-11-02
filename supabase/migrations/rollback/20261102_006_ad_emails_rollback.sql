-- Rollback for 20261102_006_ad_emails: takes the `ads` key out of business_dossier, drops the view and tables.
-- (Run supabase/data-fixes/20261102_stage17b_ad_emails_undo.sql first if the data script was run.)
DO $do$
DECLARE
  def text := pg_get_functiondef('public.business_dossier(text)'::regprocedure);
  a int := position(E'''ads'', jsonb_build_object(' IN def);
  e int;
BEGIN
  IF a > 0 THEN
    e := position($x$'attention', (SELECT jsonb_build_object('reason', a.reason$x$ IN def);
    EXECUTE substr(def, 1, a - 1) || substr(def, e);
  END IF;
END $do$;
DROP VIEW IF EXISTS public.v_ad_emails_to_match;
DROP TABLE IF EXISTS public.ad_email_links, public.ad_placements, public.ad_reports;
