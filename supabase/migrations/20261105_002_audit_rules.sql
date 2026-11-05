-- Audit 5 Nov 2026 (H2, L1, M2, Tom's QuickBooks decision). Built from the live definitions.
-- 1. v_businesses: QuickBooks emails (source quickbooks_notice) no longer count as last in touch
--    (Tom: "quickbooks emails shouldnt count as last in touch, but should be noted and understood").
-- 2. business_dossier: same rule for last_received / last_sent; QuickBooks emails stay in the list,
--    flagged quickbooks_notice, with a note saying why.
-- 3. file_sent_mail: refreshes stored truth when it files mail (it runs after the 02:05 refresh).
-- 4. find_businesses: deal filter for advertisers follows v_businesses.deal_state (in force or grace).
-- 5. Data health check contract_not_current: a Club Card or advertising deal running today that is
--    not marked current while no current deal covers today (TARANTELLA on 5 Nov).
CREATE OR REPLACE VIEW public.v_businesses WITH (security_invoker = true) AS
 WITH today AS (
         SELECT cc_today() AS d
        ), terms AS (
         SELECT c.id,
            c.business_id,
            c.organization_id,
            c.membership_type,
            c.contract_start,
            c.contract_end,
            c.contract_amount,
            c.contract_currency,
            c.deal_terms,
            c.invoice_paid,
            c.is_current,
            c.created_at,
            c.updated_at,
            c.billing_frequency,
            c.qbo_invoice_id,
            c.membership_type IS NOT NULL AND c.membership_type !~~ 'former\_%'::text AND (c.is_current AND COALESCE(c.contract_end, 'infinity'::date) >= today.d OR COALESCE(c.contract_start, '-infinity'::date) <= today.d AND c.contract_end >= today.d) AS in_force,
            c.membership_type IS NOT NULL AND c.membership_type !~~ 'former\_%'::text AND c.contract_end >= (today.d - 60) AND c.contract_end <= (today.d - 1) AS recently_ended
           FROM contracts c
             CROSS JOIN today
        ), deals AS (
         SELECT t_1.business_id,
            bool_or(t_1.in_force) AS in_force,
            bool_or(t_1.recently_ended) AS recently_ended,
            bool_or(t_1.is_current AND t_1.membership_type = 'club_card'::text) AS is_club_card,
            bool_or(t_1.is_current AND t_1.membership_type = 'advertiser'::text) AS is_advertiser,
            (array_agg(t_1.membership_type ORDER BY t_1.contract_end DESC NULLS LAST, t_1.created_at DESC) FILTER (WHERE t_1.membership_type IS NOT NULL))[1] AS last_type
           FROM terms t_1
          GROUP BY t_1.business_id
        ), cur AS (
         SELECT DISTINCT ON (c.business_id) c.business_id,
            c.id,
            c.membership_type,
            c.contract_start,
            c.contract_end,
            c.contract_amount,
            c.contract_currency,
            c.deal_terms
           FROM contracts c
          WHERE c.is_current
          ORDER BY c.business_id, c.contract_start DESC NULLS LAST, c.created_at DESC
        ), touch AS (
         SELECT x.business_id,
            max(x.entry_date) AS last_at
           FROM ( SELECT r.business_id,
                    r.entry_date
                   FROM correspondence r
                  WHERE r.entry_date IS NOT NULL AND r.type IS DISTINCT FROM 'Draft'::entry_type AND NOT COALESCE(r.ai_metadata ? 'qbo_invoice_id'::text, false) AND COALESCE(r.ai_metadata ->> 'source'::text, ''::text) <> 'quickbooks_notice'::text
                UNION ALL
                 SELECT l.business_id,
                    r.entry_date
                   FROM correspondence r
                     CROSS JOIN LATERAL unnest(r.linked_business_ids) l(business_id)
                  WHERE r.entry_date IS NOT NULL AND r.type IS DISTINCT FROM 'Draft'::entry_type AND NOT COALESCE(r.ai_metadata ? 'qbo_invoice_id'::text, false) AND COALESCE(r.ai_metadata ->> 'source'::text, ''::text) <> 'quickbooks_notice'::text) x
          GROUP BY x.business_id
        ), main AS (
         SELECT DISTINCT ON (k.business_id) k.business_id,
            k.id,
            k.is_primary
           FROM contacts k
             LEFT JOIN ( SELECT r.contact_id,
                    count(*) AS n
                   FROM correspondence r
                  WHERE r.contact_id IS NOT NULL
                  GROUP BY r.contact_id) kc ON kc.contact_id = k.id
          WHERE k.is_primary OR k.is_active AND NOT k.name_is_placeholder
          ORDER BY k.business_id, k.is_primary DESC, (COALESCE(kc.n, 0::bigint)) DESC, k.created_at
        )
 SELECT b.id,
    b.name,
    b.normalized_name,
    b.category,
    cc_business_status(b.status, b.merged_into IS NOT NULL, t.is_commercial, h.had_deal, COALESCE(d.in_force, false) OR COALESCE(d.recently_ended, false) AND COALESCE(b.renewal_stage, ''::text) <> 'not_renewing'::text) AS status,
    COALESCE(d.is_club_card, false) AS is_club_card,
    COALESCE(d.is_advertiser, false) AS is_advertiser,
    touch.last_at AS last_contacted_at,
    b.mastersheet_source_ids,
    b.created_at,
    b.updated_at,
    cur.contract_start,
    cur.contract_end,
    cur.deal_terms,
    b.payment_structure,
    cur.contract_amount,
    b.address,
    b.email,
    b.phone,
    b.organization_id,
    cur.contract_currency::character varying(3) AS contract_currency,
    b.notes,
        CASE
            WHEN cur.id IS NOT NULL THEN cur.membership_type
            WHEN d.last_type ~~ 'former\_%'::text THEN d.last_type
            WHEN d.last_type IS NOT NULL THEN 'former_'::text || d.last_type
            ELSE NULL::text
        END AS membership_type,
    b.relationship_memory,
    b.relationship_memory_updated_at,
    b.contract_renewal_type,
    b.business_type,
    b.disposition,
    b.follow_up_after,
    b.mute_replies,
    b.renewal_stage,
    b.renewal_contacted_at,
    b.outreach_stage,
    b.outreach_contacted_at,
    b.outreach_followed_up_at,
    b.outreach_declined_at,
    b.renewal_declined_at,
    b.outreach_identified_at,
    b.outreach_in_discussion_at,
    b.outreach_won_at,
    b.outreach_invoice_paid_at,
    b.renewal_not_started_at,
    b.renewal_in_discussion_at,
    b.renewal_agreed_at,
    b.renewal_invoice_paid_at,
    b.invoice_number,
    b.merged_into,
    b.attention_snoozed_until,
    b.status AS status_stored,
    b.last_contacted_at AS last_contacted_at_stored,
    t.is_commercial,
    cur.id AS current_contract_id,
        CASE
            WHEN d.in_force THEN 'in_force'::text
            WHEN d.recently_ended AND COALESCE(b.renewal_stage, ''::text) <> 'not_renewing'::text THEN 'grace'::text
            WHEN h.had_deal THEN 'ended'::text
            ELSE 'none'::text
        END AS deal_state,
    main.id AS main_contact_id,
    COALESCE(main.is_primary, false) AS main_contact_is_manual,
    b.website
   FROM businesses b
     LEFT JOIN org_business_types t ON t.org_id = b.organization_id AND t.value = b.business_type
     LEFT JOIN deals d ON d.business_id = b.id
     LEFT JOIN cur ON cur.business_id = b.id
     LEFT JOIN touch ON touch.business_id = b.id
     LEFT JOIN main ON main.business_id = b.id
     CROSS JOIN LATERAL ( SELECT d.business_id IS NOT NULL OR (b.status = ANY (ARRAY['Active'::text, 'Former'::text, 'Inactive'::text])) OR b.membership_type IS NOT NULL OR b.is_club_card OR b.is_advertiser OR b.contract_end IS NOT NULL AS had_deal) h;

CREATE OR REPLACE FUNCTION public.business_dossier(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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
          SELECT c.id, c.membership_type, c.contract_start, c.contract_end, c.is_ongoing, c.contract_amount, c.contract_currency,
                 c.billing_frequency, c.deal_terms, c.invoice_paid, c.qbo_invoice_id,
                 (c.contract_end - today) AS days_to_end
          FROM contracts c WHERE c.id = b.current_contract_id) x),
      'history', (SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT c.membership_type, c.contract_start, c.contract_end, c.is_ongoing, c.contract_amount, c.billing_frequency,
                 c.deal_terms, c.invoice_paid, c.is_current,
                 (SELECT jsonb_agg(coalesce(i.doc_number, i.qbo_invoice_id) ORDER BY i.txn_date)
                    FROM qbo_invoices i
                   WHERE i.qbo_invoice_id = c.qbo_invoice_id
                      OR i.qbo_invoice_id IN (SELECT ci.qbo_invoice_id FROM contract_invoices ci WHERE ci.contract_id = c.id)) AS invoices
          FROM contracts c WHERE c.business_id = b.id
          ORDER BY c.contract_end DESC NULLS LAST, c.contract_start DESC NULLS LAST LIMIT 60) x),
      'contracts_total', (SELECT count(*) FROM contracts c WHERE c.business_id = b.id)),

    'money', (WITH inv AS (
        SELECT i.*, (i.voided_at IS NOT NULL OR coalesce(i.private_memo, '') = 'Voided') AS voided
        FROM qbo_invoices i JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
        WHERE l.business_id = b.id)
      SELECT jsonb_build_object(
        'note', 'QuickBooks history since Nov 2019 is complete (copied on weekdays by the daily desk routine). Every invoice is listed below, newest first, with the contract it belongs to when it is one (past contracts too). Customers with no business yet are in v_qbo_customers_to_match, and found with search_everything kind invoice.',
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
        'invoices_total', (SELECT count(*) FROM inv),
        'invoices_by_year', (SELECT jsonb_agg(jsonb_build_object('year', y, 'invoices', n, 'total', t) ORDER BY y DESC)
                 FROM (SELECT extract(year FROM txn_date)::int AS y, count(*) AS n, sum(total_amount) AS t
                       FROM inv WHERE NOT voided GROUP BY 1) s),
        'invoices', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('doc', coalesce(doc_number, qbo_invoice_id),
                 'date', txn_date, 'due', due_date, 'total', total_amount, 'balance', balance, 'paid', is_paid,
                 'voided', voided, 'what', left(line_description, 200),
                 'contract', (SELECT jsonb_build_object('type', c.membership_type, 'start', c.contract_start,
                                'end', c.contract_end, 'current', c.is_current)
                              FROM contracts c WHERE c.business_id = b.id
                                AND (c.qbo_invoice_id = inv.qbo_invoice_id
                                  OR c.id IN (SELECT ci.contract_id FROM contract_invoices ci WHERE ci.qbo_invoice_id = inv.qbo_invoice_id))
                              LIMIT 1)) x
                 FROM inv ORDER BY txn_date DESC NULLS LAST LIMIT 100) s),
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

    'ads', jsonb_build_object(
      'note', 'From Dawn Wilson''s and James Willcocks''s emails (ad placements and stats). Figures are as written in the email; the source email is in correspondence (source_entry_id). Stats often arrive as screenshots that are not read.',
      'placements', (SELECT jsonb_agg(s.x) FROM (SELECT jsonb_build_object('placement', p.placement, 'live_from', p.live_from, 'expires', p.expires,
                       'note', p.note, 'source_entry_id', p.source_entry_id) AS x
                     FROM ad_placements p WHERE p.business_id = b.id ORDER BY coalesce(p.expires, p.live_from) DESC NULLS LAST LIMIT 30) s),
      'reports', (SELECT jsonb_agg(s.x) FROM (SELECT jsonb_build_object('period_start', r.period_start, 'period_end', r.period_end,
                       'placement', r.placement, 'figures', r.figures, 'note', r.note, 'source_entry_id', r.source_entry_id) AS x
                     FROM ad_reports r WHERE r.business_id = b.id ORDER BY coalesce(r.period_end, r.period_start) DESC NULLS LAST LIMIT 30) s),
      'emails_to_confirm', (SELECT count(*) FROM ad_email_links l WHERE l.business_id = b.id AND l.state = 'pending')),

    'attention', (SELECT jsonb_build_object('reason', a.reason, 'detail', a.detail, 'since', a.since,
                   'is_overdue', a.is_overdue, 'all_reasons', a.reasons, 'amount_owed', a.amount_owed,
                   'emails_waiting', a.emails_waiting, 'todos_due', a.todos_due, 'is_snoozed', a.is_snoozed,
                   'club_card_issues', a.club_card_issues)
                  FROM v_business_attention a WHERE a.business_id = b.id LIMIT 1),

    'correspondence', (WITH c AS (
        SELECT c.* FROM correspondence c
        WHERE (c.business_id = b.id OR b.id = ANY (coalesce(c.linked_business_ids, '{}'::uuid[])))
          AND NOT (coalesce(c.ai_metadata, '{}'::jsonb) ? 'qbo_invoice_id'))
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM c),
        'first_date', (SELECT min(entry_date)::date FROM c),
        'last_received', (SELECT max(entry_date)::date FROM c WHERE direction = 'received' AND coalesce(c.ai_metadata->>'source', '') <> 'quickbooks_notice'),
        'last_sent', (SELECT max(entry_date)::date FROM c WHERE direction = 'sent' AND coalesce(c.ai_metadata->>'source', '') <> 'quickbooks_notice'),
        'note', 'Newest first; text is the cleaned version, cut to 700 characters. Use search_correspondence for older or specific items. Items with quickbooks_notice true are QuickBooks emails (invoice sent, reminder, payment): part of the record, but they do not count as being in touch, so last_received, last_sent and last_in_touch leave them out.',
        'recent', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('id', c.id, 'date', c.entry_date::date,
                     'type', c.type, 'direction', c.direction, 'subject', c.subject,
                     'contact', (SELECT k.name FROM contacts k WHERE k.id = c.contact_id),
                     'from_internal', c.internal_sender, 'action', NULLIF(c.action_needed::text, 'none'),
                     'due', c.due_at::date, 'intent', c.intent, 'linked_from_other_business', c.business_id <> b.id,
                     'quickbooks_notice', coalesce(c.ai_metadata->>'source', '') = 'quickbooks_notice',
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
                  ORDER BY i.sent_at DESC LIMIT 10) s),
      -- Stage 19: every Freebie the newsletter ran for them (issue date, closing date)
      'freebies', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('issue_date', n.issue_date, 'closes_on', n.closes_on,
                    'headline', n.headline, 'link', n.link_url, 'issue_url', n.issue_url) x
                  FROM v_newsletter_items n
                  WHERE n.business_id = b.id AND n.kind = 'freebie'
                  ORDER BY n.issue_date DESC) s)),

    -- Stage 20: What's On listing requests (forms and listing emails), with Cleo and the website
    'whats_on_listings', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('title', l.title, 'status', l.status,
                    'asked', l.asked_at::date, 'sent_to_cleo', l.sent_to_cleo_at::date, 'cleo_replied', l.cleo_replied_at::date,
                    'cleo_said', left(l.cleo_note, 300), 'on_website', l.website_url, 'website_title', l.website_title,
                    'published', l.website_published_at::date, 'page_removed', l.website_gone_at::date, 'event_date', l.event_starts_at::date, 'when', l.event_when,
                    'requester', l.requester_email) x
                  FROM v_listing_requests l
                  WHERE l.business_id = b.id AND l.status <> 'hidden'
                  ORDER BY l.asked_at DESC NULLS LAST LIMIT 15) s),

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

    'company', (SELECT jsonb_build_object(
                  'company_number', r.company_number, 'name', r.company_name, 'status', r.status, 'status_detail', r.status_detail,
                  'type', r.company_type, 'incorporated', r.incorporated_on, 'sic_codes', r.sic_codes,
                  'registered_office', r.registered_office, 'accounts_type', r.accounts_type,
                  'accounts_last_made_up', r.accounts_last_made_up, 'accounts_next_due', r.accounts_next_due, 'accounts_overdue', r.accounts_overdue,
                  'confirmation_statement_next_due', r.confirmation_next_due, 'confirmation_statement_overdue', r.confirmation_overdue,
                  'insolvency_history', r.has_insolvency_history, 'has_charges', r.has_charges,
                  'officers', r.officers, 'read_on', r.read_at::date,
                  'register_url', 'https://find-and-update.company-information.service.gov.uk/company/' || r.company_number,
                  'note', 'Companies House register facts, names as the register gives them. Officers are not contacts. The registered office is often the accountant, not the premises.')
                FROM company_records r WHERE r.business_id = b.id),
    'company_to_confirm', (SELECT jsonb_agg(jsonb_build_object('company_number', k.company_number, 'name', k.company_name,
                  'registered_office', k.registered_office, 'status', k.company_status, 'why', k.why))
                FROM company_candidates k WHERE k.business_id = b.id AND k.state = 'pending'),

    'data_health', (SELECT jsonb_agg(jsonb_build_object('check', h.check_key, 'detail', h.detail, 'date', h.ref_date))
                    FROM v_data_health h WHERE h.business_id = b.id)
  );
  RETURN jsonb_strip_nulls(doc);
