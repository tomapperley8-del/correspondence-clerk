-- Audit 5 Nov 2026, H1 + L6: security fixes.
-- 1. The sent-mail review functions trusted any caller with no user id, which includes the
--    anonymous role (anyone with the public key). Now only a signed-in member of the org, the
--    service role, or a direct database session (the daily desk routine through the Supabase
--    connector) may call them, and anon loses EXECUTE.
-- 2. run_readonly_query (old Daily Briefing helper, SECURITY DEFINER, unused by the app) is
--    no longer callable by signed-in users.
-- 3. Retired raffle tables and functions: no anon/authenticated access; search_path pinned.
-- 4. mail_backfill_stage gets row security (no policies: only the owner and service role).

CREATE OR REPLACE FUNCTION public.cc_sent_mail_caller_ok(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL THEN
      EXISTS (SELECT 1 FROM user_profiles u WHERE u.id = auth.uid() AND u.organization_id = p_org)
    -- no user: allowed only for the service role over the API, or a direct database session
    -- (PostgREST always connects as 'authenticator', so anon never gets here)
    ELSE COALESCE(auth.role(), '') = 'service_role' OR session_user <> 'authenticator'
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cc_sent_mail_caller_ok(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_sent_mail(uuid, text[], uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ignore_sent_mail(uuid, text[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.undo_sent_mail_batch(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.file_sent_mail(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_insert_sent_mail(bigint, uuid, uuid, uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_sent_mail_duplicate(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cc_sent_mail_caller_ok(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_sent_mail(uuid, text[], uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ignore_sent_mail(uuid, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_sent_mail_batch(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.file_sent_mail(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_insert_sent_mail(bigint, uuid, uuid, uuid[], uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_sent_mail_duplicate(uuid, timestamptz, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.run_readonly_query(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_readonly_query(text, uuid, integer) TO service_role;

REVOKE ALL ON TABLE public.raffle_prizes, public.raffle_winners FROM anon, authenticated;
GRANT ALL ON TABLE public.raffle_prizes, public.raffle_winners TO service_role;
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('update_winner_address','admin_list_winners','claim_prize',
      'admin_add_prize','admin_add_winner','admin_delete_prize','admin_delete_winner','admin_edit_prize',
      'admin_list_prizes','unclaim_prize')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f);
  END LOOP;
END $$;

ALTER TABLE public.mail_backfill_stage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.mail_backfill_stage TO service_role;
