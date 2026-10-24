-- Stage 15 (UI overhaul): no AI formatting needed.
--
-- Tom, 23 Oct 2026: "no AI formatting needed (drop the Unformatted warning,
-- clean emails better by rules)". App AI has been off since 16 Sep, so 835 of
-- 985 recent emails showed "Unformatted Entry ... Format Now", which could not
-- work. Their body is already cleaned by rules (plainEmailBody in
-- lib/inbound/utils.ts, plain_email_body here).
--
-- 1. formatting_status gains 'cleaned': the body was made by the rules, with no
--    AI. The app treats it as normal. The AI batch functions
--    (get_unformatted_batch, get_unformatted_entries) still pick only
--    'unformatted', so they leave cleaned entries alone. No view reads
--    formatting_status (checked 23 Oct).
-- 2. plain_email_body() follows the Stage 15 rules of its TypeScript twin: cut
--    at "Sent from my iPhone" and at legal disclaimers and mailing-list
--    footers, drop picture placeholders, tracking links and "view in browser"
--    lines, unwrap Outlook safe links. Originals are never changed (Hard Rule
--    10); re-cleaning old entries is a separate data script with a backup:
--    supabase/data-fixes/20261024_stage15_reclean.sql.
--
-- Must be live BEFORE the Stage 15 code: the inbound webhook then writes
-- 'cleaned', which the old check constraint refuses.
-- Rollback: supabase/migrations/rollback/20261024_004_stage15_cleaned_rollback.sql

ALTER TABLE public.correspondence DROP CONSTRAINT IF EXISTS correspondence_formatting_status_check;
ALTER TABLE public.correspondence ADD CONSTRAINT correspondence_formatting_status_check
  CHECK (formatting_status = ANY (ARRAY['formatted'::text, 'unformatted'::text, 'failed'::text, 'cleaned'::text]));

