-- Stage 17a: one place for Claude (docs/ui-overhaul-plan.md, "One place for Claude (Stage 17)").
--
-- business_dossier(p_query)       everything about one business as one JSON document. Takes a
--                                 name (fuzzy, punctuation ignored) or an id; merged records
--                                 resolve to the survivor. Ambiguous names return candidates.
-- find_businesses(p_filters)      "which businesses ..." questions: filters as JSON, a capped
--                                 list of one-line rows.
-- search_correspondence(p_text, p_business, p_limit)
--                                 full-text search over emails and notes (the app's own
--                                 search_vector), optionally inside one business.
--
-- Read by the correspondence-clerk-db skill (claude.ai) and Claude Code. Read-only: STABLE,
-- SECURITY INVOKER, so RLS (own organisation) applies to signed-in users; the service role and
-- the MCP connector see everything, as they do today. No grants to anon.
-- Lists are capped so a chat can hold the result.
--
-- Deals come from contracts, never from the copies on businesses (is_club_card, contract_*,
-- deal_terms), which Stage 11b emptied. Under the cohesion rule this file is a reader: when a
-- fact's storage changes, change it here in the same go-live.

-- Name to comparable key: lower case, letters and digits only ("Archie's London" -> archieslondon).
CREATE OR REPLACE FUNCTION public.cc_name_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '', 'g') $$;