END $function$
;

CREATE OR REPLACE FUNCTION public.file_sent_mail(p_org uuid, p_rows jsonb, p_mailbox text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  IF (res->>'filed')::int > 0 THEN PERFORM refresh_business_truth(NULL); END IF;
  -- the run record system_alarm() watches: written on every call, even with no messages
  INSERT INTO sent_mail_runs (organization_id, mailbox, rows_seen, result) VALUES (p_org, lower(p_mailbox), jsonb_array_length(p_rows), res);
  RETURN res;
END $function$
;

CREATE OR REPLACE FUNCTION public.find_businesses(p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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
                             merged_into, current_contract_id, main_contact_id, deal_state FROM v_businesses),
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
           OR (f.j->>'deal' <> 'club_card' AND v.deal_state IN ('in_force', 'grace') AND EXISTS (
                SELECT 1 FROM contracts d WHERE d.business_id = v.id AND d.membership_type = f.j->>'deal'
                  AND coalesce(d.contract_start, cc_today()) <= cc_today()
                  AND ((d.contract_end IS NULL AND d.is_current) OR d.contract_end >= cc_today() - 60))))
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
$function$
;

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
          WHERE v.merged_into IS NULL AND COALESCE(v.status, ''::text) <> 'Not a business'::text
        )
 SELECT b.organization_id,
    'club_card_no_card'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    b.current_contract_id AS contract_id,
    ( SELECT max(c.contract_end) AS max
           FROM contracts c
          WHERE c.business_id = b.id AND c.membership_type = 'club_card'::text) AS ref_date,
    m.card_state AS detail
   FROM live b
     LEFT JOIN v_club_card_members m ON m.business_id = b.id
  WHERE b.is_club_card AND (COALESCE(m.card_state, 'none'::text) <> ALL (ARRAY['member'::text, 'grace'::text]))
