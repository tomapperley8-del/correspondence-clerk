-- 20260918_001_plain_email_body.sql
--
-- Readable email bodies without AI.
--
-- Until now the body field everything reads (formatted_text_current) was only
-- ever written by the AI formatter. With AI switched off on 16 Sep 2026 every
-- inbound email was stored with that field empty: 626 entries showed nothing at
-- all in the app, and the routines that are meant to "understand the
-- conversation so far" were reading blanks. The original text was never lost,
-- it sat in raw_text_original.
--
-- plain_email_body() is the SQL twin of plainEmailBody() in lib/inbound/utils.ts:
-- take the header block off the top, cut the quoted chain off the bottom, tidy
-- Outlook's <mailto:> and <http> noise. The app now fills the field on insert;
-- this function is here to backfill the old rows and for any future repair.

CREATE OR REPLACE FUNCTION public.plain_email_body(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  body text;
  pat  text;
  cut  int;
  best int;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN RETURN ''; END IF;
  body := replace(raw, E'\r\n', E'\n');

  -- Header block: everything up to Outlook's underscore rule, if there is one
  -- near the top, otherwise the leading From/Date/Subject lines.
  IF body ~ ('^[\s\S]{0,600}?\n_{10,}\n') THEN
    body := regexp_replace(body, '^[\s\S]{0,600}?\n_{10,}\n', '');
  ELSE
    body := regexp_replace(body, '^((From|To|Cc|Date|Sent|Subject|Reply-To):[^\n]*\n)+', '', 'i');
  END IF;

  -- Cut at the earliest sign of a quoted reply.
  best := NULL;
  FOREACH pat IN ARRAY ARRAY[
    E'\n_{10,}[\\s]*\n+[\\s]*From:',
    E'\nFrom:[^\n]*\n[ \t]*(Sent|Date):',
    E'\n-{3,}[ ]*Original Message[ ]*-{3,}',
    E'\n-{3,}[ ]*Forwarded message[ ]*-{3,}',
    E'\nOn .{5,120}wrote:',
    E'\n-- \n'
  ] LOOP
    cut := regexp_instr(body, pat, 1, 1, 0, 'i');
    IF cut > 0 AND (best IS NULL OR cut < best) THEN best := cut; END IF;
  END LOOP;
  IF best IS NOT NULL THEN body := left(body, best - 1); END IF;

  body := regexp_replace(body, '<mailto:[^>]*>', '', 'gi');
  body := regexp_replace(body, '<https?://[^>]*>', '', 'gi');
  body := regexp_replace(body, '^_{10,}$', '', 'ng');
  body := regexp_replace(body, '[ \t]+$', '', 'ng');
  body := regexp_replace(body, E'\n{3,}', E'\n\n', 'g');

  RETURN left(btrim(body), 8000);
END $$;

COMMENT ON FUNCTION public.plain_email_body(text) IS
  'Readable body text from a stored raw email, no AI. SQL twin of plainEmailBody() in lib/inbound/utils.ts.';

-- Backfill, applied 18 Sep 2026: 1,017 entries had no readable body (626 of them
-- completely empty). Every row was copied to cc_phase0_backup first, reason
-- 'empty_body_backfill_2026_09_18'. Rows with a manual correction (edited_at set)
-- were left alone, as were rows where the extracted body was no better.
--
-- WITH cand AS (
--   SELECT c.id, plain_email_body(c.raw_text_original) nb,
--          length(coalesce(c.formatted_text_current,'')) cur
--   FROM correspondence c
--   WHERE c.edited_at IS NULL
--     AND (coalesce(c.formatted_text_current,'') = ''
--          OR (length(coalesce(c.formatted_text_current,'')) < 80
--              AND length(coalesce(c.raw_text_original,'')) > 300))
-- ), ok AS (SELECT id, nb FROM cand WHERE length(nb) >= 40 AND length(nb) >= cur + 40)
-- UPDATE correspondence c SET formatted_text_current = ok.nb,
--        formatted_text_original = coalesce(nullif(c.formatted_text_original,''), ok.nb)
-- FROM ok WHERE ok.id = c.id;
