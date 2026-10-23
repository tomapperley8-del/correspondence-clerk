-- Undo 20261024_stage11b_2_deals.sql: removes the past contracts it recorded and puts the deal copies and notes back as they were.
-- Relabels the backup 'stage11b_deals_2026_10_24_undone' so the script could run again.
-- Run with psql -v ON_ERROR_STOP=1.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage11b_deals_2026_10_24') THEN
    RAISE EXCEPTION 'stage11b_deals_2026_10_24 is not applied';
  END IF;
END $$;

DELETE FROM contracts c USING cc_phase0_backup k
WHERE k.reason = 'stage11b_deals_2026_10_24' AND k.table_name = 'contracts' AND k.row_id = c.id;

UPDATE businesses b SET
  is_club_card = (k.before_row->>'is_club_card')::boolean,
  is_advertiser = (k.before_row->>'is_advertiser')::boolean,
  membership_type = k.before_row->>'membership_type',
  contract_start = (k.before_row->>'contract_start')::date,
  contract_end = (k.before_row->>'contract_end')::date,
  contract_amount = (k.before_row->>'contract_amount')::numeric,
  contract_currency = k.before_row->>'contract_currency',
  deal_terms = k.before_row->>'deal_terms',
  invoice_number = k.before_row->>'invoice_number',
  notes = k.before_row->>'notes'
FROM cc_phase0_backup k
WHERE k.reason = 'stage11b_deals_2026_10_24' AND k.table_name = 'businesses' AND k.row_id = b.id;

SELECT public.refresh_business_truth();

UPDATE cc_phase0_backup SET reason = 'stage11b_deals_2026_10_24_undone' WHERE reason = 'stage11b_deals_2026_10_24';

COMMIT;
