-- Stage 19 (30 Oct 2026): the dossier's newsletter section gains `freebies`, every Freebie
-- the newsletter ran for the business (from v_newsletter_items, kind = 'freebie'), newest
-- first, with the issue date and closing date. Read-only; nothing else changes.
-- Rollback: supabase/migrations/rollback/20261030_003_dossier_freebies_rollback.sql

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
                  ORDER BY i.sent_at DESC LIMIT 10) s),
      -- Stage 19: every Freebie the newsletter ran for them (issue date, closing date)
      'freebies', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('issue_date', n.issue_date, 'closes_on', n.closes_on,
                    'headline', n.headline, 'link', n.link_url, 'issue_url', n.issue_url) x
                  FROM v_newsletter_items n
                  WHERE n.business_id = b.id AND n.kind = 'freebie'
                  ORDER BY n.issue_date DESC) s)),

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
END $function$;

REVOKE ALL ON FUNCTION public.business_dossier(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_dossier(text) TO authenticated, service_role;
