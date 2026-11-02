-- Stage 17b (2): sent email from tom@ and info@. This migration changes no data.
-- The daily desk routine reads Outlook (tom@ and, as a shared mailbox, info@) with the connector and hands
-- each sent message to file_sent_mail(), which files it the same way every time:
--   * skipped when the message is already in mail_scan (same mailbox and Internet message id)
--   * calendar replies and auto replies are skipped; mail only to the team or to our own addresses is skipped
--   * recipients are matched to an active contact by email (the first match, To before Cc); a recipient on
--     an Internal/community business counts as team and is skipped
--   * no contact: the business that owns the recipient's company domain (a mapped domain, or the only
--     business with a contact on that domain); personal-provider and our own domains never match by domain
--   * nothing matches: a personal-provider address is skipped (found in mail_scan); any other address is
--     held on Data health ("Sent email to review") for Choose business / Ignore, one or many at once
--   * before filing, the same business is checked for a copy already on file (a BCC copy has no message
--     id): the same subject (Re:/Fw: ignored) within 20 minutes, or the same text (content_hash)
--   * filed text is the message exactly as Outlook's search returns it (a preview of the first part,
--     flagged body_is_preview in ai_metadata, with the link to open the whole message); the cleaned text
--     shown on the business page is plain_email_body() of it, as for BCC copies
-- Also here: v_sent_mail_to_review, v_data_health(_counts) check sent_mail_to_review, system_alarm() line
-- routine:sent_mail_sweep, and resolve/ignore/undo functions for the Data health list (every change is a
-- batch in cc_phase0_backup). Rollback: rollback/20261102_003_sent_mail_rollback.sql

-- 1. mail_scan: what is needed to hold a message for review
ALTER TABLE public.mail_scan
  ADD COLUMN IF NOT EXISTS cc_emails text[],
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS web_link text,
  ADD COLUMN IF NOT EXISTS held_key text,
  ADD COLUMN IF NOT EXISTS held_name text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
CREATE INDEX IF NOT EXISTS mail_scan_held_idx ON public.mail_scan (held_key) WHERE disposition = 'unmatched';

-- run record: one row each time the routine hands a mailbox's sent mail over
CREATE TABLE IF NOT EXISTS public.sent_mail_runs (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  mailbox text,
  rows_seen integer NOT NULL DEFAULT 0,
  result jsonb
);
ALTER TABLE public.sent_mail_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sent_mail_runs_auth_read ON public.sent_mail_runs;
CREATE POLICY sent_mail_runs_auth_read ON public.sent_mail_runs FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.sent_mail_runs TO authenticated;
GRANT ALL ON public.sent_mail_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sent_mail_runs_id_seq TO service_role;

-- 2. helpers
CREATE OR REPLACE FUNCTION public.cc_is_own_address(p_addr text)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT lower(split_part(btrim(p_addr), '@', 2)) IN ('thechiswickcalendar.co.uk', 'chiswickcalendar.co.uk', 'correspondenceclerk.com')
      OR EXISTS (SELECT 1 FROM user_profiles u WHERE lower(btrim(p_addr)) = ANY (SELECT lower(x) FROM unnest(coalesce(u.own_email_addresses, '{}')) x));
$$;

CREATE OR REPLACE FUNCTION public.cc_is_personal_domain(p_domain text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT lower(btrim(p_domain)) ~ '^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|gmx|btinternet|btopenworld|sky|talktalk|virginmedia|ntlworld|blueyonder|proton|protonmail|pm|zoho|mail|email|fastmail|hey|tutanota|yandex)\.[a-z.]+$';
$$;

-- the business that owns a company domain, without writing a mapping (business_for_domain writes one)
CREATE OR REPLACE FUNCTION public.cc_business_for_domain_readonly(p_org uuid, p_domain text)
 RETURNS uuid LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE d text := lower(btrim(p_domain)); found uuid; n int;
BEGIN
  IF d IS NULL OR d = '' OR cc_is_personal_domain(d) OR cc_is_own_address('x@' || d) THEN RETURN NULL; END IF;
  SELECT m.business_id INTO found FROM domain_mappings m
    JOIN v_businesses vb ON vb.id = m.business_id AND vb.merged_into IS NULL AND vb.status IS DISTINCT FROM 'Not a business' AND vb.is_commercial
   WHERE m.org_id = p_org AND m.domain = d LIMIT 1;
  IF found IS NOT NULL THEN RETURN found; END IF;
  SELECT count(DISTINCT x.business_id), min(x.business_id::text)::uuid INTO n, found FROM (
    SELECT c.business_id FROM contacts c
      JOIN v_businesses vb ON vb.id = c.business_id AND vb.merged_into IS NULL AND vb.status IS DISTINCT FROM 'Not a business' AND vb.is_commercial
     WHERE c.organization_id = p_org AND c.is_active
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.emails) e WHERE lower(split_part(e, '@', 2)) = d)
  ) x;
  IF n = 1 THEN RETURN found; END IF;
  RETURN NULL;
END $$;

