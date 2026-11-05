-- Undo 20261105_001_audit_security (restores the definitions and grants live on 5 Nov 2026).
CREATE OR REPLACE FUNCTION public.cc_sent_mail_caller_ok(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT auth.uid() IS NULL OR EXISTS (SELECT 1 FROM user_profiles u WHERE u.id = auth.uid() AND u.organization_id = p_org); $function$;

GRANT EXECUTE ON FUNCTION public.cc_sent_mail_caller_ok(uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_sent_mail(uuid, text[], uuid, text) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ignore_sent_mail(uuid, text[], text) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_sent_mail_batch(uuid, text) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.file_sent_mail(uuid, jsonb, text) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cc_insert_sent_mail(bigint, uuid, uuid, uuid[], uuid[]) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cc_sent_mail_duplicate(uuid, timestamptz, text, text) TO PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.run_readonly_query(text, uuid, integer) TO authenticated;

GRANT ALL ON TABLE public.raffle_prizes, public.raffle_winners TO anon, authenticated;
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('update_winner_address','admin_list_winners','claim_prize',
      'admin_add_prize','admin_add_winner','admin_delete_prize','admin_delete_winner','admin_edit_prize',
      'admin_list_prizes','unclaim_prize')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    EXECUTE format('ALTER FUNCTION %s RESET search_path', f);
  END LOOP;
END $$;

ALTER TABLE public.mail_backfill_stage DISABLE ROW LEVEL SECURITY;
