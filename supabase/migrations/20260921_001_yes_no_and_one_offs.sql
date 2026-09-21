-- 20260921_001_yes_no_and_one_offs.sql
--
-- Two things Tom was still doing by hand.
--
-- 1. Dragging a card to "Agreed" or "Not renewing" when someone answered.
--    The desk routine already reads every email each morning and tags it with an
--    intent (fyi, editorial, money, commitment...). Two more intents,
--    renewal_agreed and renewal_declined, plus deal_agreed for a prospect saying
--    yes, now move the board by themselves. The routine only tags what the other
--    side actually said; the SQL here does the rest, instantly, on tagging.
--
-- 2. One-off work (advertorials, featured articles, short ad runs, band fees)
--    existed only as a QuickBooks invoice and a note. one_off_sales records it
--    properly, from the same morning sync, so a business page shows what they
--    have bought besides their membership.

-- ---------------------------------------------------------------------------
-- 1. Their answer moves the board
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_intent_to_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  d date := coalesce(NEW.entry_date::date, current_date);
BEGIN
  -- Only what they told us counts. Our own words are not an agreement.
  IF NEW.intent IS NULL OR NEW.business_id IS NULL OR NEW.direction <> 'received' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.intent IS NOT DISTINCT FROM OLD.intent THEN
    RETURN NULL;
  END IF;

  IF NEW.intent = 'renewal_agreed' THEN
    UPDATE businesses b
    SET renewal_stage = 'agreed',
        renewal_agreed_at = d,
        renewal_declined_at = NULL
    WHERE b.id = NEW.business_id
      -- Do not walk a paid renewal backwards.
      AND coalesce(b.renewal_stage, 'not_started') NOT IN ('invoice_paid', 'agreed');

  ELSIF NEW.intent = 'renewal_declined' THEN
    UPDATE businesses b
    SET renewal_stage = 'not_renewing',
        renewal_declined_at = now()
    WHERE b.id = NEW.business_id
      AND coalesce(b.renewal_stage, 'not_started') <> 'invoice_paid';

  ELSIF NEW.intent = 'deal_agreed' THEN
    UPDATE businesses b
    SET outreach_stage = 'won',
        outreach_won_at = d
    WHERE b.id = NEW.business_id
      AND b.outreach_stage IS NOT NULL
      AND b.outreach_stage <> 'won';
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS correspondence_intent_moves_stage ON public.correspondence;
CREATE TRIGGER correspondence_intent_moves_stage
  AFTER INSERT OR UPDATE OF intent ON public.correspondence
  FOR EACH ROW EXECUTE FUNCTION public.apply_intent_to_stage();

-- ---------------------------------------------------------------------------
-- 2. One-off work, recorded
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.one_off_sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  business_id    uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  qbo_invoice_id text UNIQUE,
  doc_number     text,
  sold_on        date NOT NULL,
  amount         numeric NOT NULL,
  is_paid        boolean NOT NULL DEFAULT false,
  description    text
);
CREATE INDEX IF NOT EXISTS idx_one_off_sales_business ON public.one_off_sales (business_id, sold_on DESC);

ALTER TABLE public.one_off_sales ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.one_off_sales TO service_role;
GRANT SELECT ON public.one_off_sales TO authenticated;
DROP POLICY IF EXISTS one_off_sales_read ON public.one_off_sales;
CREATE POLICY one_off_sales_read ON public.one_off_sales
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.one_off_sales IS
  'Work bought outside a membership: advertorials, featured articles, short ad runs, band fees. Filled from QuickBooks each morning by record_qbo_one_offs().';

-- Anything invoiced that is not an annual membership or advertising term, and
-- is not an instalment of one. The annual terms are handled by record_qbo_terms().
CREATE OR REPLACE FUNCTION public.record_qbo_one_offs()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO one_off_sales (business_id, qbo_invoice_id, doc_number, sold_on, amount, is_paid, description)
  SELECT l.business_id, i.qbo_invoice_id, i.doc_number, i.txn_date, i.total_amount, i.is_paid,
         nullif(btrim(i.line_description), '')
  FROM qbo_invoices i
  JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
  WHERE coalesce(i.private_memo, '') <> 'Voided'
    AND i.total_amount > 0
    AND coalesce(i.line_description, '') !~* '(12 months?|1 year|one year|annual|club card membership)'
    AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.qbo_invoice_id = i.qbo_invoice_id)
    AND NOT EXISTS (SELECT 1 FROM one_off_sales s WHERE s.qbo_invoice_id = i.qbo_invoice_id)
  ON CONFLICT (qbo_invoice_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Keep payment status current.
  UPDATE one_off_sales s
  SET is_paid = i.is_paid
  FROM qbo_invoices i
  WHERE i.qbo_invoice_id = s.qbo_invoice_id AND s.is_paid IS DISTINCT FROM i.is_paid;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.record_qbo_one_offs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_qbo_one_offs() TO service_role;

CREATE OR REPLACE FUNCTION public.run_morning_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_terms    integer;
  v_one_offs integer;
  v_qbo      jsonb;
  v_engine   jsonb;
  v_matched  integer;
BEGIN
  SELECT count(*) INTO v_terms FROM record_qbo_terms(false);
  v_one_offs := record_qbo_one_offs();
  SELECT jsonb_object_agg(action, affected) INTO v_qbo FROM sync_qbo_to_crm(false);
  v_engine  := refresh_system_tasks(false);
  v_matched := match_prospect_leads();
  RETURN jsonb_build_object(
    'ran_at', now(),
    'contracts_from_quickbooks', v_terms,
    'one_off_sales_recorded', v_one_offs,
    'qbo', v_qbo,
    'engine', v_engine,
    'prospects_matched', v_matched
  );
END $$;
