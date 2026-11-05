-- Audit 5 Nov 2026: QuickBooks emails reach the customer they are about.
-- QuickBooks emails an invoice the moment Tom creates it, but the app's copy of QuickBooks is
-- refreshed at 05:38, so the webhook can't yet tell whose invoice it is and the email falls
-- through to the internal "Quickbooks - Invoices" record (whose contact holds
-- quickbooks@notification.intuit.com): 103 there on 5 Nov.
-- rehome_quickbooks_emails() moves each one whose invoice number is now known to the business
-- that owns the invoice, as a QuickBooks email (sent, no contact, source quickbooks_notice), the
-- same as the webhook does when it can match it. On record, not counted as last in touch.
-- Before-images go to cc_phase0_backup (reason 'rehome quickbooks emails'). The morning pipeline
-- (06:50, after the QuickBooks copy) runs it every day.

CREATE OR REPLACE FUNCTION public.rehome_quickbooks_emails()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; v_biz uuid; n integer := 0;
BEGIN
  FOR r IN
    SELECT c.*, substring(c.subject from '(?i)\mInvoice\s+(\d{3,6})\M') AS doc
    FROM correspondence c
    JOIN contacts k ON k.id = c.contact_id
    WHERE k.emails @> '["quickbooks@notification.intuit.com"]'::jsonb
      AND c.business_id = k.business_id
  LOOP
    CONTINUE WHEN r.doc IS NULL;
    v_biz := business_for_invoice(r.doc);
    CONTINUE WHEN v_biz IS NULL OR v_biz = r.business_id;
    INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
    SELECT 'correspondence', c.id, to_jsonb(c), 'rehome quickbooks emails' FROM correspondence c WHERE c.id = r.id;
    UPDATE correspondence
    SET business_id = v_biz,
        contact_id = NULL,
        cc_contact_ids = '{}',
        direction = 'sent',
        ai_metadata = coalesce(ai_metadata, '{}'::jsonb)
          || jsonb_build_object('source', 'quickbooks_notice', 'source_before_rehome', ai_metadata->>'source', 'qbo_doc', r.doc),
        updated_at = now()
    WHERE id = r.id;
    n := n + 1;
  END LOOP;
  IF n > 0 THEN PERFORM refresh_business_truth(NULL); END IF;
  RETURN n;
END $function$;

REVOKE EXECUTE ON FUNCTION public.rehome_quickbooks_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rehome_quickbooks_emails() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_morning_pipeline()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_terms integer; v_one_offs integer; v_qbo jsonb; v_engine jsonb; v_matched integer; v_qbo_emails integer;
BEGIN
  SELECT count(*) INTO v_terms FROM record_qbo_terms(false);
  v_one_offs := record_qbo_one_offs();
  SELECT jsonb_object_agg(action, affected) INTO v_qbo FROM sync_qbo_to_crm(false);
  v_qbo_emails := rehome_quickbooks_emails();
  v_engine  := refresh_system_tasks(false);
  v_matched := match_prospect_leads();
  RETURN jsonb_build_object('ran_at', now(), 'contracts_from_quickbooks', v_terms,
    'one_off_sales_recorded', v_one_offs, 'qbo', v_qbo, 'quickbooks_emails_rehomed', v_qbo_emails,
    'engine', v_engine, 'prospects_matched', v_matched);
END $function$;