-- Follow merged_into to the surviving record (at most 10 hops).
CREATE OR REPLACE FUNCTION public.cc_business_survivor(p_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v uuid := p_id; nxt uuid; i int := 0;
BEGIN
  LOOP
    SELECT merged_into INTO nxt FROM businesses WHERE id = v;
    EXIT WHEN nxt IS NULL OR i >= 10;
    v := nxt; i := i + 1;
  END LOOP;
  RETURN v;
END $$;

-- Candidates for a name, best first, one row per surviving business.
CREATE OR REPLACE FUNCTION public.cc_business_candidates(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE (business_id uuid, name text, status text, category text, score numeric, matched_on text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH q AS (SELECT trim(p_query) AS raw, cc_name_key(p_query) AS k),
  hits AS (
    SELECT cc_business_survivor(b.id) AS sid, b.name AS hit_name,
      (CASE
         WHEN cc_name_key(b.name) = q.k THEN 1.0
         WHEN cc_name_key(b.name) LIKE q.k || '%' THEN 0.9
         WHEN length(q.k) >= 3 AND cc_name_key(b.name) LIKE '%' || q.k || '%' THEN 0.8
         ELSE round(similarity(lower(b.name), lower(q.raw))::numeric, 2)
       END
       - CASE WHEN b.merged_into IS NOT NULL THEN 0.01 ELSE 0 END
       - CASE WHEN b.status = 'Not a business' THEN 0.2 ELSE 0 END) AS score
    FROM businesses b, q
    WHERE length(q.k) >= 2
      AND (cc_name_key(b.name) LIKE '%' || q.k || '%' OR similarity(lower(b.name), lower(q.raw)) >= 0.3)
  ),
  best AS (
    SELECT DISTINCT ON (sid) sid, hit_name, score FROM hits ORDER BY sid, score DESC
  )
  SELECT s.id, s.name, s.status, s.category, best.score,
         CASE WHEN best.hit_name <> s.name THEN 'merged record "' || best.hit_name || '"' END
  FROM best JOIN v_businesses s ON s.id = best.sid
  ORDER BY best.score DESC, s.name
  LIMIT greatest(1, least(coalesce(p_limit, 10), 50));
$$;

CREATE OR REPLACE FUNCTION public.business_dossier(p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE
  bid uuid;
  cands jsonb;
  top_score numeric;
  second_score numeric;
  n_exact int;
  today date := cc_today();
  b record;
  doc jsonb;
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN
    RETURN jsonb_build_object('found', false, 'message', 'Give a business name or id');
  END IF;

  IF trim(p_query) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    bid := cc_business_survivor(trim(p_query)::uuid);
  ELSE
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.score DESC, c.name),
           max(c.score),
           count(*) FILTER (WHERE c.score >= 1.0)
      INTO cands, top_score, n_exact
      FROM cc_business_candidates(p_query, 10) c;
    IF cands IS NULL THEN
      RETURN jsonb_build_object('found', false, 'query', p_query,
        'message', 'No business matches. Try part of the name, or find_businesses(''{"q": "..."}'').');
    END IF;
    SELECT (e->>'score')::numeric INTO second_score FROM jsonb_array_elements(cands) WITH ORDINALITY x(e, i) WHERE i = 2;
    IF n_exact = 1
       OR (top_score >= 0.5 AND (second_score IS NULL OR second_score <= top_score - 0.15)) THEN
      bid := (cands->0->>'business_id')::uuid;
    ELSE
      RETURN jsonb_build_object('found', false, 'ambiguous', true, 'query', p_query,
        'message', 'Several businesses match; call again with the id of the one meant.',
        'candidates', cands);
    END IF;
  END IF;

  SELECT * INTO b FROM v_businesses WHERE id = bid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'query', p_query, 'message', 'No business with that id');
  END IF;

  doc := jsonb_build_object(
    'found', true,
    'generated_at', now(),
    'today', today,
    'app_url', 'https://correspondenceclerk.com/businesses/' || b.id,

    'business', jsonb_build_object(
      'id', b.id, 'name', b.name, 'status', b.status, 'category', b.category,
      'business_type', b.business_type, 'is_commercial', b.is_commercial,
      'website', b.website, 'address', b.address, 'email', b.email, 'phone', b.phone,
      'notes', left(b.notes, 800), 'relationship_memory', b.relationship_memory,
      'created_at', b.created_at::date, 'last_in_touch', b.last_contacted_at::date,
      'deal_state', b.deal_state, 'renewal_stage', b.renewal_stage,
      'outreach_stage', b.outreach_stage, 'attention_snoozed_until', b.attention_snoozed_until,
      'merged_from', (SELECT jsonb_agg(m.name ORDER BY m.name) FROM businesses m
                      WHERE m.merged_into IS NOT NULL AND cc_business_survivor(m.id) = b.id)),

    'deal', jsonb_build_object(
      'note', 'From contracts. Ignore businesses.is_club_card / contract_* / deal_terms (emptied 23 Oct 2026).',
      'current', (SELECT to_jsonb(x) FROM (
          SELECT c.id, c.membership_type, c.contract_start, c.contract_end, c.contract_amount, c.contract_currency,
                 c.billing_frequency, c.deal_terms, c.invoice_paid, c.qbo_invoice_id,
                 (c.contract_end - today) AS days_to_end
          FROM contracts c WHERE c.id = b.current_contract_id) x),
      'history', (SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT c.membership_type, c.contract_start, c.contract_end, c.contract_amount, c.billing_frequency,
                 c.deal_terms, c.invoice_paid, c.is_current
          FROM contracts c WHERE c.business_id = b.id
          ORDER BY c.contract_end DESC NULLS LAST, c.contract_start DESC NULLS LAST LIMIT 15) x),
      'contracts_total', (SELECT count(*) FROM contracts c WHERE c.business_id = b.id)),

    'money', (WITH inv AS (
        SELECT i.*, (i.voided_at IS NOT NULL OR coalesce(i.private_memo, '') = 'Voided') AS voided
        FROM qbo_invoices i JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
        WHERE l.business_id = b.id)
      SELECT jsonb_build_object(
        'note', 'QuickBooks copy in the app is partial (not every invoice since 2019 yet).',
        'quickbooks_customers', (SELECT jsonb_agg(jsonb_build_object('qbo_customer_id', q.qbo_customer_id,
                 'name', q.display_name, 'confirmed', l.confirmed, 'total_invoiced', q.total_invoiced,
                 'open_balance', q.open_balance, 'last_invoice_date', q.last_invoice_date))
               FROM qbo_links l LEFT JOIN qbo_customers q ON q.qbo_customer_id = l.qbo_customer_id
               WHERE l.business_id = b.id),
        'owed_total', (SELECT coalesce(sum(balance), 0) FROM inv WHERE balance > 0 AND NOT voided),
        'overdue_total', (SELECT coalesce(sum(balance), 0) FROM inv WHERE balance > 0 AND NOT voided AND due_date < today),
        'open_invoices', (SELECT jsonb_agg(jsonb_build_object('doc', coalesce(doc_number, qbo_invoice_id), 'date', txn_date,
                 'due', due_date, 'total', total_amount, 'balance', balance, 'what', left(line_description, 200))
                 ORDER BY due_date) FROM inv WHERE balance > 0 AND NOT voided),
        'recent_invoices', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('doc', coalesce(doc_number, qbo_invoice_id),
                 'date', txn_date, 'due', due_date, 'total', total_amount, 'balance', balance, 'paid', is_paid,
                 'voided', voided, 'what', left(line_description, 200)) x
                 FROM inv ORDER BY txn_date DESC NULLS LAST LIMIT 10) s),
        'do_not_chase', (SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'reason', e.reason, 'decided_by', e.decided_by,
                 'since', e.created_at::date)) FROM care_exclusions e WHERE e.business_id = b.id))),

    'contacts', jsonb_build_object(
      'main_contact_id', b.main_contact_id,
      'main_contact_chosen_by', CASE WHEN b.main_contact_is_manual THEN 'Tom' WHEN b.main_contact_id IS NOT NULL THEN 'automatic (most correspondence)' END,
      'list', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'role', c.role,
                 'emails', c.emails, 'phones', c.phones, 'is_main', c.id = b.main_contact_id,
                 'is_active', c.is_active, 'name_is_placeholder', c.name_is_placeholder, 'notes', left(c.notes, 300)) x
               FROM contacts c WHERE c.business_id = b.id
               ORDER BY (c.id = b.main_contact_id) DESC, c.is_active DESC NULLS LAST, c.name LIMIT 25) s),
      'total', (SELECT count(*) FROM contacts c WHERE c.business_id = b.id)),

    'attention', (SELECT jsonb_build_object('reason', a.reason, 'detail', a.detail, 'since', a.since,
                   'is_overdue', a.is_overdue, 'all_reasons', a.reasons, 'amount_owed', a.amount_owed,
                   'emails_waiting', a.emails_waiting, 'todos_due', a.todos_due, 'is_snoozed', a.is_snoozed,
                   'club_card_issues', a.club_card_issues)
                  FROM v_business_attention a WHERE a.business_id = b.id LIMIT 1),

    'correspondence', (WITH c AS (
        SELECT c.* FROM correspondence c
        WHERE c.business_id = b.id OR b.id = ANY (coalesce(c.linked_business_ids, '{}'::uuid[])))
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM c),
        'first_date', (SELECT min(entry_date)::date FROM c),
        'last_received', (SELECT max(entry_date)::date FROM c WHERE direction = 'received'),
        'last_sent', (SELECT max(entry_date)::date FROM c WHERE direction = 'sent'),
        'note', 'Newest first; text is the cleaned version, cut to 700 characters. Use search_correspondence for older or specific items.',
        'recent', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('id', c.id, 'date', c.entry_date::date,
                     'type', c.type, 'direction', c.direction, 'subject', c.subject,
                     'contact', (SELECT k.name FROM contacts k WHERE k.id = c.contact_id),
                     'from_internal', c.internal_sender, 'action', NULLIF(c.action_needed::text, 'none'),
                     'due', c.due_at::date, 'intent', c.intent, 'linked_from_other_business', c.business_id <> b.id,
                     'text', left(coalesce(c.formatted_text_current, c.formatted_text_original, c.raw_text_original), 700)) x
                   FROM c WHERE c.type::text NOT IN ('Note') ORDER BY c.entry_date DESC NULLS LAST LIMIT 20) s),
        'notes', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('date', c.entry_date::date, 'subject', c.subject,
                     'text', left(coalesce(c.formatted_text_current, c.formatted_text_original, c.raw_text_original), 700)) x
                   FROM c WHERE c.type::text = 'Note' ORDER BY c.entry_date DESC NULLS LAST LIMIT 10) s))),

    'todos', jsonb_build_object(
      'note', 'Hand-written to-dos (source manual) show in the app; system tasks feed the desk email and routines.',
      'open', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('title', t.title, 'due', t.due_date, 'time', t.due_time,
                 'source', t.source, 'type', t.type, 'notes', left(t.notes, 300), 'overdue', t.due_date < today) x
               FROM tasks t WHERE t.business_id = b.id AND t.status = 'open'
               ORDER BY (t.source = 'manual') DESC, t.due_date NULLS LAST LIMIT 15) s),
      'recently_done', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('title', t.title, 'done', t.completed_at::date,
                 'source', t.source) x
               FROM tasks t WHERE t.business_id = b.id AND t.status <> 'open' AND t.completed_at IS NOT NULL
               ORDER BY t.completed_at DESC LIMIT 5) s)),

    'calendar', (SELECT jsonb_agg(x ORDER BY x->>'date') FROM (
        SELECT jsonb_build_object('date', t.due_date, 'kind', 'to-do', 'what', t.title) x
          FROM tasks t WHERE t.business_id = b.id AND t.status = 'open' AND t.source = 'manual'
           AND t.due_date BETWEEN today - 7 AND today + 90
        UNION ALL
        SELECT jsonb_build_object('date', c.contract_end, 'kind', 'deal ends', 'what', c.membership_type)
          FROM contracts c WHERE c.business_id = b.id AND c.contract_end BETWEEN today - 7 AND today + 90
        UNION ALL
        SELECT jsonb_build_object('date', i.due_date, 'kind', 'invoice due', 'what', coalesce(i.doc_number, i.qbo_invoice_id) || ' £' || i.balance)
          FROM qbo_invoices i JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
          WHERE l.business_id = b.id AND i.balance > 0 AND i.voided_at IS NULL AND coalesce(i.private_memo, '') <> 'Voided'
           AND i.due_date BETWEEN today - 7 AND today + 90
        LIMIT 20) s),

    'club_card', jsonb_build_object(
      'member', (SELECT jsonb_build_object('card_state', m.card_state, 'contract_start', m.contract_start,
                   'contract_end', m.contract_end, 'page', m.page_link, 'page_title', m.page_title,
                   'offer', left(m.offer_text, 400), 'offer_ends', m.offer_ends, 'offer_confirmed_at', m.offer_confirmed_at::date,
                   'page_updated', m.wp_modified::date, 'in_a_to_z', m.in_az_count, 'on_map', m.map_count,
                   'in_latest_offers', m.in_latest_offers, 'categories_on_website', m.categories,
                   'category_differs', m.category_differs, 'contact_mismatch', m.contact_mismatch, 'checks', m.issues)
                 FROM v_club_card_members m WHERE m.business_id = b.id LIMIT 1),
      'pages', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('link', p.link, 'title', p.title,
                   'offer', left(p.offer_text, 300), 'offer_ends', coalesce(p.offer_ends_set, p.offer_ends_on),
                   'updated', p.wp_modified::date, 'gone_at', p.gone_at::date, 'match_status', p.match_status) x
                 FROM club_card_pages p WHERE p.business_id = b.id ORDER BY p.gone_at NULLS FIRST, p.wp_modified DESC LIMIT 5) s)),

    'newsletter', jsonb_build_object(
      'summary', (SELECT jsonb_build_object('last_featured', n.last_in_newsletter, 'last_issue_url', n.last_issue_url,
                    'mentions_total', n.mentions_total, 'mentions_last_12_months', n.mentions_last_12_months)
                  FROM v_business_newsletter n WHERE n.business_id = b.id),
      'recent_mentions', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('sent', i.sent_at::date, 'issue', i.subject,
                    'url', i.browser_url, 'status', m.status, 'context', left(m.context, 300)) x
                  FROM newsletter_mentions m JOIN newsletter_issues i ON i.id = m.issue_id
                  WHERE m.business_id = b.id AND coalesce(m.status, '') <> 'rejected'
                  ORDER BY i.sent_at DESC LIMIT 10) s)),

    'news_articles', jsonb_build_object(
      'total', (SELECT count(*) FROM business_articles a WHERE a.business_id = b.id AND coalesce(a.status, '') <> 'rejected'),
      'recent', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('date', a.published_date, 'title', a.title,
                   'url', a.url, 'status', a.status) x
                 FROM business_articles a WHERE a.business_id = b.id AND coalesce(a.status, '') <> 'rejected'
                 ORDER BY a.published_date DESC NULLS LAST LIMIT 10) s)),

    'outreach', jsonb_build_object(
      'stage', b.outreach_stage,
      'work_on_next', (SELECT jsonb_build_object('bucket', o.bucket, 'fit_score', o.fit_score, 'days_quiet', o.days_quiet,
                         'last_direction', o.last_direction, 'last_email_on', o.last_email_on, 'draft_ready', o.draft_ready,
                         'snoozed_until', o.snoozed_until)
                       FROM v_outreach_next o WHERE o.business_id = b.id LIMIT 1),
      'routine_drafts', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('created', d.created_at::date, 'routine', d.routine,
                         'kind', d.kind, 'subject', d.subject, 'to', d.recipient, 'outcome', d.outcome, 'reason', left(d.reason, 200),
                         'sent', d.sent_at::date, 'replied', d.replied_at::date) x
                       FROM routine_drafts d WHERE d.business_id = b.id ORDER BY d.created_at DESC LIMIT 10) s),
      'prospect_leads', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('found', l.found_at::date, 'source', l.source_name,
                         'url', l.source_url, 'match_type', l.match_type, 'status', l.status,
                         'notes', left(l.opportunity_notes, 300)) x
                       FROM prospect_leads l WHERE l.matched_business_id = b.id ORDER BY l.found_at DESC LIMIT 5) s)),

    'data_health', (SELECT jsonb_agg(jsonb_build_object('check', h.check_key, 'detail', h.detail, 'date', h.ref_date))
                    FROM v_data_health h WHERE h.business_id = b.id)
  );
  RETURN jsonb_strip_nulls(doc);
