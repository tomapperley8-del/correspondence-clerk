-- Stage 17b (1): full QuickBooks history since 2019 into the invoice mirror.
-- Read from QuickBooks with the connector (read only) on 2 Nov 2026: 796 invoices, 312 customers.
-- Needs the temp table s17b_raw(j jsonb), one row per invoice, loaded first in the same session
-- (supabase/.local/17b/stage_load.sql; not committed, it holds customer emails).
-- Adds rows only, apart from filling line descriptions the mirror holds empty. Every row added
-- or changed is recorded in cc_phase0_backup (reason 'stage17b qbo history 2026-11-02');
-- undo: 20261102_stage17b_qbo_history_undo.sql.
-- Rules:
--   * invoices dated after today are skipped: the daily desk routine zeroes any mirror balance
--     missing from today's aging report, so a future instalment would read as paid. The routine
--     picks each one up once its date arrives.
--   * an invoice already in the mirror (by id, or by doc number for the 'legacy-NNNN' rows) is
--     left alone; only an empty line_description is filled.
--   * a new customer is linked to a business only on an exact name match with one business
--     (punctuation, "the", "ltd", "&"/"and" ignored); the rest stay unlinked for Tom.
BEGIN;

CREATE TEMP TABLE s17b_inv ON COMMIT DROP AS
SELECT j->>'qbo_invoice_id' AS qbo_invoice_id, j->>'doc_number' AS doc_number,
       j->>'qbo_customer_id' AS qbo_customer_id, j->>'customer_name' AS customer_name,
       nullif(btrim(j->>'customer_email'), '') AS customer_email,
       (j->>'txn_date')::date AS txn_date, (j->>'due_date')::date AS due_date,
       (j->>'total_amount')::numeric AS total_amount, (j->>'balance')::numeric AS balance,
       j->>'private_memo' AS private_memo, nullif(btrim(j->>'line_description'), '') AS line_description
FROM s17b_raw
WHERE (j->>'txn_date')::date <= cc_today();

-- 1. Customers QuickBooks has that the mirror doesn't
CREATE TEMP TABLE s17b_new_cust ON COMMIT DROP AS
SELECT DISTINCT ON (i.qbo_customer_id) i.qbo_customer_id, i.customer_name, i.customer_email
FROM s17b_inv i
WHERE NOT EXISTS (SELECT 1 FROM qbo_customers c WHERE c.qbo_customer_id = i.qbo_customer_id)
ORDER BY i.qbo_customer_id, i.txn_date DESC;

INSERT INTO qbo_customers (qbo_customer_id, organization_id, display_name, normalized_name, email, synced_at)
SELECT n.qbo_customer_id, '00000000-0000-0000-0000-000000000001', n.customer_name,
       cc_name_key(n.customer_name), n.customer_email, now()
FROM s17b_new_cust n;

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'qbo_customers_created', md5('qbo_customers:' || n.qbo_customer_id)::uuid,
       jsonb_build_object('qbo_customer_id', n.qbo_customer_id), 'stage17b qbo history 2026-11-02'
FROM s17b_new_cust n;

-- 2. Invoices the mirror doesn't have
CREATE TEMP TABLE s17b_new_inv ON COMMIT DROP AS
SELECT i.* FROM s17b_inv i
WHERE NOT EXISTS (SELECT 1 FROM qbo_invoices m
                  WHERE m.qbo_invoice_id = i.qbo_invoice_id
                     OR (m.qbo_invoice_id LIKE 'legacy-%' AND m.doc_number = i.doc_number));

INSERT INTO qbo_invoices (qbo_invoice_id, organization_id, qbo_customer_id, doc_number, txn_date, due_date,
                          total_amount, balance, private_memo, line_description, synced_at)
SELECT n.qbo_invoice_id, '00000000-0000-0000-0000-000000000001', n.qbo_customer_id, n.doc_number,
       n.txn_date, n.due_date, n.total_amount, n.balance, n.private_memo,
       n.line_description, now()
