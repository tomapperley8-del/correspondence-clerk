-- 13 Nov 2026 (Tom: "give me the new rule with the migration and merge"): advertising invoiced in QuickBooks
-- becomes an advertiser contract. record_qbo_terms gains a third source, 'advertising': an unvoided invoice,
-- total > 0, last 60 days, wording sidebar|leaderboard|advertis|banner|sticky (not standing order / per month /
-- instalment / payment N of N), no advertiser contract covering or holding it, paid or unpaid; term from a stated
-- date range or "N months/weeks" from the invoice date. Where the term is not clear nothing is guessed: the invoice
-- shows in the Data health check advertising_invoice_no_contract (any advertising invoice of the last 90 days with
-- no advertiser contract). Undo: migrations/rollback/20261113_001_advertising_from_quickbooks_rollback.sql
-- Advertising invoices in QuickBooks (last 90 days, not void, not instalments) and whether an advertiser
-- contract already covers or holds them; term_start/term_end are read from the wording or null.
CREATE OR REPLACE FUNCTION public.cc_parse_ad_term(p_desc text, p_inv date)
 RETURNS date[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  mnames text[] := ARRAY['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  m text[]; s date; e date; n integer; unit text;
BEGIN
  -- "November 9th 2026 to February 9th 2027"
  m := regexp_match(p_desc, '([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s*(?:to|until|-|–)\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})', 'i');
  IF m IS NOT NULL AND array_position(mnames, lower(left(m[1],3))) IS NOT NULL AND array_position(mnames, lower(left(m[4],3))) IS NOT NULL THEN
    BEGIN
      s := make_date(m[3]::int, array_position(mnames, lower(left(m[1],3))), m[2]::int);
      e := make_date(m[6]::int, array_position(mnames, lower(left(m[4],3))), m[5]::int);
      IF e >= s AND e - s <= 400 THEN RETURN ARRAY[s, e]; END IF;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  -- "19 October to 23 December" (years optional)
  m := regexp_match(p_desc, '(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:\s+(\d{4}))?\s*(?:to|until|-|–)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:\s+(\d{4}))?', 'i');
  IF m IS NOT NULL AND array_position(mnames, lower(left(m[2],3))) IS NOT NULL AND array_position(mnames, lower(left(m[5],3))) IS NOT NULL THEN
    BEGIN
      s := make_date(coalesce(m[3]::int, extract(year FROM p_inv)::int), array_position(mnames, lower(left(m[2],3))), m[1]::int);
      IF m[3] IS NULL AND s < p_inv - 60 THEN s := (s + interval '1 year')::date; END IF;
      e := make_date(coalesce(m[6]::int, extract(year FROM s)::int), array_position(mnames, lower(left(m[5],3))), m[4]::int);
      IF m[6] IS NULL AND e < s THEN e := (e + interval '1 year')::date; END IF;
      IF e >= s AND e - s <= 400 THEN RETURN ARRAY[s, e]; END IF;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  -- "3 months" / "6 weeks", from the invoice date
  m := regexp_match(p_desc, '(\d{1,2})\s*(month|week)s?\M', 'i');
  IF m IS NOT NULL THEN
    n := m[1]::int; unit := lower(m[2]);
    IF unit = 'month' AND n BETWEEN 1 AND 24 THEN RETURN ARRAY[p_inv, ((p_inv + make_interval(months => n))::date - 1)]; END IF;
    IF unit = 'week' AND n BETWEEN 1 AND 52 THEN RETURN ARRAY[p_inv, p_inv + n * 7 - 1]; END IF;
  END IF;
  RETURN NULL;
END $f$;

CREATE OR REPLACE VIEW public.v_advertising_invoices WITH (security_invoker = true) AS
 SELECT DISTINCT ON (i.qbo_invoice_id)
    b.id AS business_id, b.organization_id, b.name AS business_name,
    i.qbo_invoice_id, i.doc_number, i.txn_date, i.total_amount, i.is_paid, i.line_description,
    t.term[1] AS term_start, t.term[2] AS term_end,
    (EXISTS (SELECT 1 FROM contracts k
             WHERE k.business_id = b.id AND k.membership_type = 'advertiser'
               AND (k.qbo_invoice_id = i.qbo_invoice_id
                    OR EXISTS (SELECT 1 FROM contract_invoices ci WHERE ci.contract_id = k.id AND ci.qbo_invoice_id = i.qbo_invoice_id)
                    OR (k.contract_start <= i.txn_date AND k.contract_end >= i.txn_date)
                    OR (t.term[1] IS NOT NULL AND k.contract_start <= t.term[1] AND k.contract_end >= t.term[1])))
     OR EXISTS (SELECT 1 FROM contracts k2 WHERE k2.qbo_invoice_id = i.qbo_invoice_id)
     OR EXISTS (SELECT 1 FROM contract_invoices ci2 WHERE ci2.qbo_invoice_id = i.qbo_invoice_id)) AS covered
 FROM qbo_invoices i
   JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
   JOIN businesses b ON b.id = l.business_id
   CROSS JOIN LATERAL (SELECT cc_parse_ad_term(i.line_description, i.txn_date) AS term) t
 WHERE b.merged_into IS NULL AND COALESCE(b.status, '') <> 'Not a business'
   AND i.voided_at IS NULL AND coalesce(i.private_memo, '') <> 'Voided' AND i.total_amount > 0
   AND i.txn_date >= cc_today() - 90
   AND i.line_description ~* '(sidebar|leaderboard|advertis|banner|sticky)'
   AND i.line_description !~* '(standing order|per month|instalment|payment [0-9]+ of [0-9]+)'
 ORDER BY i.qbo_invoice_id;

CREATE OR REPLACE FUNCTION public.record_qbo_terms(p_dry_run boolean DEFAULT false)
 RETURNS TABLE(kind text, business_name text, qbo_invoice_id text, contract_start date, contract_end date, amount numeric, paid boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
BEGIN
  DROP TABLE IF EXISTS _terms;
  CREATE TEMP TABLE _terms ON COMMIT DROP AS
  WITH renewal AS (
    SELECT DISTINCT ON (c.id)
      'renewal'::text AS kind, c.business_id, b.organization_id, b.name,
      c.id AS old_contract_id, i.qbo_invoice_id, i.total_amount, i.is_paid, i.line_description,
      (c.contract_end + 1) AS new_start,
      (c.contract_end + 1 + (c.contract_end - c.contract_start)) AS new_end,
      c.membership_type AS old_type, c.billing_frequency
    FROM contracts c
    JOIN businesses b ON b.id = c.business_id
    JOIN qbo_links l ON l.business_id = c.business_id
    JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
    WHERE c.is_current
      AND c.contract_start IS NOT NULL AND c.contract_end IS NOT NULL
      AND coalesce(i.private_memo, '') <> 'Voided' AND i.total_amount > 0
      AND i.txn_date > c.contract_start + 270
      AND i.txn_date BETWEEN c.contract_end - 90 AND c.contract_end + 150
      AND i.total_amount >= 0.8 * coalesce(c.contract_amount, i.total_amount)
      AND i.line_description ~* '(club card|membership|sidebar|leaderboard|advertis|banner)'
      AND i.line_description !~* '(standing order|per month|instalment)'
      -- An invoice is not a yes: paid, or they agreed.
      AND (i.is_paid OR b.renewal_stage IN ('agreed', 'invoice_paid'))
      AND NOT EXISTS (SELECT 1 FROM contracts n WHERE n.business_id = c.business_id AND n.contract_start > c.contract_start)
      AND NOT EXISTS (SELECT 1 FROM contracts x WHERE x.qbo_invoice_id = i.qbo_invoice_id)
    ORDER BY c.id, i.txn_date
  ),
  newcomer AS (
    SELECT DISTINCT ON (b.id)
      'new member'::text AS kind, b.id AS business_id, b.organization_id, b.name,
      NULL::uuid AS old_contract_id, i.qbo_invoice_id, i.total_amount, i.is_paid, i.line_description,
      i.txn_date AS new_start,
      (i.txn_date + interval '1 year' - interval '1 day')::date AS new_end,
      NULL::text AS old_type, 'annual'::text AS billing_frequency
    FROM businesses b
    JOIN qbo_links l ON l.business_id = b.id
    JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
    WHERE NOT EXISTS (SELECT 1 FROM contracts c WHERE c.business_id = b.id AND c.is_current)
      AND coalesce(i.private_memo, '') <> 'Voided' AND i.total_amount >= 200
      AND i.txn_date >= current_date - 60
      AND i.line_description ~* '(12 months?|1 year|one year|annual)'
      AND i.line_description ~* '(club card|membership|sidebar|leaderboard|advertis|banner)'
      AND i.line_description !~* '(standing order|per month|instalment)'
      AND NOT EXISTS (SELECT 1 FROM contracts x WHERE x.qbo_invoice_id = i.qbo_invoice_id)
    ORDER BY b.id, i.txn_date
  )
  SELECT t.*,
    CASE
      WHEN t.line_description ~* '(sidebar|leaderboard|advertis|banner)' THEN 'advertiser'
      WHEN t.line_description ~* 'club card' THEN 'club_card'
      ELSE coalesce(t.old_type, 'club_card')
    END AS new_type
  FROM (SELECT * FROM renewal UNION ALL SELECT * FROM newcomer) t;

  -- Third source (13 Nov 2026): advertising invoiced in QuickBooks, paid or not, with a term we can read.
  DROP TABLE IF EXISTS _ad;
  CREATE TEMP TABLE _ad ON COMMIT DROP AS
  SELECT DISTINCT ON (a.business_id) a.business_id, a.organization_id, a.business_name, a.qbo_invoice_id,
         a.total_amount, a.is_paid, a.line_description, a.term_start, a.term_end
  FROM v_advertising_invoices a
  WHERE a.term_start IS NOT NULL AND NOT a.covered AND a.txn_date >= cc_today() - 60
    AND NOT EXISTS (SELECT 1 FROM _terms t WHERE t.qbo_invoice_id = a.qbo_invoice_id)
  ORDER BY a.business_id, a.txn_date;

  IF NOT p_dry_run THEN
    UPDATE contracts c SET is_current = false, updated_at = now()
    FROM _terms t WHERE c.id = t.old_contract_id;

    INSERT INTO contracts (business_id, organization_id, membership_type, contract_start, contract_end,
                           contract_amount, contract_currency, billing_frequency, deal_terms,
                           invoice_paid, is_current, qbo_invoice_id)
    SELECT t.business_id, t.organization_id, t.new_type, t.new_start, t.new_end,
           t.total_amount, 'GBP', coalesce(t.billing_frequency, 'annual'),
           t.line_description || ' (recorded from QuickBooks)',
           t.is_paid, true, t.qbo_invoice_id
    FROM _terms t;

    WITH ins AS (
      INSERT INTO contracts (business_id, organization_id, membership_type, contract_start, contract_end,
                             contract_amount, contract_currency, billing_frequency, deal_terms,
                             invoice_paid, is_current, qbo_invoice_id)
      SELECT d.business_id, d.organization_id, 'advertiser', d.term_start, d.term_end,
             d.total_amount, 'GBP', 'one_off', d.line_description || ' (recorded from QuickBooks)',
             d.is_paid, true, d.qbo_invoice_id
      FROM _ad d
      RETURNING id, qbo_invoice_id
    )
    INSERT INTO contract_invoices (contract_id, qbo_invoice_id)
    SELECT id, qbo_invoice_id FROM ins ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT t.kind, t.name, t.qbo_invoice_id, t.new_start, t.new_end, t.total_amount, t.is_paid FROM _terms t
  UNION ALL
  SELECT 'advertising'::text, d.business_name, d.qbo_invoice_id, d.term_start, d.term_end, d.total_amount, d.is_paid FROM _ad d;
END $function$;

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
  WHERE NOT k.is_current AND (k.membership_type = ANY (ARRAY['club_card'::text, 'advertiser'::text])) AND k.contract_start <= cc_today() AND k.contract_end >= cc_today() AND NOT (EXISTS ( SELECT 1
           FROM contracts c2
          WHERE c2.business_id = k.business_id AND c2.is_current AND c2.contract_end >= cc_today()))
UNION ALL
 SELECT b.organization_id,
    'advertising_invoice_no_contract'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    NULL::uuid AS contract_id,
    a.txn_date AS ref_date,
    ('Invoice '::text || COALESCE(a.doc_number, ''::text)) || ' (£'::text || a.total_amount::text || '): '::text
      || CASE WHEN a.term_start IS NULL THEN 'term not clear, add the advertising by hand'::text ELSE 'no advertiser contract yet'::text END
      || ' — '::text || left(a.line_description, 90) AS detail
   FROM v_advertising_invoices a
     JOIN live b ON b.id = a.business_id
  WHERE NOT a.covered;

CREATE OR REPLACE VIEW public.v_data_health_counts WITH (security_invoker = true) AS
WITH checks(sort, check_key, title, fixed_on) AS (
         VALUES (1,'club_card_no_card'::text,'Club Card shown, no card in force'::text,'/data-health'::text), (2,'deal_no_quickbooks'::text,'Deal with no QuickBooks link'::text,'/data-health'::text), (3,'active_no_named_contact'::text,'Active business with no named contact'::text,'/data-health'::text), (4,'stored_out_of_step'::text,'Stored status or last in touch out of step'::text,'/data-health'::text), (5,'club_card_website'::text,'Club Card members with a website problem'::text,'/club-card?show=problems'::text), (6,'club_card_pages_to_match'::text,'Club Card website pages waiting to be matched'::text,'/club-card'::text), (7,'newsletter_unclear'::text,'Unclear newsletter mentions'::text,'/newsletter?view=check'::text), (8,'qbo_customer_to_match'::text,'QuickBooks customers to match'::text,'/data-health'::text), (9,'sent_mail_to_review'::text,'Sent email to review'::text,'/data-health'::text), (10,'company_to_match'::text,'Companies House matches to confirm'::text,'/data-health'::text), (11,'company_not_trading'::text,'Company not trading, business still active'::text,'/data-health'::text), (12,'void_invoice_contract'::text,'Current contract whose invoice is voided'::text,'/data-health'::text), (13,'contract_not_current'::text,'Deal running today but not marked current'::text,'/data-health'::text), (14,'advertising_invoice_no_contract'::text,'Advertising invoice with no advertiser contract'::text,'/data-health'::text)
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

GRANT SELECT ON public.v_advertising_invoices, public.v_data_health, public.v_data_health_counts TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_parse_ad_term(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_qbo_terms(boolean) TO authenticated, service_role;
