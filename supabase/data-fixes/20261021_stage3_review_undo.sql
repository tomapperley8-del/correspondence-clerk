-- Undo 20261021_stage3_review.sql: undoes each of its merges (newest first, with
-- undo_business_merge), then puts the typed businesses and cleaned contacts back
-- exactly as they were (reason 'stage3_review_2026_10_21') and relabels that backup
-- so the cleanup could be run again. updated_at may be stamped afresh by triggers.
-- Run with psql -v ON_ERROR_STOP=1.

BEGIN;

DO $$ DECLARE r text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage3_review_2026_10_21') THEN
    RAISE EXCEPTION 'stage3_review_2026_10_21 is not applied';
  END IF;
  -- the merges made by the cleanup: same transaction, so the same taken_at
  FOR r IN
    SELECT reason FROM cc_phase0_backup
    WHERE reason LIKE 'merge % into % at %' AND reason NOT LIKE '% (undone)'
      AND taken_at = (SELECT min(taken_at) FROM cc_phase0_backup WHERE reason = 'stage3_review_2026_10_21')
    GROUP BY reason ORDER BY max(id) DESC
  LOOP
    PERFORM undo_business_merge(r);
  END LOOP;
END $$;

DO $$
DECLARE t text; cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['businesses', 'contacts'] LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name <> 'id' AND is_generated = 'NEVER';
    EXECUTE format(
      'UPDATE public.%1$I x SET (%2$s) = (SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, b.before_row))
       FROM cc_phase0_backup b
       WHERE b.reason = ''stage3_review_2026_10_21'' AND b.table_name = %1$L
         AND x.id = (jsonb_populate_record(NULL::public.%1$I, b.before_row)).id', t, cols);
  END LOOP;
END $$;

UPDATE cc_phase0_backup SET reason = 'stage3_review_2026_10_21_undone'
WHERE reason = 'stage3_review_2026_10_21';

COMMIT;