FROM s17b_new_inv n;

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'qbo_invoices_created', md5('qbo_invoices:' || n.qbo_invoice_id)::uuid,
       jsonb_build_object('qbo_invoice_id', n.qbo_invoice_id), 'stage17b qbo history 2026-11-02'
FROM s17b_new_inv n;

-- 3. Fill line descriptions the mirror holds empty (record_qbo_terms reads them)
CREATE TEMP TABLE s17b_desc ON COMMIT DROP AS
SELECT m.qbo_invoice_id, i.line_description
FROM qbo_invoices m JOIN s17b_inv i ON i.qbo_invoice_id = m.qbo_invoice_id
WHERE coalesce(btrim(m.line_description), '') = '' AND i.line_description IS NOT NULL;

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'qbo_invoices', md5('qbo_invoices:' || m.qbo_invoice_id)::uuid, to_jsonb(m), 'stage17b qbo history 2026-11-02'
FROM qbo_invoices m JOIN s17b_desc d USING (qbo_invoice_id);

UPDATE qbo_invoices m SET line_description = d.line_description
FROM s17b_desc d WHERE m.qbo_invoice_id = d.qbo_invoice_id;

-- 4. Link new customers on an exact name match with exactly one business
CREATE TEMP TABLE s17b_link ON COMMIT DROP AS
WITH k AS (
  SELECT b.id, cc_name_key(regexp_replace(lower(b.name), '\m(the|ltd|limited|plc|llp|uk|co|and)\M|&', '', 'g')) AS key
  FROM businesses b WHERE b.merged_into IS NULL
)
SELECT n.qbo_customer_id, min(k.id::text)::uuid AS business_id
FROM s17b_new_cust n
JOIN k ON k.key = cc_name_key(regexp_replace(lower(n.customer_name), '\m(the|ltd|limited|plc|llp|uk|co|and)\M|&', '', 'g'))
     AND k.key <> ''
GROUP BY n.qbo_customer_id
HAVING count(*) = 1;

INSERT INTO qbo_links (organization_id, business_id, qbo_customer_id, match_method, confidence, confirmed, note)
SELECT '00000000-0000-0000-0000-000000000001', l.business_id, l.qbo_customer_id, 'exact_name', 1.0, false,
       'Stage 17b history load: exact name match'
FROM s17b_link l
WHERE NOT EXISTS (SELECT 1 FROM qbo_links x WHERE x.qbo_customer_id = l.qbo_customer_id);

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'qbo_links_created', x.id, jsonb_build_object('qbo_customer_id', x.qbo_customer_id), 'stage17b qbo history 2026-11-02'
FROM qbo_links x WHERE x.note = 'Stage 17b history load: exact name match';

-- 5. Totals for the customers that gained invoices (as the routine's step f works them out)
CREATE TEMP TABLE s17b_tot ON COMMIT DROP AS
SELECT i.qbo_customer_id, count(*) AS n, sum(i.total_amount) AS total,
       coalesce(sum(i.balance) FILTER (WHERE i.balance > 0), 0) AS open, max(i.txn_date) AS last_date
FROM qbo_invoices i
WHERE i.qbo_customer_id IN (SELECT qbo_customer_id FROM s17b_new_inv)
GROUP BY 1;

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'qbo_customers', md5('qbo_customers:' || c.qbo_customer_id)::uuid, to_jsonb(c), 'stage17b qbo history 2026-11-02'
FROM qbo_customers c JOIN s17b_tot t USING (qbo_customer_id)
WHERE c.qbo_customer_id NOT IN (SELECT qbo_customer_id FROM s17b_new_cust);

UPDATE qbo_customers c SET invoice_count = t.n, total_invoiced = t.total, open_balance = t.open,
       last_invoice_date = t.last_date
FROM s17b_tot t WHERE c.qbo_customer_id = t.qbo_customer_id;

SELECT (SELECT count(*) FROM s17b_new_cust) AS customers_added,
       (SELECT count(*) FROM s17b_new_inv) AS invoices_added,
       (SELECT count(*) FROM s17b_desc) AS descriptions_filled,
       (SELECT count(*) FROM s17b_link) AS links_added;
COMMIT;
