-- 20260925_002_renewal_needs_payment_or_yes.sql
--
-- An invoice is not a yes.
--
-- Tom sometimes raises the renewal invoice before the member has agreed.
-- record_qbo_terms took any renewal invoice as proof of renewal, so an unpaid
-- invoice to Tarantella (1782, July 2026) made them a current Club Card member
-- for another year when they never renewed.
--
-- A renewal is now recorded only when the invoice is paid, or when the
-- business has said yes (renewal_stage 'agreed' or 'invoice_paid', set by the
-- intent trigger when Tom's or their email says so). Until then the business
-- stays on the renewal list and the unpaid invoice is chased as normal, so
-- nothing is missed. The check runs every morning, so a renewal is recorded
-- the day the payment lands. New members are unchanged.
--
-- Tarantella itself: the contract from invoice 1782 was retired (is_current
-- false, kept so it is never recreated), and the business set back to Former,
-- former_club_card, not_renewing, with its last real term (3 Jul 2025 to
-- 3 Jul 2026). Backed up in cc_phase0_backup first. Their care_exclusions row
-- stays, so the invoice is not chased either.

CREATE OR REPLACE FUNCTION public.record_qbo_terms(p_dry_run boolean DEFAULT false)
 RETURNS TABLE(kind text, business_name text, qbo_invoice_id text, contract_start date, contract_end date, amount numeric, paid boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      -- An invoice is not a yes: paid, or they agreed.
      AND (i.is_paid OR b.renewal_stage IN ('agreed', 'invoice_paid'))
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
END $function$;