-- same value as compute_content_hash(), without the pgcrypto digest (that function's empty search_path can't see it)
CREATE OR REPLACE FUNCTION public.cc_sha256(p text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog'
AS $$ SELECT CASE WHEN p IS NULL THEN NULL ELSE encode(sha256(convert_to(btrim(p), 'UTF8')), 'hex') END; $$;

CREATE OR REPLACE FUNCTION public.cc_norm_subject(p text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $$ SELECT btrim(regexp_replace(lower(coalesce(p, '')), '^(\s*(re|fw|fwd)\s*:\s*)+', '')); $$;

-- a copy already on file for this business?
CREATE OR REPLACE FUNCTION public.cc_sent_mail_duplicate(p_business uuid, p_sent_at timestamptz, p_subject text, p_hash text)
 RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.id FROM correspondence c
   WHERE c.business_id = p_business AND c.direction = 'sent'
     AND ((c.entry_date BETWEEN p_sent_at - interval '20 minutes' AND p_sent_at + interval '20 minutes'
           AND cc_norm_subject(c.subject) = cc_norm_subject(p_subject))
          OR (p_hash IS NOT NULL AND c.content_hash = p_hash))
   ORDER BY c.entry_date LIMIT 1;
$$;

-- file one held or matched message as a correspondence row
CREATE OR REPLACE FUNCTION public.cc_insert_sent_mail(p_scan_id bigint, p_business uuid, p_contact uuid, p_cc uuid[], p_other uuid[] DEFAULT '{}')
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE s mail_scan%ROWTYPE; v_user uuid; v_plain text; v_id uuid; v_head text; v_cut int;
BEGIN
  SELECT * INTO s FROM mail_scan WHERE id = p_scan_id;
  SELECT id INTO v_user FROM user_profiles ORDER BY created_at LIMIT 1;
  -- Outlook's preview is the new message followed by the quoted one: keep only the new message
  v_head := coalesce(s.body, '');
  v_cut := least(nullif(regexp_instr(v_head, E'\n\s*_{10,}\s*\n+\s*From:'), 0), nullif(regexp_instr(v_head, E'(?i)\nFrom:[^\n]*\n\s*(Sent|Date):'), 0));
  IF v_cut IS NOT NULL THEN v_head := left(v_head, v_cut - 1); END IF;
  v_plain := plain_email_body(v_head);
  IF btrim(coalesce(v_plain, '')) = '' THEN v_plain := btrim(coalesce(s.body, '')); END IF;
  INSERT INTO correspondence (business_id, contact_id, user_id, organization_id, type, direction, subject, entry_date,
      raw_text_original, formatted_text_original, formatted_text_current, formatting_status, action_needed,
      cc_contact_ids, content_hash, ai_metadata)
  VALUES (p_business, p_contact, v_user, s.organization_id, 'Email'::entry_type, 'sent', s.subject, s.received_at,
      coalesce(s.body, ''), v_plain, v_plain, 'cleaned', 'none'::action_needed_type,
      coalesce(p_cc, '{}'), cc_sha256(coalesce(s.body, '')),
      jsonb_strip_nulls(jsonb_build_object('source', 'sent_mail_sweep', 'mailbox', s.mailbox, 'internet_message_id', s.internet_message_id,
        'graph_id', s.graph_id, 'from_email', s.from_email, 'body_is_preview', true, 'web_link', s.web_link,
        'other_business_ids', CASE WHEN cardinality(coalesce(p_other, '{}')) > 0 THEN to_jsonb(p_other) END)))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- 3. the filing function the daily desk routine calls
-- p_rows: [{mailbox, internet_message_id, graph_id, sent_at, from, subject, body, web_link,
--           recipients: [{address, name, kind: 'to'|'cc'}]}]
CREATE OR REPLACE FUNCTION public.file_sent_mail(p_org uuid, p_rows jsonb, p_mailbox text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r jsonb; rec jsonb; m record;
  v_mailbox text; v_mid text; v_sent timestamptz; v_subj text; v_body text; v_hash text;
  v_ext jsonb; v_team int; v_biz uuid; v_contact uuid; v_cc uuid[]; v_other uuid[];
  v_disp text; v_note text; v_key text; v_name text; v_dup uuid; v_corr uuid; v_scan bigint;
  v_addrs text[]; v_ccs text[]; v_dom text;
  res jsonb := jsonb_build_object('filed', 0, 'already_on_file', 0, 'skipped', 0, 'held', 0, 'already_scanned', 0, 'bad', 0);
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_mailbox := lower(btrim(r->>'mailbox')); v_mid := nullif(btrim(r->>'internet_message_id'), '');
    IF v_mailbox IS NULL OR v_mid IS NULL OR nullif(r->>'sent_at', '') IS NULL THEN
      res := jsonb_set(res, '{bad}', to_jsonb((res->>'bad')::int + 1)); CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM mail_scan s WHERE s.mailbox = v_mailbox AND s.internet_message_id = v_mid) THEN
      res := jsonb_set(res, '{already_scanned}', to_jsonb((res->>'already_scanned')::int + 1)); CONTINUE;
    END IF;
    v_sent := (r->>'sent_at')::timestamptz; v_subj := r->>'subject'; v_body := coalesce(r->>'body', '');
    v_hash := cc_sha256(v_body);
    v_disp := NULL; v_note := NULL; v_biz := NULL; v_contact := NULL; v_cc := '{}'; v_other := '{}'; v_key := NULL; v_name := NULL; v_team := 0;

    -- recipients that are not our own addresses, To before Cc
    SELECT coalesce(jsonb_agg(x ORDER BY k, ord), '[]') INTO v_ext FROM (
      SELECT jsonb_build_object('address', lower(btrim(e->>'address')), 'name', nullif(btrim(coalesce(e->>'name', '')), ''), 'kind', coalesce(nullif(e->>'kind', ''), 'to')) AS x,
             (coalesce(e->>'kind', 'to') = 'cc') AS k, ord
        FROM jsonb_array_elements(coalesce(r->'recipients', '[]')) WITH ORDINALITY AS t(e, ord)
       WHERE position('@' IN coalesce(e->>'address', '')) > 0 AND NOT cc_is_own_address(e->>'address')
    ) q;
    SELECT array_agg(a->>'address'), array_agg(a->>'address') FILTER (WHERE a->>'kind' = 'cc')
      INTO v_addrs, v_ccs FROM jsonb_array_elements(v_ext) a;

    IF coalesce(v_subj, '') ~* '^\s*(accepted|declined|tentative|canceled|cancelled|automatic reply)\s*:' THEN
      v_disp := 'ignored_noise'; v_note := 'calendar reply or automatic reply';
    ELSIF jsonb_array_length(v_ext) = 0 THEN
      v_disp := 'ignored_noise'; v_note := 'only our own addresses';
    ELSE
      -- contact match, To before Cc
      FOR rec IN SELECT * FROM jsonb_array_elements(v_ext) LOOP
        SELECT c.id AS contact_id, c.business_id, vb.is_commercial INTO m
          FROM contacts c JOIN v_businesses vb ON vb.id = c.business_id
         WHERE c.organization_id = p_org AND c.is_active AND vb.merged_into IS NULL AND vb.status IS DISTINCT FROM 'Not a business'
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.emails) em WHERE lower(em) = rec->>'address')
         ORDER BY c.is_primary DESC, c.created_at LIMIT 1;
        IF FOUND THEN
          IF NOT m.is_commercial THEN v_team := v_team + 1;
          ELSIF v_biz IS NULL THEN v_biz := m.business_id; v_contact := m.contact_id;
          ELSIF m.business_id = v_biz AND m.contact_id <> v_contact THEN v_cc := array_append(v_cc, m.contact_id);
          ELSIF m.business_id <> v_biz THEN v_other := array_append(v_other, m.business_id);
          END IF;
        END IF;
      END LOOP;
      -- company domain, when no contact matched
      IF v_biz IS NULL AND v_team = 0 THEN
        FOR rec IN SELECT * FROM jsonb_array_elements(v_ext) LOOP
          v_dom := split_part(rec->>'address', '@', 2);
          v_biz := cc_business_for_domain_readonly(p_org, v_dom);
          EXIT WHEN v_biz IS NOT NULL;
        END LOOP;
      END IF;
      IF v_biz IS NOT NULL THEN
        v_dup := cc_sent_mail_duplicate(v_biz, v_sent, v_subj, v_hash);
        IF v_dup IS NOT NULL THEN
          v_disp := 'linked'; v_corr := v_dup; v_note := 'already on file';
        ELSE
          v_disp := 'backfilled';
        END IF;
      ELSIF v_team > 0 THEN
        v_disp := 'ignored_noise'; v_note := 'sent to the team';
      ELSE
        rec := v_ext->0;
        v_key := rec->>'address'; v_name := rec->>'name';
        IF cc_is_personal_domain(split_part(v_key, '@', 2)) OR v_key ~* '^(no-?reply|donotreply|do-not-reply|mailer-daemon)@' THEN
          v_disp := 'ignored_noise'; v_note := 'personal or automatic address, no contact on file'; v_key := NULL; v_name := NULL;
        ELSE
          v_disp := 'unmatched'; v_note := 'no contact or business matches ' || v_key;
        END IF;
      END IF;
    END IF;

    INSERT INTO mail_scan (organization_id, mailbox, internet_message_id, graph_id, direction, from_email, to_emails, cc_emails,
                           subject, received_at, business_id, correspondence_id, disposition, note, body, web_link, held_key, held_name)
    VALUES (p_org, v_mailbox, v_mid, r->>'graph_id', 'sent', lower(coalesce(r->>'from', v_mailbox)), v_addrs, v_ccs,
            v_subj, v_sent, CASE WHEN v_disp IN ('backfilled', 'linked') THEN v_biz END, v_corr, v_disp, v_note,
            CASE WHEN v_disp IN ('backfilled', 'unmatched') THEN v_body END, r->>'web_link', v_key, v_name)
    RETURNING id INTO v_scan;

    IF v_disp = 'backfilled' THEN
      v_corr := cc_insert_sent_mail(v_scan, v_biz, v_contact, v_cc, v_other);
      UPDATE mail_scan SET correspondence_id = v_corr, body = NULL WHERE id = v_scan;
      res := jsonb_set(res, '{filed}', to_jsonb((res->>'filed')::int + 1));
    ELSIF v_disp = 'linked' THEN
      res := jsonb_set(res, '{already_on_file}', to_jsonb((res->>'already_on_file')::int + 1));
    ELSIF v_disp = 'unmatched' THEN
      res := jsonb_set(res, '{held}', to_jsonb((res->>'held')::int + 1));
    ELSE
      res := jsonb_set(res, '{skipped}', to_jsonb((res->>'skipped')::int + 1));
    END IF;
    v_corr := NULL;
  END LOOP;
  -- the run record system_alarm() watches: written on every call, even with no messages
  INSERT INTO sent_mail_runs (organization_id, mailbox, rows_seen, result) VALUES (p_org, lower(p_mailbox), jsonb_array_length(p_rows), res);
  RETURN res;
