-- Undo 20261102_stage17b_qbo_history.sql (reason 'stage17b qbo history 2026-11-02').
-- Removes everything the load added, and what the nightly pipeline and the review list made from it:
--   * invoice notes in correspondence (ai_metadata->>'qbo_invoice_id' in the created invoices)
--   * one_off_sales and contracts made from those invoices (contracts.qbo_invoice_id; only contracts created
--     after the load, older contracts name invoices the mirror did not hold)
--   * contract_invoices rows for them (if the table exists)
--   * qbo_links for the created customers (the load's exact-name links, and any made in Data health)
--   * the created invoices and customers
-- and puts back the line descriptions and customer totals it changed.
-- Not undone here: a contract's invoice_paid flag, or a business status, that the pipeline set from an
-- older invoice. Run the past-contracts undo first if it was run. Businesses made in Data health
-- ("Make new business") are undone by the Undo button there, or by hand.
BEGIN;

CREATE TEMP TABLE u_inv ON COMMIT DROP AS
SELECT before_row->>'qbo_invoice_id' AS id FROM cc_phase0_backup
WHERE reason = 'stage17b qbo history 2026-11-02' AND table_name = 'qbo_invoices_created';
CREATE TEMP TABLE u_cust ON COMMIT DROP AS
SELECT before_row->>'qbo_customer_id' AS id FROM cc_phase0_backup
WHERE reason = 'stage17b qbo history 2026-11-02' AND table_name = 'qbo_customers_created';

DELETE FROM correspondence WHERE ai_metadata->>'qbo_invoice_id' IN (SELECT id FROM u_inv);
DELETE FROM one_off_sales WHERE qbo_invoice_id IN (SELECT id FROM u_inv);
DO $$ BEGIN
  IF to_regclass('public.contract_invoices') IS NOT NULL THEN
    DELETE FROM contract_invoices WHERE qbo_invoice_id IN (SELECT id FROM u_inv);
  END IF;
END $$;
-- Only contracts made after the load: older contracts can name an invoice (by QuickBooks id) the mirror
-- did not hold before, and those stay.
DELETE FROM contracts WHERE qbo_invoice_id IN (SELECT id FROM u_inv)
  AND created_at >= (SELECT min(taken_at) FROM cc_phase0_backup
                     WHERE reason = 'stage17b qbo history 2026-11-02' AND table_name = 'qbo_invoices_created');
DELETE FROM qbo_links WHERE qbo_customer_id IN (SELECT id FROM u_cust);
DELETE FROM qbo_invoices WHERE qbo_invoice_id IN (SELECT id FROM u_inv);
DELETE FROM qbo_customers WHERE qbo_customer_id IN (SELECT id FROM u_cust);

-- line descriptions the load filled
UPDATE qbo_invoices m SET line_description = b.before_row->>'line_description'
FROM cc_phase0_backup b
WHERE b.reason = 'stage17b qbo history 2026-11-02' AND b.table_name = 'qbo_invoices'
  AND m.qbo_invoice_id = b.before_row->>'qbo_invoice_id';

-- customer totals the load refreshed
UPDATE qbo_customers c SET invoice_count = (b.before_row->>'invoice_count')::int,
       total_invoiced = (b.before_row->>'total_invoiced')::numeric,
       open_balance = (b.before_row->>'open_balance')::numeric,
       last_invoice_date = (b.before_row->>'last_invoice_date')::date
FROM cc_phase0_backup b
WHERE b.reason = 'stage17b qbo history 2026-11-02' AND b.table_name = 'qbo_customers'
  AND c.qbo_customer_id = b.before_row->>'qbo_customer_id';

COMMIT;
