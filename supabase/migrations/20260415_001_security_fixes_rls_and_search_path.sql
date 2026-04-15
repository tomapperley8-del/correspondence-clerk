-- ============================================================
-- SECURITY FIX 1: Enable RLS on blocked_senders (CRITICAL)
-- Table was publicly accessible with no row-level security.
-- ============================================================
ALTER TABLE public.blocked_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read blocked_senders" ON public.blocked_senders;
DROP POLICY IF EXISTS "Org members can insert blocked_senders" ON public.blocked_senders;
DROP POLICY IF EXISTS "Org members can delete blocked_senders" ON public.blocked_senders;

CREATE POLICY "Org members can read blocked_senders"
  ON public.blocked_senders FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert blocked_senders"
  ON public.blocked_senders FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can delete blocked_senders"
  ON public.blocked_senders FOR DELETE
  TO authenticated
  USING (org_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  ));

-- ============================================================
-- SECURITY FIX 2: Drop overly-permissive insight_history policies
-- Correct org-scoped policies ("org members can ...") already
-- exist. These unrestricted duplicates shadowed them.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert insight_history" ON public.insight_history;
DROP POLICY IF EXISTS "Authenticated users can read insight_history" ON public.insight_history;

-- ============================================================
-- SECURITY FIX 3: Pin search_path on all public functions
-- Prevents search_path injection attacks where a malicious schema
-- could shadow built-in functions called by these procedures.
-- ============================================================
ALTER FUNCTION public.compute_content_hash SET search_path = '';
ALTER FUNCTION public.update_updated_at_column SET search_path = '';
ALTER FUNCTION public.cleanup_expired_temp_email_data SET search_path = '';
ALTER FUNCTION public.is_user_admin SET search_path = '';
ALTER FUNCTION public.cleanup_expired_rate_limits SET search_path = '';
ALTER FUNCTION public.promote_open_threads_to_actions SET search_path = '';
ALTER FUNCTION public.oe_normalise_business_name SET search_path = '';
ALTER FUNCTION public.oe_link_on_prospect_insert SET search_path = '';
ALTER FUNCTION public.oe_recalculate_conversion_stats SET search_path = '';
ALTER FUNCTION public.oe_link_on_business_insert SET search_path = '';
ALTER FUNCTION public.update_digital_profile_updated_at SET search_path = '';
ALTER FUNCTION public.get_unformatted_entries SET search_path = '';
ALTER FUNCTION public.oe_sync_correspondence_to_prospect SET search_path = '';
ALTER FUNCTION public.bulk_insert_correspondence SET search_path = '';
ALTER FUNCTION public.mark_format_failed SET search_path = '';
ALTER FUNCTION public.update_formatted_entry SET search_path = '';
ALTER FUNCTION public.oe_sync_status_to_cc SET search_path = '';
ALTER FUNCTION public.get_unformatted_batch(integer, text) SET search_path = '';
ALTER FUNCTION public.get_unformatted_batch(integer) SET search_path = '';
ALTER FUNCTION public.batch_update_formatting SET search_path = '';
ALTER FUNCTION public.run_readonly_query SET search_path = '';
ALTER FUNCTION public.update_formatting(uuid, text, text, text, timestamptz, text, jsonb) SET search_path = '';
ALTER FUNCTION public.get_open_threads SET search_path = '';
ALTER FUNCTION public.handle_updated_at SET search_path = '';
ALTER FUNCTION public.correspondence_search_vector_update SET search_path = '';
