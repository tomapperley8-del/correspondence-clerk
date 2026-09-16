-- 20260916_001_qbo_renewal_needs_prior_term.sql
--
-- Amends public.sync_qbo_to_crm (first defined in 20260911_002). Applied 2026-09-16.
--
-- Third guard on moving a renewal card to 'invoice_paid'. The 2026-09-12 guards
-- (term still running, no leapfrogging) did not cover a business on its FIRST
-- contract whose term is still running. HATCH MEYHANE was the live case: one
-- contract, 15 Oct 2025 to 15 Oct 2026, paid by invoice 1674. Linking its
-- QuickBooks customer would have moved its renewal card to 'invoice_paid' a
-- month before the renewal is due, hiding a live renewal. Same mistake Tom
-- caught on Levent Borek and Archie's London.
--
-- Now the card only moves when the paid contract is a renewal: the business
-- held an earlier term. contracts.invoice_paid is still set either way, since
-- that is a fact about the invoice.
--
-- CORRECTION to the 20260911_002 header: the QuickBooks mirror is not a one-off
-- snapshot. Step 0 of the CC daily desk routine refreshes it every run, and the
-- shared synced_at is by design (the routine stamps the whole table). Stale
-- data on 2026-09-12 was the routine stalling on a permission prompt.

CREATE OR REPLACE FUNCTION public.sync_qbo_to_crm(p_dry_run boolean DEFAULT false)
RETURNS TABLE (action text, detail text, affected integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_linked     integer := 0;
  v_notes      integer := 0;
  v_paid       integer := 0;
  v_stage      integer := 0;
  v_ambiguous  integer := 0;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Auto-link QBO customers to businesses, exact normalised name only
  ---------------------------------------------------------------------------
  IF NOT p_dry_run THEN
    INSERT INTO qbo_links (organization_id, business_id, qbo_customer_id,
                           match_method, confidence, confirmed, note)
    SELECT b.organization_id, b.id, qc.qbo_customer_id,
           'auto_normalised_name', 1.0, false,
           'Linked by sync_qbo_to_crm on exact normalised name match'
    FROM qbo_customers qc
    JOIN businesses b
      ON lower(btrim(b.normalized_name)) = lower(btrim(qc.normalized_name))
    WHERE NOT EXISTS (SELECT 1 FROM qbo_links l WHERE l.qbo_customer_id = qc.qbo_customer_id)
      AND qc.normalized_name IS NOT NULL AND btrim(qc.normalized_name) <> ''
      -- only when the name maps to exactly one business, never guess
      AND (SELECT count(*) FROM businesses b2
            WHERE lower(btrim(b2.normalized_name)) = lower(btrim(qc.normalized_name))) = 1;
    GET DIAGNOSTICS v_linked = ROW_COUNT;
  ELSE
    SELECT count(*) INTO v_linked
    FROM qbo_customers qc
    JOIN businesses b ON lower(btrim(b.normalized_name)) = lower(btrim(qc.normalized_name))
    WHERE NOT EXISTS (SELECT 1 FROM qbo_links l WHERE l.qbo_customer_id = qc.qbo_customer_id)
      AND (SELECT count(*) FROM businesses b2
            WHERE lower(btrim(b2.normalized_name)) = lower(btrim(qc.normalized_name))) = 1;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. One correspondence Note per invoice, so invoices show in the history
  ---------------------------------------------------------------------------
  IF NOT p_dry_run THEN
    INSERT INTO correspondence
      (business_id, user_id, organization_id, raw_text_original,
       formatted_text_current, subject, type, direction, entry_date, ai_metadata)
    SELECT
      l.business_id,
      (SELECT up.id FROM user_profiles up
        WHERE up.organization_id = b.organization_id ORDER BY up.id LIMIT 1),
      b.organization_id,
      concat_ws(E'\n',
        'Invoice ' || coalesce(i.doc_number, i.qbo_invoice_id),
        'Date: ' || to_char(i.txn_date, 'DD/MM/YYYY'),
        'Amount: ' || to_char(i.total_amount, 'FM999999990.00'),
        CASE WHEN i.is_paid THEN 'Status: paid'
             ELSE 'Status: outstanding, balance ' || to_char(i.balance, 'FM999999990.00') END,
        CASE WHEN i.due_date IS NOT NULL THEN 'Due: ' || to_char(i.due_date, 'DD/MM/YYYY') END,
        nullif(i.line_description, '')),
      concat_ws(E'\n',
        'Invoice ' || coalesce(i.doc_number, i.qbo_invoice_id),
        'Date: ' || to_char(i.txn_date, 'DD/MM/YYYY'),
        'Amount: ' || to_char(i.total_amount, 'FM999999990.00'),
        CASE WHEN i.is_paid THEN 'Status: paid'
             ELSE 'Status: outstanding, balance ' || to_char(i.balance, 'FM999999990.00') END,
        CASE WHEN i.due_date IS NOT NULL THEN 'Due: ' || to_char(i.due_date, 'DD/MM/YYYY') END,
        nullif(i.line_description, '')),
      'Invoice ' || coalesce(i.doc_number, i.qbo_invoice_id)
        || ' - ' || to_char(i.total_amount, 'FM999999990.00')
        || CASE WHEN i.is_paid THEN ' - paid' ELSE ' - outstanding' END,
      'Note'::entry_type,
      NULL,
      i.txn_date::timestamptz,
      jsonb_build_object('source', 'qbo_invoice', 'qbo_invoice_id', i.qbo_invoice_id)
    FROM qbo_invoices i
    JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
    JOIN businesses b ON b.id = l.business_id
    WHERE coalesce(i.private_memo, '') <> 'Voided'
      AND NOT EXISTS (
        SELECT 1 FROM correspondence c
        WHERE c.ai_metadata->>'qbo_invoice_id' = i.qbo_invoice_id);
    GET DIAGNOSTICS v_notes = ROW_COUNT;

    -- keep existing notes honest when an invoice is later paid
    UPDATE correspondence c
    SET subject = 'Invoice ' || coalesce(i.doc_number, i.qbo_invoice_id)
                  || ' - ' || to_char(i.total_amount, 'FM999999990.00') || ' - paid',
        formatted_text_current = replace(c.formatted_text_current,
                                         'Status: outstanding', 'Status: paid')
    FROM qbo_invoices i
    WHERE c.ai_metadata->>'qbo_invoice_id' = i.qbo_invoice_id
      AND i.is_paid
      AND c.subject LIKE '%outstanding%';
  ELSE
    SELECT count(*) INTO v_notes
    FROM qbo_invoices i
    JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
    WHERE coalesce(i.private_memo, '') <> 'Voided'
      AND NOT EXISTS (SELECT 1 FROM correspondence c
                      WHERE c.ai_metadata->>'qbo_invoice_id' = i.qbo_invoice_id);
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Mark contracts paid, only where the evidence is unambiguous
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE _qbo_settled ON COMMIT DROP AS
  WITH win AS (
    SELECT c.id AS contract_id, c.business_id, c.contract_start, c.contract_end,
           count(i.*)          AS invoices_in_window,
           bool_and(i.is_paid) AS all_paid,
           max(i.txn_date)     AS paid_on
    FROM contracts c
    JOIN qbo_links l ON l.business_id = c.business_id
    JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
         AND i.txn_date BETWEEN (c.contract_start - 30) AND c.contract_end
         AND coalesce(i.private_memo, '') <> 'Voided'
         AND i.total_amount > 0
    WHERE c.is_current AND NOT c.invoice_paid AND c.contract_start IS NOT NULL
    GROUP BY c.id, c.business_id, c.contract_start, c.contract_end
  )
  SELECT * FROM win WHERE invoices_in_window = 1 AND all_paid;

  SELECT count(*) INTO v_ambiguous
  FROM contracts c
  JOIN qbo_links l ON l.business_id = c.business_id
  JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
       AND i.txn_date BETWEEN (c.contract_start - 30) AND c.contract_end
       AND coalesce(i.private_memo, '') <> 'Voided' AND i.total_amount > 0
  WHERE c.is_current AND NOT c.invoice_paid
  GROUP BY c.id HAVING count(i.*) > 1;

  IF NOT p_dry_run THEN
    UPDATE contracts c SET invoice_paid = true
    FROM _qbo_settled s WHERE c.id = s.contract_id;
    GET DIAGNOSTICS v_paid = ROW_COUNT;

    -- move the renewal card, with the same guards the kanban derivation uses
    UPDATE businesses b
    SET renewal_stage = 'invoice_paid',
        renewal_invoice_paid_at = s.paid_on
    FROM _qbo_settled s
    WHERE b.id = s.business_id
      AND (b.is_club_card OR b.is_advertiser)
      AND NOT b.mute_replies
      AND b.renewal_declined_at IS NULL
      AND coalesce(b.status,'') NOT IN ('Former','Inactive','Closed')
      AND coalesce(b.renewal_stage,'') <> 'invoice_paid'
      -- AMENDED 2026-09-12: the term must still be running. Once it has ended,
      -- "the renewal is paid" says nothing true about anything.
      AND s.contract_end >= current_date
      -- AMENDED 2026-09-12: never leapfrog a renewal conversation under way.
      AND coalesce(b.renewal_stage,'not_started') IN ('not_started','agreed')
      -- AMENDED 2026-09-16: the paid contract must itself be a renewal, i.e. the
      -- business held an earlier term. A first contract's invoice pays for the
      -- term now running; it says nothing about the renewal coming up.
      AND EXISTS (SELECT 1 FROM contracts p
                  WHERE p.business_id = s.business_id
                    AND p.id <> s.contract_id
                    AND p.contract_start < s.contract_start);
    GET DIAGNOSTICS v_stage = ROW_COUNT;
  ELSE
    SELECT count(*) INTO v_paid FROM _qbo_settled;
    v_stage := v_paid;
  END IF;

  RETURN QUERY VALUES
    ('customers_linked',   'exact normalised name match only',                      v_linked),
    ('invoice_notes',      'correspondence Notes written for invoices',             v_notes),
    ('contracts_paid',     'single paid invoice in window',                         v_paid),
    ('renewal_stage_set',  'renewal card moved to invoice_paid',                    v_stage),
    ('ambiguous_skipped',  'contracts with several invoices in window, left alone',  v_ambiguous);
END;
$fn$;

COMMENT ON FUNCTION public.sync_qbo_to_crm(boolean) IS
  'Applies QuickBooks state to Correspondence Clerk: links customers, writes invoice Notes, and marks contracts paid where unambiguous. Moves a renewal card only for a paid renewal term. Idempotent. Pass true for a dry run.';