UNION ALL
 SELECT b.organization_id,
    'deal_no_quickbooks'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    c.id AS contract_id,
    c.contract_end AS ref_date,
    c.membership_type AS detail
   FROM contracts c
     JOIN live b ON b.id = c.business_id
  WHERE c.is_current AND NOT COALESCE(c.invoice_paid, false) AND COALESCE(c.contract_amount, 0::numeric) > 0::numeric AND (c.contract_end IS NULL OR c.contract_end >= (cc_today() - 60)) AND c.qbo_invoice_id IS NULL AND NOT (EXISTS ( SELECT 1
           FROM qbo_links l
          WHERE l.business_id = c.business_id))
UNION ALL
 SELECT b.organization_id,
    'active_no_named_contact'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    b.current_contract_id AS contract_id,
    NULL::date AS ref_date,
    b.deal_state AS detail
   FROM live b
  WHERE b.status = 'Active'::text AND COALESCE(b.is_commercial, true) AND NOT (EXISTS ( SELECT 1
           FROM contacts ct
          WHERE ct.business_id = b.id AND COALESCE(ct.is_active, true) AND NOT COALESCE(ct.name_is_placeholder, false)))
UNION ALL
 SELECT b.organization_id,
    'stored_out_of_step'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    NULL::uuid AS contract_id,
    b.last_contacted_at_stored::date AS ref_date,
    concat_ws(', '::text,
        CASE
            WHEN b.status IS DISTINCT FROM b.status_stored THEN 'status'::text
            ELSE NULL::text
        END,
        CASE
            WHEN b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored THEN 'last_in_touch'::text
            ELSE NULL::text
        END) AS detail
   FROM live b
  WHERE b.status IS DISTINCT FROM b.status_stored OR b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored
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
    COALESCE(NULLIF(v.recipient_name, ''::text), v.recipient) AS business_name,
    NULL::uuid AS contract_id,
    v.last_sent::date AS ref_date,
    v.recipient AS detail
   FROM v_sent_mail_to_review v
