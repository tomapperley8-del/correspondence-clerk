-- Restores the live definitions before 20261102_008.
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
          WHERE k.business_id = b.id AND k.is_current)));

CREATE OR REPLACE VIEW public.v_data_health_counts WITH (security_invoker = true) AS
 WITH checks(sort, check_key, title, fixed_on) AS (
         VALUES (1,'club_card_no_card'::text,'Club Card shown, no card in force'::text,'/data-health'::text), (2,'deal_no_quickbooks'::text,'Deal with no QuickBooks link'::text,'/data-health'::text), (3,'active_no_named_contact'::text,'Active business with no named contact'::text,'/data-health'::text), (4,'stored_out_of_step'::text,'Stored status or last in touch out of step'::text,'/data-health'::text), (5,'club_card_website'::text,'Club Card members with a website problem'::text,'/club-card?show=problems'::text), (6,'club_card_pages_to_match'::text,'Club Card website pages waiting to be matched'::text,'/club-card'::text), (7,'newsletter_unclear'::text,'Unclear newsletter mentions'::text,'/newsletter?view=check'::text), (8,'qbo_customer_to_match'::text,'QuickBooks customers to match'::text,'/data-health'::text), (9,'sent_mail_to_review'::text,'Sent email to review'::text,'/data-health'::text), (10,'company_to_match'::text,'Companies House matches to confirm'::text,'/data-health'::text), (11,'company_not_trading'::text,'Company not trading, business still active'::text,'/data-health'::text)
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

GRANT SELECT ON public.v_data_health, public.v_data_health_counts TO authenticated, service_role;