END $$;
GRANT EXECUTE ON FUNCTION public.file_sent_mail(uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cc_is_own_address(text), public.cc_is_personal_domain(text), public.cc_business_for_domain_readonly(uuid, text),
  public.cc_norm_subject(text), public.cc_sha256(text), public.cc_sent_mail_duplicate(uuid, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_insert_sent_mail(bigint, uuid, uuid, uuid[], uuid[]) TO service_role;


-- 4. Data health list: sent email held for review, one row per recipient address
CREATE OR REPLACE VIEW public.v_sent_mail_to_review WITH (security_invoker = true) AS
SELECT s.organization_id,
       s.held_key AS recipient,
       max(s.held_name) AS recipient_name,
       count(*)::integer AS n,
       max(s.received_at) AS last_sent,
       (array_agg(s.subject ORDER BY s.received_at DESC))[1:3] AS subjects,
       array_agg(DISTINCT s.mailbox) AS mailboxes
  FROM mail_scan s
 WHERE s.disposition = 'unmatched' AND s.held_key IS NOT NULL
 GROUP BY s.organization_id, s.held_key;
GRANT SELECT ON public.v_sent_mail_to_review TO authenticated, service_role;

-- 5. choose a business for held mail (files it), ignore it, or take a batch back
CREATE OR REPLACE FUNCTION public.cc_sent_mail_caller_ok(p_org uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT auth.uid() IS NULL OR EXISTS (SELECT 1 FROM user_profiles u WHERE u.id = auth.uid() AND u.organization_id = p_org); $$;

CREATE OR REPLACE FUNCTION public.resolve_sent_mail(p_org uuid, p_keys text[], p_business uuid, p_batch text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE k text; s record; v_contact uuid; v_name text; v_corr uuid; v_dom text; v_map uuid; v_n int := 0; v_cid uuid;
BEGIN
  IF NOT cc_sent_mail_caller_ok(p_org) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = p_business AND b.organization_id = p_org) THEN RAISE EXCEPTION 'business not found'; END IF;
  FOREACH k IN ARRAY p_keys LOOP
    v_contact := NULL;
    SELECT c.id INTO v_contact FROM contacts c
     WHERE c.business_id = p_business AND c.is_active
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.emails) em WHERE lower(em) = k) LIMIT 1;
    IF v_contact IS NULL THEN
      SELECT max(held_name) INTO v_name FROM mail_scan WHERE disposition = 'unmatched' AND held_key = k AND organization_id = p_org;
      -- a real name only: no placeholders, no address standing in for a name
      IF v_name IS NOT NULL AND position('@' IN v_name) = 0 AND lower(v_name) <> k AND length(btrim(v_name)) > 1 THEN
        INSERT INTO contacts (business_id, organization_id, name, emails) VALUES (p_business, p_org, btrim(v_name), jsonb_build_array(k))
        RETURNING id INTO v_contact;
        INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason) VALUES ('contacts_created', v_contact, jsonb_build_object('key', k), p_batch);
      END IF;
    END IF;
    v_dom := split_part(k, '@', 2);
    IF NOT cc_is_personal_domain(v_dom) AND NOT cc_is_own_address(k)
       AND NOT EXISTS (SELECT 1 FROM domain_mappings m WHERE m.org_id = p_org AND m.domain = v_dom) THEN
      INSERT INTO domain_mappings (org_id, domain, business_id) VALUES (p_org, v_dom, p_business) RETURNING id INTO v_map;
      INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason) VALUES ('domain_mappings_created', v_map, jsonb_build_object('domain', v_dom), p_batch);
    END IF;
    FOR s IN SELECT id FROM mail_scan WHERE disposition = 'unmatched' AND held_key = k AND organization_id = p_org ORDER BY received_at LOOP
      IF cc_sent_mail_duplicate(p_business, (SELECT received_at FROM mail_scan WHERE id = s.id), (SELECT subject FROM mail_scan WHERE id = s.id),
                                cc_sha256((SELECT body FROM mail_scan WHERE id = s.id))) IS NOT NULL THEN
        UPDATE mail_scan SET disposition = 'linked', business_id = p_business, note = 'already on file', resolved_at = now() WHERE id = s.id;
        INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason) VALUES ('mail_scan_resolved', md5('mail_scan:' || s.id)::uuid, jsonb_build_object('scan_id', s.id, 'filed', false), p_batch);
      ELSE
        v_corr := cc_insert_sent_mail(s.id, p_business, v_contact, '{}', '{}');
        UPDATE mail_scan SET disposition = 'backfilled', business_id = p_business, correspondence_id = v_corr, resolved_at = now(), note = 'filed from Data health' WHERE id = s.id;
        INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason) VALUES ('correspondence_created', v_corr, jsonb_build_object('scan_id', s.id), p_batch);
        INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason) VALUES ('mail_scan_resolved', md5('mail_scan:' || s.id)::uuid, jsonb_build_object('scan_id', s.id, 'filed', true), p_batch);
        v_n := v_n + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.ignore_sent_mail(p_org uuid, p_keys text[], p_batch text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE s record; v_n int := 0;
BEGIN
  IF NOT cc_sent_mail_caller_ok(p_org) THEN RAISE EXCEPTION 'not allowed'; END IF;
  FOR s IN SELECT id FROM mail_scan WHERE disposition = 'unmatched' AND held_key = ANY (p_keys) AND organization_id = p_org LOOP
    UPDATE mail_scan SET disposition = 'ignored_noise', note = 'ignored on Data health', resolved_at = now() WHERE id = s.id;
    INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason) VALUES ('mail_scan_ignored', md5('mail_scan:' || s.id)::uuid, jsonb_build_object('scan_id', s.id), p_batch);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.undo_sent_mail_batch(p_org uuid, p_batch text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE b record; v_mail int := 0; v_contacts int := 0; v_kept int := 0;
BEGIN
  IF NOT cc_sent_mail_caller_ok(p_org) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_batch !~ '^sent-review-[A-Za-z0-9-]+$' THEN RAISE EXCEPTION 'not a review batch'; END IF;
  FOR b IN SELECT * FROM cc_phase0_backup WHERE reason = p_batch AND table_name IN ('mail_scan_resolved', 'mail_scan_ignored') LOOP
    UPDATE mail_scan SET disposition = 'unmatched', business_id = NULL, correspondence_id = NULL, resolved_at = NULL,
           note = 'no contact or business matches ' || held_key
     WHERE id = (b.before_row->>'scan_id')::bigint AND organization_id = p_org;
  END LOOP;
  FOR b IN SELECT * FROM cc_phase0_backup WHERE reason = p_batch AND table_name = 'correspondence_created' LOOP
    DELETE FROM correspondence WHERE id = b.row_id AND organization_id = p_org; v_mail := v_mail + 1;
  END LOOP;
  FOR b IN SELECT * FROM cc_phase0_backup WHERE reason = p_batch AND table_name = 'contacts_created' LOOP
    IF EXISTS (SELECT 1 FROM correspondence c WHERE c.contact_id = b.row_id OR b.row_id = ANY (c.cc_contact_ids)) THEN v_kept := v_kept + 1;
    ELSE DELETE FROM contacts WHERE id = b.row_id AND organization_id = p_org; v_contacts := v_contacts + 1; END IF;
  END LOOP;
  DELETE FROM domain_mappings WHERE id IN (SELECT row_id FROM cc_phase0_backup WHERE reason = p_batch AND table_name = 'domain_mappings_created') AND org_id = p_org;
  RETURN jsonb_build_object('emails', v_mail, 'contacts', v_contacts, 'kept', v_kept);
END $$;
GRANT EXECUTE ON FUNCTION public.cc_sent_mail_caller_ok(uuid), public.resolve_sent_mail(uuid, text[], uuid, text),
  public.ignore_sent_mail(uuid, text[], text), public.undo_sent_mail_batch(uuid, text) TO authenticated, service_role;


-- 6. Data health check
CREATE OR REPLACE VIEW public.v_data_health WITH (security_invoker = true) AS
 WITH live AS (
         SELECT v.id,
            v.name,
            v.normalized_name,
            v.category,
            v.status,
            v.is_club_card,
            v.is_advertiser,
            v.last_contacted_at,
            v.mastersheet_source_ids,
            v.created_at,
            v.updated_at,
            v.contract_start,
            v.contract_end,
            v.deal_terms,
            v.payment_structure,
            v.contract_amount,
            v.address,
            v.email,
            v.phone,
            v.organization_id,
            v.contract_currency,
            v.notes,
            v.membership_type,
            v.relationship_memory,
            v.relationship_memory_updated_at,
            v.contract_renewal_type,
            v.business_type,
            v.disposition,
            v.follow_up_after,
            v.mute_replies,
            v.renewal_stage,
            v.renewal_contacted_at,
            v.outreach_stage,
            v.outreach_contacted_at,
            v.outreach_followed_up_at,
            v.outreach_declined_at,
            v.renewal_declined_at,
            v.outreach_identified_at,
            v.outreach_in_discussion_at,
            v.outreach_won_at,
            v.outreach_invoice_paid_at,
            v.renewal_not_started_at,
            v.renewal_in_discussion_at,
            v.renewal_agreed_at,
            v.renewal_invoice_paid_at,
            v.invoice_number,
            v.merged_into,
            v.attention_snoozed_until,
            v.status_stored,
            v.last_contacted_at_stored,
            v.is_commercial,
            v.current_contract_id,
            v.deal_state,
            v.main_contact_id,
            v.main_contact_is_manual,
            v.website
           FROM v_businesses v
          WHERE ((v.merged_into IS NULL) AND (COALESCE(v.status, ''::text) <> 'Not a business'::text))
        )
 SELECT b.organization_id,
    'club_card_no_card'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    b.current_contract_id AS contract_id,
    ( SELECT max(c.contract_end) AS max
           FROM contracts c
          WHERE ((c.business_id = b.id) AND (c.membership_type = 'club_card'::text))) AS ref_date,
    m.card_state AS detail
   FROM (live b
     LEFT JOIN v_club_card_members m ON ((m.business_id = b.id)))
  WHERE (b.is_club_card AND (COALESCE(m.card_state, 'none'::text) <> ALL (ARRAY['member'::text, 'grace'::text])))
UNION ALL
 SELECT b.organization_id,
    'deal_no_quickbooks'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    c.id AS contract_id,
    c.contract_end AS ref_date,
    c.membership_type AS detail
   FROM (contracts c
     JOIN live b ON ((b.id = c.business_id)))
  WHERE (c.is_current AND (NOT COALESCE(c.invoice_paid, false)) AND (COALESCE(c.contract_amount, (0)::numeric) > (0)::numeric) AND ((c.contract_end IS NULL) OR (c.contract_end >= (cc_today() - 60))) AND (c.qbo_invoice_id IS NULL) AND (NOT (EXISTS ( SELECT 1
           FROM qbo_links l
          WHERE (l.business_id = c.business_id)))))
UNION ALL
 SELECT b.organization_id,
    'active_no_named_contact'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    b.current_contract_id AS contract_id,
    NULL::date AS ref_date,
    b.deal_state AS detail
   FROM live b
  WHERE ((b.status = 'Active'::text) AND COALESCE(b.is_commercial, true) AND (NOT (EXISTS ( SELECT 1
           FROM contacts ct
          WHERE ((ct.business_id = b.id) AND COALESCE(ct.is_active, true) AND (NOT COALESCE(ct.name_is_placeholder, false)))))))
UNION ALL
 SELECT b.organization_id,
    'stored_out_of_step'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    NULL::uuid AS contract_id,
    (b.last_contacted_at_stored)::date AS ref_date,
    concat_ws(', '::text,
        CASE
            WHEN (b.status IS DISTINCT FROM b.status_stored) THEN 'status'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored) THEN 'last_in_touch'::text
            ELSE NULL::text
        END) AS detail
   FROM live b
  WHERE ((b.status IS DISTINCT FROM b.status_stored) OR (b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored))
