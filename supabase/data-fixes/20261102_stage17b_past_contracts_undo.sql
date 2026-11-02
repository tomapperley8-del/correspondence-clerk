-- Undo 20261102_stage17b_past_contracts.sql: the past contracts and their invoice links removed, the one-off
-- sales put back, and each affected business's stored status and last contacted date put back from the
-- before-images the script took.
BEGIN;
CREATE TEMP TABLE u_pc ON COMMIT DROP AS
SELECT row_id AS contract_id, (before_row->>'business_id')::uuid AS business_id FROM cc_phase0_backup
WHERE reason = 'stage17b past contracts 2026-11-02' AND table_name = 'contracts_created';
DELETE FROM contract_invoices WHERE contract_id IN (SELECT contract_id FROM u_pc);
DELETE FROM contracts WHERE id IN (SELECT contract_id FROM u_pc);
INSERT INTO one_off_sales
SELECT (jsonb_populate_record(NULL::one_off_sales, b.before_row)).*
FROM cc_phase0_backup b
WHERE b.reason = 'stage17b past contracts 2026-11-02' AND b.table_name = 'one_off_sales'
ON CONFLICT DO NOTHING;
UPDATE businesses b SET status = (x.before_row->>'status'),
       last_contacted_at = (x.before_row->>'last_contacted_at')::timestamptz
FROM cc_phase0_backup x
WHERE x.reason = 'stage17b past contracts 2026-11-02' AND x.table_name = 'businesses' AND x.row_id = b.id;
COMMIT;