END $$;

-- "Which businesses ..." questions. Every filter is optional; combine freely.
--   q                 text   part of the name (punctuation ignored)
--   status            text or array  Active / Former / Prospect / Unreviewed
--   category          text   e.g. "Food & Drink"
--   deal              text   club_card (member or grace, as the Club Card tab) / advertiser / ...:
--                            a contract of that kind in force or ended within 60 days
--   card_state        text or array  member / grace / lapsed / none (v_club_card_members)
--   ends_from, ends_to  date  a deal (of `deal`'s kind, if given) ends in this range ("renewing next month")
--   renewal_stage, outreach_stage, bucket (v_outreach_next)  text
--   attention         text   reason from v_business_attention (money_owed, renewal, reply, todo, ...)
--   owes_money        bool   open QuickBooks balance (not voided)
--   quiet_days        int    nothing in or out for at least this many days
--   featured_since    date   in the newsletter on or after this date
--   email_text        text   appears in their emails or notes (web-search syntax)
--   include_hidden    bool   include Not a business and merged records (default false)
--   order             text   name (default) / ends / last_in_touch / owed
--   limit             int    default 50, at most 200
CREATE OR REPLACE FUNCTION public.find_businesses(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH f AS (SELECT coalesce(p_filters, '{}'::jsonb) AS j),
  arr AS (
    SELECT
      CASE jsonb_typeof(j->'status') WHEN 'array' THEN ARRAY(SELECT lower(jsonb_array_elements_text(j->'status')))
           WHEN 'string' THEN ARRAY[lower(j->>'status')] END AS statuses,
      CASE jsonb_typeof(j->'card_state') WHEN 'array' THEN ARRAY(SELECT lower(jsonb_array_elements_text(j->'card_state')))
           WHEN 'string' THEN ARRAY[lower(j->>'card_state')] END AS card_states
    FROM f),
  owed AS (
    SELECT l.business_id, sum(i.balance) AS owed
    FROM qbo_invoices i JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
    WHERE i.balance > 0 AND i.voided_at IS NULL AND coalesce(i.private_memo, '') <> 'Voided'
    GROUP BY l.business_id),
  -- Each view is worked out once and hash-joined (joined inline, the planner re-ran them per row).
  vb AS MATERIALIZED (SELECT id, name, status, category, renewal_stage, outreach_stage, last_contacted_at,
                             merged_into, current_contract_id, main_contact_id FROM v_businesses),
  att AS MATERIALIZED (SELECT business_id, reason, detail, reasons FROM v_business_attention),
  onx AS MATERIALIZED (SELECT business_id, bucket FROM v_outreach_next),
  ccm AS MATERIALIZED (SELECT business_id, card_state FROM v_club_card_members),
  nl AS MATERIALIZED (SELECT business_id, last_in_newsletter FROM v_business_newsletter),
  rows AS (
    SELECT v.id, v.name, v.status, v.category, c.membership_type AS deal, c.contract_end AS deal_ends,
           (SELECT jsonb_agg(jsonb_build_object('type', d.membership_type, 'start', d.contract_start, 'end', d.contract_end,
                     'amount', d.contract_amount) ORDER BY d.contract_end)
              FROM contracts d WHERE d.business_id = v.id AND d.membership_type NOT LIKE 'former_%'
               AND coalesce(d.contract_start, cc_today()) <= cc_today() + 30
               AND (d.contract_end IS NULL OR d.contract_end >= cc_today() - 60)) AS deals_in_force,
           v.renewal_stage, v.outreach_stage, o.bucket, a.reason AS attention, a.detail AS attention_detail,
           ow.owed, v.last_contacted_at::date AS last_in_touch, m.card_state, n.last_in_newsletter,
           k.name AS main_contact, k.emails->>0 AS main_email
    FROM vb v
    CROSS JOIN f CROSS JOIN arr
    LEFT JOIN contracts c ON c.id = v.current_contract_id
    LEFT JOIN onx o ON o.business_id = v.id
    LEFT JOIN att a ON a.business_id = v.id
    LEFT JOIN ccm m ON m.business_id = v.id
    LEFT JOIN nl n ON n.business_id = v.id
    LEFT JOIN owed ow ON ow.business_id = v.id
    LEFT JOIN contacts k ON k.id = v.main_contact_id
    WHERE (coalesce((f.j->>'include_hidden')::boolean, false)
           OR (v.merged_into IS NULL AND coalesce(v.status, '') <> 'Not a business'))
      AND (f.j->>'q' IS NULL OR cc_name_key(v.name) LIKE '%' || cc_name_key(f.j->>'q') || '%')
      AND (arr.statuses IS NULL OR lower(v.status) = ANY (arr.statuses))
      AND (f.j->>'category' IS NULL OR lower(v.category) = lower(f.j->>'category'))
      AND (f.j->>'deal' IS NULL
           OR (f.j->>'deal' = 'club_card' AND m.card_state IN ('member', 'grace'))
           OR (f.j->>'deal' <> 'club_card' AND EXISTS (
                SELECT 1 FROM contracts d WHERE d.business_id = v.id AND d.membership_type = f.j->>'deal'
                  AND coalesce(d.contract_start, cc_today()) <= cc_today()
                  AND (d.contract_end IS NULL OR d.contract_end >= cc_today() - 60))))
      AND (arr.card_states IS NULL OR lower(coalesce(m.card_state, 'none')) = ANY (arr.card_states))
      AND ((f.j->>'ends_from' IS NULL AND f.j->>'ends_to' IS NULL) OR EXISTS (
           SELECT 1 FROM contracts e WHERE e.business_id = v.id AND e.membership_type NOT LIKE 'former_%'
             AND (f.j->>'deal' IS NULL OR e.membership_type = f.j->>'deal')
             AND (f.j->>'ends_from' IS NULL OR e.contract_end >= (f.j->>'ends_from')::date)
             AND (f.j->>'ends_to' IS NULL OR e.contract_end <= (f.j->>'ends_to')::date)
             -- already renewed: a later term of the same kind exists
             AND NOT EXISTS (SELECT 1 FROM contracts n WHERE n.business_id = e.business_id
                               AND n.membership_type = e.membership_type AND n.contract_start > e.contract_start)))
      AND (f.j->>'renewal_stage' IS NULL OR v.renewal_stage = f.j->>'renewal_stage')
      AND (f.j->>'outreach_stage' IS NULL OR v.outreach_stage = f.j->>'outreach_stage')
      AND (f.j->>'bucket' IS NULL OR o.bucket = f.j->>'bucket')
      AND (f.j->>'attention' IS NULL OR f.j->>'attention' = ANY (a.reasons) OR a.reason = f.j->>'attention')
      AND (f.j->>'owes_money' IS NULL OR (coalesce(ow.owed, 0) > 0) = (f.j->>'owes_money')::boolean)
      AND (f.j->>'quiet_days' IS NULL OR v.last_contacted_at IS NULL
           OR v.last_contacted_at < now() - make_interval(days => (f.j->>'quiet_days')::int))
      AND (f.j->>'featured_since' IS NULL OR n.last_in_newsletter >= (f.j->>'featured_since')::date)
      AND (f.j->>'email_text' IS NULL OR EXISTS (
           SELECT 1 FROM correspondence x
           WHERE (x.business_id = v.id OR v.id = ANY (coalesce(x.linked_business_ids, '{}'::uuid[])))
             AND x.search_vector @@ websearch_to_tsquery('english', f.j->>'email_text')))
  ),
  lim AS (SELECT greatest(1, least(coalesce((j->>'limit')::int, 50), 200)) AS n, coalesce(j->>'order', 'name') AS ord FROM f)
  SELECT jsonb_build_object(
    'filters', (SELECT j FROM f),
    'total', (SELECT count(*) FROM rows),
    'shown', least((SELECT count(*) FROM rows), (SELECT n FROM lim)),
    'note', 'deal/deal_ends = the current contract; deals_in_force lists every deal running (a business can hold a Club Card and an advert). Call business_dossier(id) for any one of them.',
    'businesses', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(r))) FROM (
        SELECT rows.* FROM rows, lim
        ORDER BY CASE lim.ord WHEN 'ends' THEN rows.deal_ends END ASC NULLS LAST,
                 CASE lim.ord WHEN 'last_in_touch' THEN rows.last_in_touch END DESC NULLS LAST,
                 CASE lim.ord WHEN 'owed' THEN rows.owed END DESC NULLS LAST,
                 rows.name
        LIMIT (SELECT n FROM lim)) r), '[]'::jsonb));