UNION ALL
 SELECT c.organization_id,
    'company_to_match'::text AS check_key,
    c.business_id,
    c.business_name,
    NULL::uuid AS contract_id,
    NULL::date AS ref_date,
    ((c.company_name || ' ('::text) || c.company_number) || ')'::text AS detail
   FROM v_company_matches_to_review c
UNION ALL
 SELECT r.organization_id,
    'company_not_trading'::text AS check_key,
    r.business_id,
    b.name AS business_name,
    NULL::uuid AS contract_id,
    NULL::date AS ref_date,
    ((r.company_number || ': '::text) || r.status) || COALESCE(' / '::text || r.status_detail, ''::text) AS detail
   FROM company_records r
     JOIN businesses b ON b.id = r.business_id
  WHERE b.merged_into IS NULL AND r.status IS NOT NULL AND r.status <> 'active'::text AND (b.status = 'Active'::text OR (EXISTS ( SELECT 1
           FROM contracts k
          WHERE k.business_id = b.id AND k.is_current)))
UNION ALL
 SELECT k.organization_id,
    'void_invoice_contract'::text AS check_key,
    k.business_id,
    b.name AS business_name,
    k.id AS contract_id,
    v.txn_date AS ref_date,
    ('Invoice '::text || COALESCE(v.doc_number, ''::text)) || ' is void in QuickBooks'::text AS detail
   FROM contracts k
     JOIN businesses b ON b.id = k.business_id
     CROSS JOIN LATERAL ( SELECT i.doc_number,
            i.txn_date
           FROM qbo_invoices i
          WHERE i.voided_at IS NOT NULL AND (i.qbo_invoice_id = k.qbo_invoice_id OR (EXISTS ( SELECT 1
                   FROM contract_invoices ci
                  WHERE ci.contract_id = k.id AND ci.qbo_invoice_id = i.qbo_invoice_id)))
          ORDER BY i.txn_date DESC
         LIMIT 1) v
  WHERE b.merged_into IS NULL AND k.is_current AND NOT COALESCE(k.invoice_paid, false) AND (k.membership_type = ANY (ARRAY['club_card'::text, 'advertiser'::text]))