UNION ALL
 SELECT m.organization_id,
    'qbo_customer_to_match'::text AS check_key,
    m.suggested_business_id AS business_id,
    m.customer_name AS business_name,
    NULL::uuid AS contract_id,
    m.last_invoice_date AS ref_date,
    m.qbo_customer_id AS detail
   FROM v_qbo_customers_to_match m
UNION ALL
 SELECT v.organization_id,
    'sent_mail_to_review'::text AS check_key,
    NULL::uuid AS business_id,
    COALESCE(NULLIF(v.recipient_name, ''), v.recipient) AS business_name,
    NULL::uuid AS contract_id,
    v.last_sent::date AS ref_date,
    v.recipient AS detail
   FROM v_sent_mail_to_review v;

CREATE OR REPLACE VIEW public.v_data_health_counts WITH (security_invoker = true) AS
 WITH checks(sort, check_key, title, fixed_on) AS (
         VALUES (1,'club_card_no_card'::text,'Club Card shown, no card in force'::text,'/data-health'::text), (2,'deal_no_quickbooks'::text,'Deal with no QuickBooks link'::text,'/data-health'::text), (3,'active_no_named_contact'::text,'Active business with no named contact'::text,'/data-health'::text), (4,'stored_out_of_step'::text,'Stored status or last in touch out of step'::text,'/data-health'::text), (5,'club_card_website'::text,'Club Card members with a website problem'::text,'/club-card?show=problems'::text), (6,'club_card_pages_to_match'::text,'Club Card website pages waiting to be matched'::text,'/club-card'::text), (7,'newsletter_unclear'::text,'Unclear newsletter mentions'::text,'/newsletter?view=check'::text), (8,'qbo_customer_to_match'::text,'QuickBooks customers to match'::text,'/data-health'::text), (9,'sent_mail_to_review'::text,'Sent email to review'::text,'/data-health'::text)
        ), n AS (
         SELECT v_data_health.organization_id,
            v_data_health.check_key,
            count(*) AS n
           FROM v_data_health
          GROUP BY v_data_health.organization_id, v_data_health.check_key
        UNION ALL
         SELECT v_club_card_members.organization_id,
            'club_card_website'::text AS text,
            count(*) AS count
           FROM v_club_card_members
          WHERE (cardinality(COALESCE(v_club_card_members.issues, '{}'::text[])) > 0)
          GROUP BY v_club_card_members.organization_id
        UNION ALL
         SELECT club_card_pages.organization_id,
            'club_card_pages_to_match'::text AS text,
            count(*) AS count
           FROM club_card_pages
          WHERE ((club_card_pages.gone_at IS NULL) AND (club_card_pages.match_status = ANY (ARRAY['unmatched'::text, 'suggested'::text])))
          GROUP BY club_card_pages.organization_id
        UNION ALL
         SELECT newsletter_mentions.organization_id,
            'newsletter_unclear'::text AS text,
            count(*) AS count
           FROM newsletter_mentions
          WHERE (newsletter_mentions.status = 'unclear'::text)
          GROUP BY newsletter_mentions.organization_id
        )
 SELECT o.id AS organization_id,
    k.sort,
    k.check_key,
    k.title,
    k.fixed_on,
    (COALESCE(n.n, (0)::bigint))::integer AS n
   FROM ((organizations o
     CROSS JOIN checks k)
     LEFT JOIN n ON (((n.organization_id = o.id) AND (n.check_key = k.check_key))));