$$;

-- Full-text search over emails and notes (same index as the app's search).
CREATE OR REPLACE FUNCTION public.search_correspondence(p_text text, p_business text DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE
  bid uuid;
  d jsonb;
  tsq tsquery := websearch_to_tsquery('english', coalesce(p_text, ''));
BEGIN
  IF p_business IS NOT NULL THEN
    d := business_dossier(p_business);
    IF NOT coalesce((d->>'found')::boolean, false) THEN
      RETURN jsonb_build_object('found', false, 'business', p_business, 'candidates', d->'candidates', 'message', d->>'message');
    END IF;
    bid := (d->'business'->>'id')::uuid;
  END IF;
  RETURN jsonb_build_object(
    'query', p_text, 'business', p_business,
    'results', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', c.id, 'date', c.entry_date::date, 'business', bz.name, 'business_id', c.business_id,
               'type', c.type, 'direction', c.direction, 'subject', c.subject,
               'contact', (SELECT k.name FROM contacts k WHERE k.id = c.contact_id), 'from_internal', c.internal_sender,
               'text', left(coalesce(c.formatted_text_current, c.formatted_text_original, c.raw_text_original), 900)) x
      FROM correspondence c JOIN businesses bz ON bz.id = c.business_id
      WHERE c.search_vector @@ tsq
        AND (bid IS NULL OR c.business_id = bid OR bid = ANY (coalesce(c.linked_business_ids, '{}'::uuid[])))
      ORDER BY c.entry_date DESC NULLS LAST
      LIMIT greatest(1, least(coalesce(p_limit, 20), 50))) s), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.cc_name_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cc_business_survivor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cc_business_candidates(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_dossier(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_businesses(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_correspondence(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cc_name_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_business_survivor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_business_candidates(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_dossier(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_businesses(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_correspondence(text, text, int) TO authenticated, service_role;
