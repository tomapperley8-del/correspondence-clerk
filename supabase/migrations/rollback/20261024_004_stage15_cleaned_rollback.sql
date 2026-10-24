-- Rollback 20261024_004_stage15_cleaned.sql.
-- First run supabase/data-fixes/20261024_stage15_reclean_undo.sql if the re-clean ran, and put the
-- pre-Stage-15 code back (it writes 'unformatted', not 'cleaned').
-- Rows still 'cleaned' (new emails since) go back to 'unformatted' so the old constraint fits.

UPDATE public.correspondence SET formatting_status = 'unformatted' WHERE formatting_status = 'cleaned';

ALTER TABLE public.correspondence DROP CONSTRAINT IF EXISTS correspondence_formatting_status_check;
ALTER TABLE public.correspondence ADD CONSTRAINT correspondence_formatting_status_check
  CHECK (formatting_status = ANY (ARRAY['formatted'::text, 'unformatted'::text, 'failed'::text]));

-- plain_email_body back to its 18 Sep 2026 text (supabase/migrations/20260918_001_plain_email_body.sql,
-- re-run that file's CREATE OR REPLACE FUNCTION), then:
DROP FUNCTION IF EXISTS public.cc_tidy_email_body(text, text);
DROP FUNCTION IF EXISTS public.cc_url_decode(text);