GRANT SELECT ON public.v_data_health, public.v_data_health_counts TO authenticated, service_role;


-- 7. system_alarm(): sent email sweep line
CREATE OR REPLACE FUNCTION public.system_alarm(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(job_key text, label text, kind text, schedule text, due_at timestamp with time zone, last_ok_at timestamp with time zone, last_run_at timestamp with time zone, last_error text, missed boolean, missed_days date[], line text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  WITH jobs AS (
    -- pg_cron jobs
    SELECT 'cron:' || j.jobname AS job_key,
           initcap(replace(j.jobname, '-', ' ')) || ' (database, ' || to_char(make_time(split_part(j.schedule, ' ', 2)::int, split_part(j.schedule, ' ', 1)::int, 0), 'HH24:MI') || ' UTC)' AS label,
           'database' AS kind, j.schedule,
           CASE WHEN split_part(j.schedule, ' ', 5) = '*' THEN ARRAY[1,2,3,4,5,6,7]
                ELSE (SELECT array_agg(CASE WHEN x::int = 0 THEN 7 ELSE x::int END) FROM unnest(string_to_array(split_part(j.schedule, ' ', 5), ',')) x) END AS days,
           make_time(split_part(j.schedule, ' ', 2)::int, split_part(j.schedule, ' ', 1)::int, 0) + interval '30 minutes' AS due_time,
           (SELECT max(d.end_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.status = 'succeeded' AND d.start_time <= p_now) AS last_ok,
           (SELECT max(d.start_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.start_time <= p_now) AS last_run,
           (SELECT d.return_message FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.start_time <= p_now
              ORDER BY d.start_time DESC LIMIT 1) AS last_msg,
           (SELECT d.status FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.start_time <= p_now
              ORDER BY d.start_time DESC LIMIT 1) AS last_status,
           ARRAY(SELECT DISTINCT (d.start_time AT TIME ZONE 'UTC')::date FROM cron.job_run_details d
                 WHERE d.jobid = j.jobid AND d.status = 'succeeded' AND d.start_time <= p_now AND d.start_time > p_now - interval '16 days') AS ok_days
    FROM cron.job j
    WHERE j.active AND j.schedule ~ '^\d+ \d+ \* \* [\d,*]+$'
    UNION ALL
    SELECT 'vercel:club_card_read', 'Club Card read (nightly)', 'app', '30 2 * * *', ARRAY[1,2,3,4,5,6,7], time '03:30',
           (SELECT max(r.ran_at) FROM club_card_sync_runs r WHERE r.ok AND r.ran_at <= p_now),
           (SELECT max(r.ran_at) FROM club_card_sync_runs r WHERE r.ran_at <= p_now),
           (SELECT r.error FROM club_card_sync_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           (SELECT CASE WHEN r.ok THEN 'succeeded' ELSE 'failed' END FROM club_card_sync_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           ARRAY(SELECT DISTINCT (r.ran_at AT TIME ZONE 'UTC')::date FROM club_card_sync_runs r WHERE r.ok AND r.ran_at <= p_now AND r.ran_at > p_now - interval '16 days')
    UNION ALL
    SELECT 'vercel:newsletter_read', 'Newsletter read (Wednesdays)', 'app', '0 12 * * 3', ARRAY[3], time '13:00',
           (SELECT max(r.ran_at) FROM newsletter_read_runs r WHERE r.ok AND r.ran_at <= p_now),
           (SELECT max(r.ran_at) FROM newsletter_read_runs r WHERE r.ran_at <= p_now),
           (SELECT r.error FROM newsletter_read_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           (SELECT CASE WHEN r.ok THEN 'succeeded' ELSE 'failed' END FROM newsletter_read_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           ARRAY(SELECT DISTINCT (r.ran_at AT TIME ZONE 'UTC')::date FROM newsletter_read_runs r WHERE r.ok AND r.ran_at <= p_now AND r.ran_at > p_now - interval '16 days')
    UNION ALL
    SELECT 'vercel:listings_read', 'What''s On listings read (nightly)', 'app', '40 2 * * *', ARRAY[1,2,3,4,5,6,7], time '03:40',
           (SELECT max(r.ran_at) FROM listing_sync_runs r WHERE r.ok AND r.ran_at <= p_now),
           (SELECT max(r.ran_at) FROM listing_sync_runs r WHERE r.ran_at <= p_now),
           (SELECT r.error FROM listing_sync_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           (SELECT CASE WHEN r.ok THEN 'succeeded' ELSE 'failed' END FROM listing_sync_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           ARRAY(SELECT DISTINCT (r.ran_at AT TIME ZONE 'UTC')::date FROM listing_sync_runs r WHERE r.ok AND r.ran_at <= p_now AND r.ran_at > p_now - interval '16 days')
    UNION ALL
    SELECT 'vercel:companies_house_read', 'Companies House read (Mondays)', 'app', '30 5 * * 1', ARRAY[1], time '06:30',
           (SELECT max(s.run_at) FROM scraper_logs s WHERE 'Companies House' = ANY (s.sources_checked)
              AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(s.errors) = 'array' THEN s.errors END), 0) = 0 AND s.run_at <= p_now),
           (SELECT max(s.run_at) FROM scraper_logs s WHERE 'Companies House' = ANY (s.sources_checked) AND s.run_at <= p_now),
           (SELECT s.errors::text FROM scraper_logs s WHERE 'Companies House' = ANY (s.sources_checked) AND s.run_at <= p_now ORDER BY s.run_at DESC LIMIT 1),
           NULL,
           ARRAY(SELECT DISTINCT (s.run_at AT TIME ZONE 'UTC')::date FROM scraper_logs s WHERE 'Companies House' = ANY (s.sources_checked)
                 AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(s.errors) = 'array' THEN s.errors END), 0) = 0
                 AND s.run_at <= p_now AND s.run_at > p_now - interval '16 days')
    UNION ALL
    SELECT 'routine:' || s.routine,
           CASE s.routine WHEN 'desk_email' THEN 'Morning desk email' WHEN 'daily_desk' THEN 'Daily desk routine'
                WHEN 'member_care' THEN 'Member care routine' WHEN 'outreach' THEN 'Outreach routine' ELSE s.label END,
           CASE WHEN s.routine = 'desk_email' THEN 'app' ELSE 'routine' END,
           CASE WHEN s.iso_days = ARRAY[1,2,3,4,5] THEN 'weekdays' WHEN cardinality(s.iso_days) = 7 THEN 'daily' ELSE s.iso_days::text END,
           s.iso_days,
           CASE WHEN s.routine = 'desk_email' THEN time '09:00' ELSE time '10:30' END,
           (SELECT max(h.finished_at) FROM routine_heartbeat h WHERE h.routine = s.routine AND h.finished_at <= p_now),
           (SELECT max(h.finished_at) FROM routine_heartbeat h WHERE h.routine = s.routine AND h.finished_at <= p_now),
           NULL, NULL,
           ARRAY(SELECT DISTINCT h.ran_on FROM routine_heartbeat h WHERE h.routine = s.routine AND h.finished_at <= p_now AND h.finished_at > p_now - interval '16 days')
    FROM routine_schedule s
    WHERE s.enabled
  ),
  -- Each time a job was due in the last 14 days. One is good if a good run happened on its UTC
  -- day or later, before the next time it was due (so a weekly read caught up a day late counts).
  due_times AS (
    SELECT j.job_key, (((p_now AT TIME ZONE 'UTC')::date - g) + j.due_time) AT TIME ZONE 'UTC' AS due,
           ((p_now AT TIME ZONE 'UTC')::date - g) AS day
    FROM jobs j, generate_series(0, 13) g
    WHERE extract(isodow FROM ((p_now AT TIME ZONE 'UTC')::date - g))::int = ANY (j.days)
      AND ((((p_now AT TIME ZONE 'UTC')::date - g) + j.due_time) AT TIME ZONE 'UTC') <= p_now
  ),
  judged_times AS (
    -- next_day: the next scheduled day, whether or not it has come yet
    SELECT t.*, (SELECT min(t.day + k) FROM jobs j, generate_series(1, 7) k
                 WHERE j.job_key = t.job_key AND extract(isodow FROM t.day + k)::int = ANY (j.days)) AS next_day,
           row_number() OVER (PARTITION BY t.job_key ORDER BY t.day DESC) AS nth
    FROM due_times t
  ),
  misses AS (
    SELECT t.job_key, t.day, t.due, t.nth,
           NOT EXISTS (SELECT 1 FROM jobs j, unnest(j.ok_days) x
                       WHERE j.job_key = t.job_key AND x >= t.day AND x < t.next_day) AS missed
    FROM judged_times t
  ),
  -- Shown: every miss in the last 30 hours (so the morning after hears of it even if the job has
  -- since run), and, while the latest due time is still unmet, the whole run of misses back to
  -- the last good run.
  shown AS (
    SELECT m.job_key, m.day FROM misses m
    WHERE m.missed AND (m.due > p_now - interval '30 hours'
      OR NOT EXISTS (SELECT 1 FROM misses n WHERE n.job_key = m.job_key AND n.day > m.day AND NOT n.missed)
         AND EXISTS (SELECT 1 FROM misses n WHERE n.job_key = m.job_key AND n.nth = 1 AND n.missed))
  ),
  flagged AS (
    SELECT j.*, (SELECT max(t.due) FROM due_times t WHERE t.job_key = j.job_key) AS due,
           ARRAY(SELECT s.day FROM shown s WHERE s.job_key = j.job_key ORDER BY s.day) AS miss_days
    FROM jobs j
  ),
  flagged2 AS (
    SELECT f.*, cardinality(f.miss_days) > 0 AS is_missed FROM flagged f
  )
  SELECT * FROM (
  SELECT f.job_key, f.label, f.kind, f.schedule, f.due, f.last_ok, f.last_run,
         CASE WHEN f.last_status = 'failed' THEN left(f.last_msg, 300) END,
         f.is_missed,
         CASE WHEN f.is_missed THEN f.miss_days ELSE ARRAY[]::date[] END,
         CASE WHEN NOT f.is_missed THEN NULL ELSE
           f.label || ' did not run on ' ||
           (SELECT string_agg(to_char(x, 'Dy FMDD Mon'), ', ' ORDER BY x) FROM unnest(f.miss_days[1:4]) x) ||
           CASE WHEN cardinality(f.miss_days) > 4 THEN ' and ' || (cardinality(f.miss_days) - 4) || ' more days' ELSE '' END ||
           CASE WHEN f.last_ok IS NULL THEN ' (no good run on record)'
                WHEN (f.last_ok AT TIME ZONE 'UTC')::date > f.miss_days[cardinality(f.miss_days)] THEN ' (it has run since, ' || to_char(f.last_ok AT TIME ZONE 'Europe/London', 'Dy FMDD Mon HH24:MI') || ')'
                ELSE ' (last good run ' || to_char(f.last_ok AT TIME ZONE 'Europe/London', 'Dy FMDD Mon HH24:MI') || ')' END ||
           CASE WHEN f.last_status = 'failed' THEN '; its last try failed' ELSE '' END
         END
  FROM flagged2 f
  UNION ALL
  -- QuickBooks copy: the daily desk routine rewrites every invoice row's synced_at on each weekday run, so
  -- the newest synced_at is the last good run. Missed when it is over 2 days old and a weekday run
  -- (due 10:30 London) has gone by since.
  SELECT 'routine:quickbooks_copy', 'QuickBooks copy (daily desk routine)', 'routine', 'weekdays', q.due, q.last_sync, q.last_sync,
         NULL::text, q.is_missed,
         CASE WHEN q.is_missed THEN ARRAY[q.expected_day] ELSE ARRAY[]::date[] END,
         CASE WHEN q.is_missed THEN
           'QuickBooks copy in the app is out of date: last updated ' || coalesce(to_char(q.last_sync AT TIME ZONE 'Europe/London', 'Dy FMDD Mon HH24:MI'), 'never') ||
           '; the daily desk routine should have refreshed it on ' || to_char(q.expected_day, 'Dy FMDD Mon')
         END
  FROM (
    SELECT s.last_sync, s.expected_day,
           (s.expected_day::timestamp + time '10:30') AT TIME ZONE 'Europe/London' AS due,
           (s.last_sync IS NULL OR (p_now - s.last_sync > interval '2 days' AND (s.last_sync AT TIME ZONE 'Europe/London')::date < s.expected_day)) AS is_missed
    FROM (
      SELECT (SELECT max(i.synced_at) FROM qbo_invoices i WHERE i.synced_at <= p_now) AS last_sync,
             (SELECT d::date FROM generate_series(((p_now AT TIME ZONE 'Europe/London')::date - 7)::timestamp, (p_now AT TIME ZONE 'Europe/London')::date::timestamp, interval '1 day') d
               WHERE extract(isodow FROM d)::int <= 5
                 AND (d + time '10:30') AT TIME ZONE 'Europe/London' <= p_now
               ORDER BY d DESC LIMIT 1) AS expected_day
    ) s
  ) q
  UNION ALL
  -- Sent email sweep: the daily desk routine files sent mail from tom@ and info@ through file_sent_mail()
  -- on each weekday run and records every hand-over in sent_mail_runs. Missed when the newest run is over 2 days old
  -- and a weekday run (due 10:30 London) has gone by since.
  SELECT 'routine:sent_mail_sweep', 'Sent email sweep (daily desk routine)', 'routine', 'weekdays', q.due, q.last_scan, q.last_scan,
         NULL::text, q.is_missed,
         CASE WHEN q.is_missed THEN ARRAY[q.expected_day] ELSE ARRAY[]::date[] END,
         CASE WHEN q.is_missed THEN
           'Sent email has not been read: last sweep ' || coalesce(to_char(q.last_scan AT TIME ZONE 'Europe/London', 'Dy FMDD Mon HH24:MI'), 'never') ||
           '; the daily desk routine should have swept tom@ and info@ on ' || to_char(q.expected_day, 'Dy FMDD Mon')
         END
  FROM (
    SELECT s.last_scan, s.expected_day,
           (s.expected_day::timestamp + time '10:30') AT TIME ZONE 'Europe/London' AS due,
           (s.last_scan IS NULL OR (p_now - s.last_scan > interval '2 days' AND (s.last_scan AT TIME ZONE 'Europe/London')::date < s.expected_day)) AS is_missed
    FROM (
      SELECT (SELECT max(m.ran_at) FROM sent_mail_runs m WHERE m.ran_at <= p_now) AS last_scan,
             (SELECT d::date FROM generate_series(((p_now AT TIME ZONE 'Europe/London')::date - 7)::timestamp, (p_now AT TIME ZONE 'Europe/London')::date::timestamp, interval '1 day') d
               WHERE extract(isodow FROM d)::int <= 5
                 AND (d + time '10:30') AT TIME ZONE 'Europe/London' <= p_now
               ORDER BY d DESC LIMIT 1) AS expected_day
    ) s
  ) q
  ) alarm
  ORDER BY alarm.is_missed DESC, alarm.kind, alarm.label;
END;
$function$;