-- %XX decoding for safe links; the input back unchanged if it is not valid UTF-8
CREATE OR REPLACE FUNCTION public.cc_url_decode(s text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  out bytea := ''::bytea;
  m text[];
BEGIN
  IF s IS NULL OR position('%' in s) = 0 THEN RETURN s; END IF;
  FOR m IN SELECT regexp_matches(s, '%([0-9A-Fa-f]{2})|([^%]+|%)', 'g') LOOP
    IF m[1] IS NOT NULL THEN out := out || decode(m[1], 'hex');
    ELSE out := out || convert_to(m[2], 'UTF8');
    END IF;
  END LOOP;
  RETURN convert_from(out, 'UTF8');
EXCEPTION WHEN others THEN
  RETURN s;
END $$;

-- The tidy-up after the cuts; picture placeholders become p ('' or '[picture]')
CREATE OR REPLACE FUNCTION public.cc_tidy_email_body(body text, p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  m text[];
  n int := 0;
BEGIN
  -- Outlook safe links: keep the real address
  LOOP
    n := n + 1;
    EXIT WHEN n > 50;
    m := regexp_match(body, 'https?://[a-z0-9.-]*safelinks\.protection\.outlook\.com/\S*?[?&]url=([^&\s>]+)[^\s>]*', 'i');
    EXIT WHEN m IS NULL;
    body := regexp_replace(body, 'https?://[a-z0-9.-]*safelinks\.protection\.outlook\.com/\S*?[?&]url=([^&\s>]+)[^\s>]*',
                           replace(cc_url_decode(m[1]), '\', '\\'), 'i');
  END LOOP;
  body := regexp_replace(body, '<(mailto|tel|sms):[^>]*>', '', 'gi');
  body := regexp_replace(body, '<https?://[^>]*>', '', 'gi');
  body := regexp_replace(body, '\[(https?://|cid:|image)[^]\n]*\]', p, 'gi');
  body := regexp_replace(body, 'https?://([a-z0-9-]+\.)*(list-manage\.com|mailchi\.mp|awstrack\.me|sendgrid\.net|hubspotlinks\.com|mjt\.lu|createsend[0-9]*\.com|klclick[0-9]*\.com)/\S*', '', 'gi');
  body := regexp_replace(body, '^[^\n]*(view (this (e-?mail|message|newsletter) )?(in|on) (your|a) (web )?browser|having trouble (reading|viewing) this)[^\n]*$', '', 'gin');
  body := regexp_replace(body, '[​-‍⁠﻿͏­]', '', 'g');
  body := regexp_replace(body, '^(_{10,}|[*=~]{10,})$', '', 'ng');
  body := regexp_replace(body, '[ \t ]+$', '', 'ng');
  body := regexp_replace(body, E'\n{3,}', E'\n\n', 'g');
  body := regexp_replace(body, '^\s+|\s+$', '', 'g');
  RETURN left(body, 8000);
END $$;

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
  tidied text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN RETURN ''; END IF;
  body := replace(raw, E'\r\n', E'\n');

  -- Header block: everything up to Outlook's underscore rule, if there is one
  -- near the top, otherwise the leading From/Date/Subject lines.
  -- (Stage 15: the rule must start in the first 600 characters, as in the
  -- TypeScript twin; it used to be "ends within 700".)
  cut := regexp_instr(body, E'\n_{10,}\n');
  IF cut > 0 AND cut <= 600 THEN
    body := substr(body, regexp_instr(body, E'\n_{10,}\n', 1, 1, 1));
  ELSE
    body := regexp_replace(body, '^((From|To|Cc|Date|Sent|Subject|Reply-To):[^\n]*\n)+', '', 'i');
  END IF;

  -- Cut at the earliest of: the quoted reply, the phone sign-off, or (after
  -- the first 200 characters) a legal or mailing-list footer.
  best := NULL;
  FOREACH pat IN ARRAY ARRAY[
    E'\n_{10,}\\s*\n+\\s*From:',
    E'(?i)\nFrom:[^\n]*\n\\s*(Sent|Date):',
    E'(?i)\n-{3,}\\s*Original Message\\s*-{3,}',
    E'(?i)\n-{3,}\\s*Forwarded message\\s*-{3,}',
    E'\nOn [^\n]{5,120}\\ywrote:',
    E'\n-- \n',
    E'(?i)\n[ \t]*(Sent from my (iPhone|iPad|Samsung|Galaxy|Android|BlackBerry|mobile|phone)|Sent from Outlook for (iOS|Android)|Get Outlook for (iOS|Android))\\y'
  ] LOOP
    cut := regexp_instr(body, pat);
    IF cut > 0 AND (best IS NULL OR cut < best) THEN best := cut; END IF;
  END LOOP;

  FOREACH pat IN ARRAY ARRAY[
    E'\n[ \t]*(Disclaimer\\y|DISCLAIMER|CONFIDENTIALITY\\y|Confidentiality (notice|note)\\y)',
    E'(?i)\n[ \t]*(This|The) (e-?mail|message|communication)( and any (files|attachments)[^\n]{0,40})? (is|are|may be) (strictly )?(confidential|private|intended|legally privileged)',
    E'(?i)\n[ \t]*The (information|contents?) (contained )?in (this|the) (e-?mail|message|communication)',
    E'(?i)\n[ \t]*This (e-?mail|message) (has been|was) (scanned|sent to)',
    E'(?i)\n[ \t]*If you (are not the intended recipient|have received this (e-?mail|message) in error)',
    E'(?i)\n[ \t]*Please consider the environment before printing',
    E'(?i)\n[ \t]*(Want to change how you receive these emails|Unsubscribe from this list|You are receiving this (e-?mail|newsletter) because|To unsubscribe\\y)'
  ] LOOP
    cut := regexp_instr(body, pat, least(201, length(body) + 1));
    IF cut > 0 AND (best IS NULL OR cut < best) THEN best := cut; END IF;
  END LOOP;
  IF best IS NOT NULL THEN body := left(body, best - 1); END IF;

  -- Pictures are logos and spacers, except in a message that is nothing but
  -- pictures, where a plain marker says something was sent.
  tidied := cc_tidy_email_body(body, '');
  IF tidied = '' THEN tidied := cc_tidy_email_body(body, '[picture]'); END IF;
  RETURN tidied;
END $$;

COMMENT ON FUNCTION public.plain_email_body(text) IS
  'Readable body text from a stored raw email, no AI. SQL twin of plainEmailBody() in lib/inbound/utils.ts (Stage 15 rules).';
