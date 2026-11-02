-- Restores v_club_card_members as it was before 20261102_002.
CREATE OR REPLACE VIEW public.v_club_card_members AS
 WITH today AS (
         SELECT cc_today() AS d
        ), biz AS (
         SELECT b_1.id,
            b_1.name,
            b_1.normalized_name,
            b_1.category,
            b_1.status,
            b_1.is_club_card,
            b_1.is_advertiser,
            b_1.last_contacted_at,
            b_1.mastersheet_source_ids,
            b_1.created_at,
            b_1.updated_at,
            b_1.contract_start,
            b_1.contract_end,
            b_1.deal_terms,
            b_1.payment_structure,
            b_1.contract_amount,
            b_1.address,
            b_1.email,
            b_1.phone,
            b_1.organization_id,
            b_1.contract_currency,
            b_1.notes,
            b_1.membership_type,
            b_1.relationship_memory,
            b_1.relationship_memory_updated_at,
            b_1.contract_renewal_type,
            b_1.business_type,
            b_1.disposition,
            b_1.follow_up_after,
            b_1.mute_replies,
            b_1.renewal_stage,
            b_1.renewal_contacted_at,
            b_1.outreach_stage,
            b_1.outreach_contacted_at,
            b_1.outreach_followed_up_at,
            b_1.outreach_declined_at,
            b_1.renewal_declined_at,
            b_1.outreach_identified_at,
            b_1.outreach_in_discussion_at,
            b_1.outreach_won_at,
            b_1.outreach_invoice_paid_at,
            b_1.renewal_not_started_at,
            b_1.renewal_in_discussion_at,
            b_1.renewal_agreed_at,
            b_1.renewal_invoice_paid_at,
            b_1.invoice_number,
            b_1.merged_into,
            b_1.attention_snoozed_until
           FROM v_businesses b_1
          WHERE b_1.merged_into IS NULL AND COALESCE(b_1.status, ''::text) <> 'Not a business'::text
        ), card AS (
         SELECT DISTINCT ON (c_1.business_id) c_1.business_id,
            c_1.id AS contract_id,
            c_1.membership_type,
            c_1.contract_start,
            c_1.contract_end,
            c_1.is_current
           FROM contracts c_1
          WHERE c_1.membership_type = ANY (ARRAY['club_card'::text, 'former_club_card'::text])
          ORDER BY c_1.business_id, (c_1.membership_type = 'club_card'::text AND c_1.is_current) DESC, c_1.contract_end DESC, c_1.created_at DESC
        ), state AS (
         SELECT b_1.id AS business_id,
            k.contract_id,
            k.contract_start,
            k.contract_end,
                CASE
                    WHEN k.business_id IS NULL THEN 'none'::text
                    WHEN k.contract_end >= td_1.d THEN 'member'::text
                    WHEN k.contract_end IS NULL AND k.membership_type = 'club_card'::text AND k.is_current THEN 'member'::text
                    WHEN k.membership_type = 'club_card'::text AND k.is_current AND k.contract_end >= (td_1.d - 60) AND COALESCE(b_1.renewal_stage, ''::text) <> 'not_renewing'::text AND b_1.renewal_declined_at IS NULL THEN 'grace'::text
                    ELSE 'lapsed'::text
                END AS card_state
           FROM biz b_1
             CROSS JOIN today td_1
             LEFT JOIN card k ON k.business_id = b_1.id
        ), live_pages AS (
         SELECT p.id,
            p.organization_id,
            p.wp_id,
            p.slug,
            p.link,
            p.title,
            p.wp_modified,
            p.offer_text,
            p.offer_ends_on,
            p.page_address,
            p.page_postcode,
            p.page_phone,
            p.page_phone_digits,
            p.page_website,
            p.page_website_host,
            p.page_email,
            p.in_az_count,
            p.in_latest_offers,
            p.map_count,
            p.map_folders,
            p.categories,
            p.outside_club_card_folder,
            p.first_seen_at,
            p.last_seen_at,
            p.gone_at,
            p.match_status,
            p.business_id,
            p.suggested_business_id,
            p.match_reason,
            p.matched_by,
            p.matched_at,
            p.offer_ends_set,
            p.offer_confirmed_at,
            p.updated_at
           FROM club_card_pages p
          WHERE p.match_status = 'confirmed'::text AND p.gone_at IS NULL AND p.business_id IS NOT NULL
        ), page AS (
         SELECT DISTINCT ON (p.business_id) p.id,
            p.organization_id,
            p.wp_id,
            p.slug,
            p.link,
            p.title,
            p.wp_modified,
            p.offer_text,
            p.offer_ends_on,
            p.page_address,
            p.page_postcode,
            p.page_phone,
            p.page_phone_digits,
            p.page_website,
            p.page_website_host,
            p.page_email,
            p.in_az_count,
            p.in_latest_offers,
            p.map_count,
            p.map_folders,
            p.categories,
            p.outside_club_card_folder,
            p.first_seen_at,
            p.last_seen_at,
            p.gone_at,
            p.match_status,
            p.business_id,
            p.suggested_business_id,
            p.match_reason,
            p.matched_by,
            p.matched_at,
            p.offer_ends_set,
            p.offer_confirmed_at,
            p.updated_at,
            count(*) OVER (PARTITION BY p.business_id) AS live_page_count
           FROM live_pages p
          ORDER BY p.business_id, p.wp_modified DESC NULLS LAST
        ), app_phones AS (
         SELECT x.business_id,
            array_agg(DISTINCT x.digits) AS digits
           FROM ( SELECT b_1.id AS business_id,
                    cc_phone_digits(b_1.phone) AS digits
                   FROM biz b_1
                UNION ALL
                 SELECT c_1.business_id,
                    cc_phone_digits(ph.value #>> '{}'::text[]) AS cc_phone_digits
                   FROM contacts c_1
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(c_1.phones) = 'array'::text THEN c_1.phones
                            ELSE '[]'::jsonb
                        END) ph(value)) x
          WHERE x.digits IS NOT NULL
          GROUP BY x.business_id
        ), app_domains AS (
         SELECT dm.business_id,
            array_agg(DISTINCT lower(regexp_replace(dm.domain, '^www\.'::text, ''::text))) AS hosts
           FROM domain_mappings dm
          WHERE dm.business_id IS NOT NULL
          GROUP BY dm.business_id
        ), checks AS (
         SELECT s.business_id,
            s.card_state,
            s.contract_id,
            s.contract_start,
            s.contract_end,
            p.id AS page_id,
            p.wp_id,
            p.link AS page_link,
            p.title AS page_title,
            p.offer_text,
            p.wp_modified,
            p.offer_confirmed_at,
            COALESCE(p.live_page_count, 0::bigint) AS live_page_count,
            COALESCE(p.offer_ends_set, p.offer_ends_on) AS offer_ends,
            p.in_az_count,
            p.map_count,
            p.map_folders,
            p.categories,
            p.in_latest_offers,
            p.page_address,
            p.page_phone,
            p.page_website,
            p.page_email,
            array_remove(ARRAY[
                CASE
                    WHEN p.page_phone_digits IS NOT NULL AND ph.digits IS NOT NULL AND NOT (p.page_phone_digits = ANY (ph.digits)) THEN 'phone'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN p.page_postcode IS NOT NULL AND cc_postcode(b_1.address) IS NOT NULL AND p.page_postcode <> cc_postcode(b_1.address) THEN 'postcode'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN p.page_website_host IS NOT NULL AND dm.hosts IS NOT NULL AND NOT (EXISTS ( SELECT 1
                       FROM unnest(dm.hosts) h(h)
                      WHERE p.page_website_host = h.h OR p.page_website_host ~~ ('%.'::text || h.h) OR h.h ~~ ('%.'::text || p.page_website_host))) THEN 'website'::text
                    ELSE NULL::text
                END], NULL::text) AS contact_mismatch
           FROM state s
             JOIN biz b_1 ON b_1.id = s.business_id
             LEFT JOIN page p ON p.business_id = s.business_id
             LEFT JOIN app_phones ph ON ph.business_id = s.business_id
             LEFT JOIN app_domains dm ON dm.business_id = s.business_id
          WHERE (s.card_state = ANY (ARRAY['member'::text, 'grace'::text])) OR p.id IS NOT NULL
        )
 SELECT b.id AS business_id,
    b.organization_id,
    b.name AS business_name,
    c.card_state,
    c.contract_id,
    c.contract_start,
    c.contract_end,
    c.page_id,
    c.wp_id,
    c.page_link,
    c.page_title,
    c.offer_text,
    c.offer_ends,
    c.wp_modified,
    c.offer_confirmed_at,
    c.live_page_count,
    c.in_az_count,
    c.map_count,
    c.map_folders,
    c.categories,
    c.in_latest_offers,
    c.page_address,
    c.page_phone,
    c.page_website,
    c.page_email,
    c.contact_mismatch,
        CASE
            WHEN c.page_id IS NOT NULL AND c.card_state = 'lapsed'::text THEN ARRAY['page_lapsed'::text]
            WHEN c.page_id IS NOT NULL AND c.card_state = 'none'::text THEN ARRAY['page_no_member'::text]
            WHEN c.page_id IS NULL THEN
            CASE
                WHEN (EXISTS ( SELECT 1
                   FROM club_card_sync_runs r
                  WHERE r.organization_id = b.organization_id AND r.ok)) AND NOT (EXISTS ( SELECT 1
                   FROM club_card_pages p
                  WHERE p.suggested_business_id = c.business_id AND p.gone_at IS NULL AND (p.match_status = ANY (ARRAY['unmatched'::text, 'suggested'::text])))) THEN ARRAY['no_page'::text]
                ELSE ARRAY[]::text[]
            END
            ELSE array_remove(ARRAY[
            CASE
                WHEN c.offer_ends IS NULL AND ((EXISTS ( SELECT 1
                   FROM regexp_matches(COALESCE(c.offer_text, ''::text), '\m(20[0-9]{2})\M'::text, 'g'::text) y(m)
                  WHERE y.m[1]::integer::numeric < EXTRACT(year FROM td.d))) OR (EXISTS ( SELECT 1
                   FROM correspondence e
                  WHERE e.business_id = c.business_id AND e.direction = 'received'::text AND e.entry_date > COALESCE(GREATEST(c.wp_modified, c.offer_confirmed_at), '-infinity'::timestamp with time zone) AND COALESCE(e.formatted_text_current, e.raw_text_original) ~* '(withdraw|remove (the|our) offer|no longer (offer|able to offer|run)|stop (the|our) (offer|discount)|change (the|our) offer|new offer|update (the|our) offer)'::text))) THEN 'offer_old'::text
                ELSE NULL::text
            END,
            CASE
                WHEN c.offer_ends IS NOT NULL AND c.offer_ends <= (td.d + 10) THEN 'offer_ending'::text
                ELSE NULL::text
            END,
            CASE
                WHEN c.in_az_count = 0 THEN 'not_in_az'::text
                ELSE NULL::text
            END,
            CASE
                WHEN c.in_az_count > 1 THEN 'az_twice'::text
                ELSE NULL::text
            END,
            CASE
                WHEN c.map_count = 0 THEN 'not_on_map'::text
                ELSE NULL::text
            END,
            CASE
                WHEN cardinality(c.categories) = 0 THEN 'no_category'::text
                ELSE NULL::text
            END,
            CASE
                WHEN cardinality(c.contact_mismatch) > 0 THEN 'contact_differs'::text
                ELSE NULL::text
            END], NULL::text)
        END AS issues,
    b.category AS category_in_app,
    ARRAY( SELECT
                CASE x.x
                    WHEN 'Food & drink'::text THEN 'Food & Drink'::text
                    WHEN 'Health & beauty'::text THEN 'Health & Beauty'::text
                    WHEN 'Children'::text THEN 'For Children'::text
                    ELSE x.x
                END AS x
           FROM unnest(c.categories) x(x)) AS category_on_website,
    cardinality(c.categories) > 0 AND NOT (COALESCE(b.category, ''::text) = ANY ((ARRAY( SELECT
                CASE x.x
                    WHEN 'Food & drink'::text THEN 'Food & Drink'::text
                    WHEN 'Health & beauty'::text THEN 'Health & Beauty'::text
                    WHEN 'Children'::text THEN 'For Children'::text
                    ELSE x.x
                END AS x
           FROM unnest(c.categories) x(x))))) AS category_differs
   FROM checks c
     JOIN biz b ON b.id = c.business_id
     CROSS JOIN today td;
