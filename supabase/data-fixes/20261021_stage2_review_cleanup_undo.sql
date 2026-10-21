-- Undo 20261021_stage2_review_cleanup.sql: puts every backed-up row back exactly
-- as it was (reason 'stage2_review_2026_10_21'), re-inserts the removed domain
-- mappings, then relabels the backup rows so the cleanup could be run again.
-- updated_at is restored too, but an update trigger may stamp it afresh.
-- Run with psql -v ON_ERROR_STOP=1.

BEGIN;

DO $$
DECLARE
  t text;
  cols text;
  key text;
BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','contacts','correspondence','tasks','mail_scan','task_evidence','task_term_aliases'] LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name <> 'id' AND is_generated = 'NEVER';
    EXECUTE format(
      'UPDATE public.%1$I x SET (%2$s) = (SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, b.before_row))
       FROM cc_phase0_backup b
       WHERE b.reason = ''stage2_review_2026_10_21'' AND b.table_name = %1$L
         AND x.id = (jsonb_populate_record(NULL::public.%1$I, b.before_row)).id', t, cols);
  END LOOP;
END $$;

INSERT INTO domain_mappings
SELECT (jsonb_populate_record(NULL::domain_mappings, b.before_row)).*
FROM cc_phase0_backup b
WHERE b.reason = 'stage2_review_2026_10_21' AND b.table_name = 'domain_mappings'
ON CONFLICT (id) DO UPDATE SET business_id = EXCLUDED.business_id, domain = EXCLUDED.domain;

-- Keep the backup for the record; relabelling it lets the cleanup run again.
UPDATE cc_phase0_backup SET reason = 'stage2_review_2026_10_21_undone'
WHERE reason = 'stage2_review_2026_10_21';

COMMIT;
