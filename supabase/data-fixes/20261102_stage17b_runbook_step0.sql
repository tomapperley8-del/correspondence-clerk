-- Stage 17b (1): the daily desk routine keeps the full QuickBooks copy current.
-- The routine reads its steps from system_runbook ('daily_desk'), so this changes STEP 0 there; the routine's
-- own prompt (the trigger text in claude.ai) needs no change. Three small additions to STEP 0:
--   b) skip invoices dated after today (an instalment not yet due: the balance reconcile in c) would read it as paid);
--   c) when an invoice brings a customer the app doesn't have, insert the customer first; store the whole line
--      description (every line, joined with a newline); fill an empty line_description on a mirror invoice;
--   g) a new unlinked customer is matched by Tom on Data health.
-- Before-image of the whole row in cc_phase0_backup (reason 'stage17b runbook 2026-11-02').
-- Undo: 20261102_stage17b_runbook_step0_undo.sql. Run it with Tom's go-ahead; the routine picks it up on its next run.
BEGIN;
DO $$
DECLARE
  b text;
  o1 text := E'  b) qbo_sales_get_invoices for the last 90 days, to catch invoices raised since the last run.\n';
  n1 text := E'  b) qbo_sales_get_invoices for the last 90 days, to catch invoices raised since the last run. Ignore any invoice dated after today (an instalment not yet due): the reconcile in c) reads a balance missing from the aging report as paid, so a future invoice has to wait until its date comes.\n';
  o2 text := E'     - INSERT any invoice from (b) that is not in qbo_invoices at all. qbo_invoice_id is the numeric part after the colon in the QuickBooks id, not the whole opaque string\n';
  n2 text := E'     - INSERT any invoice from (b) that is not in qbo_invoices at all. qbo_invoice_id is the numeric part after the colon in the QuickBooks id, not the whole opaque string. qbo_customer_id is the numeric part of the customer id. If that customer is not in qbo_customers yet, INSERT it first (qbo_customer_id, organization_id \'00000000-0000-0000-0000-000000000001\', display_name, normalized_name = cc_name_key(display_name), email), because an invoice needs its customer row. Store the whole line description: every invoice line\'s description joined with a newline, not just the first line. Where an invoice already in the mirror has an empty line_description, fill it the same way.\n';
  o3 text := E'     Leave the rest; the email reports them.\n';
  n3 text := E'     Leave the rest; the email reports them, and Tom matches them on Data health (QuickBooks customers to match).\n';
BEGIN
  SELECT body INTO b FROM system_runbook WHERE id = 'daily_desk';
  IF b IS NULL THEN RAISE EXCEPTION 'daily_desk runbook not found'; END IF;
  IF (length(b) - length(replace(b, o1, ''))) <> length(o1)
     OR (length(b) - length(replace(b, o2, ''))) <> length(o2)
     OR (length(b) - length(replace(b, o3, ''))) <> length(o3) THEN
    RAISE EXCEPTION 'daily_desk runbook is not the text this script expects (md5 %): stop and look', md5(b);
  END IF;
  INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
  SELECT 'system_runbook', md5('system_runbook:daily_desk')::uuid, to_jsonb(r), 'stage17b runbook 2026-11-02'
  FROM system_runbook r WHERE r.id = 'daily_desk';
  UPDATE system_runbook SET body = replace(replace(replace(body, o1, n1), o2, n2), o3, n3), updated_at = now()
  WHERE id = 'daily_desk';
END $$;
COMMIT;