UNION ALL
 SELECT b.organization_id,
    'contract_not_current'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    k.id AS contract_id,
    k.contract_end AS ref_date,
    k.membership_type AS detail
   FROM contracts k
     JOIN live b ON b.id = k.business_id
  WHERE NOT k.is_current AND (k.membership_type = ANY (ARRAY['club_card'::text, 'advertiser'::text]))
    AND k.contract_start <= cc_today() AND k.contract_end >= cc_today()
    AND NOT (EXISTS ( SELECT 1 FROM contracts c2 WHERE c2.business_id = k.business_id AND c2.is_current AND c2.contract_end >= cc_today()));

CREATE OR REPLACE VIEW public.v_data_health_counts WITH (security_invoker = true) AS
 WITH checks(sort, check_key, title, fixed_on) AS (
         VALUES (1,'club_card_no_card'::text,'Club Card shown, no card in force'::text,'/data-health'::text), (2,'deal_no_quickbooks'::text,'Deal with no QuickBooks link'::text,'/data-health'::text), (3,'active_no_named_contact'::text,'Active business with no named contact'::text,'/data-health'::text), (4,'stored_out_of_step'::text,'Stored status or last in touch out of step'::text,'/data-health'::text), (5,'club_card_website'::text,'Club Card members with a website problem'::text,'/club-card?show=problems'::text), (6,'club_card_pages_to_match'::text,'Club Card website pages waiting to be matched'::text,'/club-card'::text), (7,'newsletter_unclear'::text,'Unclear newsletter mentions'::text,'/newsletter?view=check'::text), (8,'qbo_customer_to_match'::text,'QuickBooks customers to match'::text,'/data-health'::text), (9,'sent_mail_to_review'::text,'Sent email to review'::text,'/data-health'::text), (10,'company_to_match'::text,'Companies House matches to confirm'::text,'/data-health'::text), (11,'company_not_trading'::text,'Company not trading, business still active'::text,'/data-health'::text), (12,'void_invoice_contract'::text,'Current contract whose invoice is voided'::text,'/data-health'::text), (13,'contract_not_current'::text,'Deal running today but not marked current'::text,'/data-health'::text)
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
          WHERE cardinality(COALESCE(v_club_card_members.issues, '{}'::text[])) > 0
          GROUP BY v_club_card_members.organization_id
        UNION ALL
         SELECT club_card_pages.organization_id,
            'club_card_pages_to_match'::text AS text,
            count(*) AS count
           FROM club_card_pages
          WHERE club_card_pages.gone_at IS NULL AND (club_card_pages.match_status = ANY (ARRAY['unmatched'::text, 'suggested'::text]))
          GROUP BY club_card_pages.organization_id
        UNION ALL
         SELECT newsletter_mentions.organization_id,
            'newsletter_unclear'::text AS text,
            count(*) AS count
           FROM newsletter_mentions
          WHERE newsletter_mentions.status = 'unclear'::text
          GROUP BY newsletter_mentions.organization_id
        )
 SELECT o.id AS organization_id,
    k.sort,
    k.check_key,
    k.title,
    k.fixed_on,
    COALESCE(n.n, 0::bigint)::integer AS n
   FROM organizations o
     CROSS JOIN checks k
     LEFT JOIN n ON n.organization_id = o.id AND n.check_key = k.check_key;

GRANT SELECT ON public.v_businesses, public.v_data_health, public.v_data_health_counts TO authenticated, service_role;
