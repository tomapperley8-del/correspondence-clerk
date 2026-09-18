-- 20260918_005_quickbooks_drives_contracts.sql
--
-- QuickBooks invoices now create the contracts they describe.
--
-- QuickBooks was synced every morning, but an invoice for a new term never
-- became a contract. The CRM kept showing Arcane, Oddono's, Tarantella, Levent
-- Borek and Bollo House as expired although each had been invoiced for another
-- year; Rozies had been invoiced as a new member and had no contract at all; and
-- Chiswick Physio, a current advertiser on a £2,160 deal paid in instalments,
-- was marked Former. The task engine only raised "renewal to record" tasks and
-- waited for a person.
--
-- Three parts:
--   1. record_qbo_terms(): runs first in run_morning_pipeline(). It turns a
--      membership or advertising invoice into a contract when it is clearly a
--      new term: either a renewal (the current contract ends within 90 days
--      before, or 150 days after, the invoice, and the invoice is at least 80%
--      of the old amount, so monthly standing-order invoices are ignored), or
--      a new member (no current contract, a 12-month invoice from the last 60
--      days). Each invoice is used once (contracts.qbo_invoice_id).
--   2. sync_business_flags_from_contracts() now also mirrors the current
--      contract onto the business's own contract columns (which the business
--      page header and the Mastersheet export read), and marks a business
--      Active when it holds a contract in force.
--   3. Data: Chiswick Physio's instalment deal recorded as one advertiser
--      contract; backfills below. Backups in cc_phase0_backup, reason
--      'quickbooks_drives_contracts_2026_09_18'.

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS qbo_invoice_id text;
CREATE UNIQUE INDEX IF NOT EXISTS contracts_qbo_invoice_id_key
  ON public.contracts (qbo_invoice_id) WHERE qbo_invoice_id IS NOT NULL;

-- 2. Flags, status and the mirrored contract columns follow the contracts table.
CREATE OR REPLACE FUNCTION public.sync_business_flags_from_contracts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id      uuid;
  has_club_card  boolean;
  has_advertiser boolean;
  in_force       boolean;
  cur            record;
  has_cur        boolean;
BEGIN
  target_id := COALESCE(NEW.business_id, OLD.business_id);

  SELECT
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current AND membership_type = 'club_card'),
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current AND membership_type = 'advertiser'),
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current
                                     AND coalesce(contract_end, current_date) >= current_date)
  INTO has_club_card, has_advertiser, in_force;

  SELECT contract_start, contract_end, contract_amount, contract_currency, deal_terms, membership_type
  INTO cur
  FROM contracts
  WHERE business_id = target_id AND is_current
  ORDER BY contract_start DESC NULLS LAST
  LIMIT 1;
  -- FOUND, not "cur IS NOT NULL": a record counts as NULL-ish if any one field
  -- is null, so a contract with no deal terms would never be mirrored.
  has_cur := FOUND;

  UPDATE businesses b
  SET
    is_club_card  = has_club_card,
    is_advertiser = has_advertiser,
    -- A contract in force means a current customer, whatever the label said.
    status = CASE
      WHEN in_force AND coalesce(b.status, '') IN ('', 'Prospect', 'Former', 'Inactive') THEN 'Active'
      ELSE b.status
    END,
    membership_type = CASE
      WHEN in_force AND (b.membership_type IS NULL OR b.membership_type LIKE 'former_%')
        THEN coalesce(cur.membership_type, b.membership_type)
      WHEN b.membership_type IS NULL AND has_club_card  THEN 'club_card'
      WHEN b.membership_type IS NULL AND has_advertiser THEN 'advertiser'
      ELSE b.membership_type
    END,
    -- The business row's own contract columns mirror the current contract.
    contract_start    = CASE WHEN has_cur THEN cur.contract_start    ELSE b.contract_start END,
    contract_end      = CASE WHEN has_cur THEN cur.contract_end      ELSE b.contract_end END,
    contract_amount   = CASE WHEN has_cur THEN cur.contract_amount   ELSE b.contract_amount END,
    contract_currency = CASE WHEN has_cur THEN cur.contract_currency ELSE b.contract_currency END,
    deal_terms        = CASE WHEN has_cur THEN coalesce(cur.deal_terms, b.deal_terms) ELSE b.deal_terms END
  WHERE b.id = target_id;

  RETURN COALESCE(NEW, OLD);
END $$;

