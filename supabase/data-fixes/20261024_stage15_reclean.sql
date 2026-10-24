-- Stage 15: re-clean old emails with the Stage 15 rules and mark them 'cleaned'.
-- Tom, 23 Oct 2026: "no AI formatting needed (drop the Unformatted warning, clean emails better by rules)".
--
-- Which rows: emails that came in by the inbound webhook or the Inbox (sources webhook_inbound,
-- webhook_bcc, inbound_email, bcc_capture), never AI-formatted (formatting_status 'unformatted'),
-- never corrected by hand (edited_at IS NULL), with a raw original.
-- What changes: formatted_text_current becomes plain_email_body(raw_text_original) where that is not
-- empty, and formatting_status becomes 'cleaned'. raw_text_original and formatted_text_original are
-- never touched (Hard Rule 10).
-- Every row it changes is copied to cc_phase0_backup (reason 'stage15_reclean_2026_10_24') first.
-- Undo: supabase/data-fixes/20261024_stage15_reclean_undo.sql
-- Run with psql -v ON_ERROR_STOP=1 after migration 20261024_004_stage15_cleaned. It refuses to run twice.

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage15_reclean_2026_10_24') THEN
    RAISE EXCEPTION 'stage15_reclean_2026_10_24 has already been applied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cc_tidy_email_body') THEN
    RAISE EXCEPTION 'migration 20261024_004_stage15_cleaned is not applied';
  END IF;
END $$;

CREATE TEMP TABLE _rc ON COMMIT DROP AS
SELECT c.id, plain_email_body(c.raw_text_original) AS body
FROM correspondence c
WHERE c.formatting_status = 'unformatted'
  AND c.edited_at IS NULL
  AND c.type = 'Email'
  AND c.raw_text_original IS NOT NULL
  AND c.ai_metadata->>'source' IN ('webhook_inbound', 'webhook_bcc', 'inbound_email', 'bcc_capture');

DELETE FROM _rc WHERE body = '';

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'correspondence', c.id,
       jsonb_build_object('formatted_text_current', c.formatted_text_current, 'formatting_status', c.formatting_status),
       'stage15_reclean_2026_10_24'
FROM correspondence c JOIN _rc ON _rc.id = c.id;

UPDATE correspondence c SET formatted_text_current = _rc.body, formatting_status = 'cleaned'
FROM _rc WHERE _rc.id = c.id;

SELECT count(*) AS recleaned FROM _rc;

COMMIT;
