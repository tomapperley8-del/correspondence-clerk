-- 20260925_005_business_for_invoice.sql
-- The business that owns a QuickBooks invoice number. The webhook uses it to
-- file QuickBooks invoice and reminder emails as sent chasers.
CREATE OR REPLACE FUNCTION public.business_for_invoice(p_doc text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT l.business_id
  FROM qbo_invoices i
  JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
  WHERE i.doc_number = p_doc
  ORDER BY l.confirmed DESC NULLS LAST
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.business_for_invoice(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_for_invoice(text) TO service_role;