-- 1. Invoices become contracts.
CREATE OR REPLACE FUNCTION public.record_qbo_terms(p_dry_run boolean DEFAULT false)
RETURNS TABLE (kind text, business_name text, qbo_invoice_id text, contract_start date, contract_end date, amount numeric, paid boolean)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
BEGIN
  DROP TABLE IF EXISTS _terms;
  CREATE TEMP TABLE _terms ON COMMIT DROP AS
  WITH renewal AS (
    SELECT DISTINCT ON (c.id)
      'renewal'::text AS kind, c.business_id, b.organization_id, b.name,
      c.id AS old_contract_id, i.qbo_invoice_id, i.total_amount, i.is_paid, i.line_description,
      (c.contract_end + 1) AS new_start,
      (c.contract_end + 1 + (c.contract_end - c.contract_start)) AS new_end,
      c.membership_type AS old_type, c.billing_frequency
    FROM contracts c
    JOIN businesses b ON b.id = c.business_id
    JOIN qbo_links l ON l.business_id = c.business_id
    JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
    WHERE c.is_current
      AND c.contract_start IS NOT NULL AND c.contract_end IS NOT NULL
      AND coalesce(i.private_memo, '') <> 'Voided' AND i.total_amount > 0
      AND i.txn_date > c.contract_start + 270
      AND i.txn_date BETWEEN c.contract_end - 90 AND c.contract_end + 150
      AND i.total_amount >= 0.8 * coalesce(c.contract_amount, i.total_amount)
      AND i.line_description ~* '(club card|membership|sidebar|leaderboard|advertis|banner)'
      AND i.line_description !~* '(standing order|per month|instalment)'
      AND NOT EXISTS (SELECT 1 FROM contracts n WHERE n.business_id = c.business_id AND n.contract_start > c.contract_start)
      AND NOT EXISTS (SELECT 1 FROM contracts x WHERE x.qbo_invoice_id = i.qbo_invoice_id)
    ORDER BY c.id, i.txn_date
  ),
  newcomer AS (
    SELECT DISTINCT ON (b.id)
      'new member'::text AS kind, b.id AS business_id, b.organization_id, b.name,
      NULL::uuid AS old_contract_id, i.qbo_invoice_id, i.total_amount, i.is_paid, i.line_description,
      i.txn_date AS new_start,
      (i.txn_date + interval '1 year' - interval '1 day')::date AS new_end,
      NULL::text AS old_type, 'annual'::text AS billing_frequency
    FROM businesses b
    JOIN qbo_links l ON l.business_id = b.id
    JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
    WHERE NOT EXISTS (SELECT 1 FROM contracts c WHERE c.business_id = b.id AND c.is_current)
      AND coalesce(i.private_memo, '') <> 'Voided' AND i.total_amount >= 200
      AND i.txn_date >= current_date - 60
      AND i.line_description ~* '(12 months?|1 year|one year|annual)'
      AND i.line_description ~* '(club card|membership|sidebar|leaderboard|advertis|banner)'
      AND i.line_description !~* '(standing order|per month|instalment)'
      AND NOT EXISTS (SELECT 1 FROM contracts x WHERE x.qbo_invoice_id = i.qbo_invoice_id)
    ORDER BY b.id, i.txn_date
  )
  SELECT t.*,
    CASE
      WHEN t.line_description ~* '(sidebar|leaderboard|advertis|banner)' THEN 'advertiser'
      WHEN t.line_description ~* 'club card' THEN 'club_card'
      ELSE coalesce(t.old_type, 'club_card')
    END AS new_type
  FROM (SELECT * FROM renewal UNION ALL SELECT * FROM newcomer) t;

  IF NOT p_dry_run THEN
    UPDATE contracts c SET is_current = false, updated_at = now()
    FROM _terms t WHERE c.id = t.old_contract_id;

    INSERT INTO contracts (business_id, organization_id, membership_type, contract_start, contract_end,
                           contract_amount, contract_currency, billing_frequency, deal_terms,
                           invoice_paid, is_current, qbo_invoice_id)
    SELECT t.business_id, t.organization_id, t.new_type, t.new_start, t.new_end,
           t.total_amount, 'GBP', coalesce(t.billing_frequency, 'annual'),
           t.line_description || ' (recorded from QuickBooks)',
           t.is_paid, true, t.qbo_invoice_id
    FROM _terms t;
  END IF;

  RETURN QUERY
  SELECT t.kind, t.name, t.qbo_invoice_id, t.new_start, t.new_end, t.total_amount, t.is_paid FROM _terms t;
END $$;

REVOKE ALL ON FUNCTION public.record_qbo_terms(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_qbo_terms(boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.run_morning_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_terms   integer;
  v_qbo     jsonb;
  v_engine  jsonb;
  v_matched integer;
BEGIN
  SELECT count(*) INTO v_terms FROM record_qbo_terms(false);
  SELECT jsonb_object_agg(action, affected) INTO v_qbo FROM sync_qbo_to_crm(false);
  v_engine  := refresh_system_tasks(false);
  v_matched := match_prospect_leads();
  RETURN jsonb_build_object(
    'ran_at', now(),
    'contracts_from_quickbooks', v_terms,
    'qbo', v_qbo,
    'engine', v_engine,
    'prospects_matched', v_matched
  );
END $$;
