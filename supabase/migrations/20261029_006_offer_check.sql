-- Stage 11c follow-up (Tom, 29 Oct: "be more smart with the other 26, cos its not a problem really").
-- 'offer_old' on v_club_card_members used to mean "page not edited or offer confirmed for a year":
-- 30 flags, 28 of them fine. It now means the offer looks out of date: no end date set, and either
-- the offer text names a year before this one (Busby's "December 2024"), or the business has
-- emailed us since the page was last edited or confirmed about withdrawing, changing or updating
-- its offer (Mari Deli, 09/09/2026). Measured on live 29 Oct: 2 flags, both real.
-- The key stays 'offer_old' and every column stays the same, so the Club Card tab, Businesses,
-- Today and the desk email (through v_business_attention) read it unchanged; v_business_attention's
-- wording becomes "offer looks out of date". Definitions are live's, with only those two edits.
-- Rollback: rollback/20261029_006_offer_check_rollback.sql (live's definitions as they were).

CREATE OR REPLACE VIEW public.v_club_card_members WITH (security_invoker = true) AS
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
          WHERE ((b_1.merged_into IS NULL) AND (COALESCE(b_1.status, ''::text) <> 'Not a business'::text))
        ), card AS (
         SELECT DISTINCT ON (c_1.business_id) c_1.business_id,
            c_1.id AS contract_id,
            c_1.membership_type,
            c_1.contract_start,
            c_1.contract_end,
            c_1.is_current
           FROM contracts c_1
          WHERE (c_1.membership_type = ANY (ARRAY['club_card'::text, 'former_club_card'::text]))
          ORDER BY c_1.business_id, ((c_1.membership_type = 'club_card'::text) AND c_1.is_current) DESC, c_1.contract_end DESC, c_1.created_at DESC
        ), state AS (
         SELECT b_1.id AS business_id,
            k.contract_id,
            k.contract_start,
            k.contract_end,
                CASE
                    WHEN (k.business_id IS NULL) THEN 'none'::text
                    WHEN (k.contract_end >= td_1.d) THEN 'member'::text
                    WHEN ((k.contract_end IS NULL) AND (k.membership_type = 'club_card'::text) AND k.is_current) THEN 'member'::text
                    WHEN ((k.membership_type = 'club_card'::text) AND k.is_current AND (k.contract_end >= (td_1.d - 60)) AND (COALESCE(b_1.renewal_stage, ''::text) <> 'not_renewing'::text) AND (b_1.renewal_declined_at IS NULL)) THEN 'grace'::text
                    ELSE 'lapsed'::text
                END AS card_state
           FROM ((biz b_1
             CROSS JOIN today td_1)
             LEFT JOIN card k ON ((k.business_id = b_1.id)))
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
          WHERE ((p.match_status = 'confirmed'::text) AND (p.gone_at IS NULL) AND (p.business_id IS NOT NULL))
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
                    cc_phone_digits((ph.value #>> '{}'::text[])) AS cc_phone_digits
                   FROM (contacts c_1
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN (jsonb_typeof(c_1.phones) = 'array'::text) THEN c_1.phones
                            ELSE '[]'::jsonb
                        END) ph(value))) x
          WHERE (x.digits IS NOT NULL)
          GROUP BY x.business_id
        ), app_domains AS (
         SELECT dm.business_id,
            array_agg(DISTINCT lower(regexp_replace(dm.domain, '^www\.'::text, ''::text))) AS hosts
           FROM domain_mappings dm
          WHERE (dm.business_id IS NOT NULL)
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
            COALESCE(p.live_page_count, (0)::bigint) AS live_page_count,
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
                    WHEN ((p.page_phone_digits IS NOT NULL) AND (ph.digits IS NOT NULL) AND (NOT (p.page_phone_digits = ANY (ph.digits)))) THEN 'phone'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN ((p.page_postcode IS NOT NULL) AND (cc_postcode(b_1.address) IS NOT NULL) AND (p.page_postcode <> cc_postcode(b_1.address))) THEN 'postcode'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN ((p.page_website_host IS NOT NULL) AND (dm.hosts IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                       FROM unnest(dm.hosts) h(h)
                      WHERE ((p.page_website_host = h.h) OR (p.page_website_host ~~ ('%.'::text || h.h)) OR (h.h ~~ ('%.'::text || p.page_website_host))))))) THEN 'website'::text
                    ELSE NULL::text
                END], NULL::text) AS contact_mismatch
           FROM ((((state s
             JOIN biz b_1 ON ((b_1.id = s.business_id)))
             LEFT JOIN page p ON ((p.business_id = s.business_id)))
             LEFT JOIN app_phones ph ON ((ph.business_id = s.business_id)))
             LEFT JOIN app_domains dm ON ((dm.business_id = s.business_id)))
          WHERE ((s.card_state = ANY (ARRAY['member'::text, 'grace'::text])) OR (p.id IS NOT NULL))
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
            WHEN ((c.page_id IS NOT NULL) AND (c.card_state = 'lapsed'::text)) THEN ARRAY['page_lapsed'::text]
            WHEN ((c.page_id IS NOT NULL) AND (c.card_state = 'none'::text)) THEN ARRAY['page_no_member'::text]
            WHEN (c.page_id IS NULL) THEN
            CASE
                WHEN ((EXISTS ( SELECT 1
                   FROM club_card_sync_runs r
                  WHERE ((r.organization_id = b.organization_id) AND r.ok))) AND (NOT (EXISTS ( SELECT 1
                   FROM club_card_pages p
                  WHERE ((p.suggested_business_id = c.business_id) AND (p.gone_at IS NULL) AND (p.match_status = ANY (ARRAY['unmatched'::text, 'suggested'::text]))))))) THEN ARRAY['no_page'::text]
                ELSE ARRAY[]::text[]
            END
            ELSE array_remove(ARRAY[
            CASE
                WHEN ((c.offer_ends IS NULL) AND ((EXISTS ( SELECT 1
                   FROM regexp_matches(COALESCE(c.offer_text, ''::text), '\m(20[0-9]{2})\M'::text, 'g'::text) y(m)
                  WHERE ((y.m[1])::integer < EXTRACT(year FROM td.d)))) OR (EXISTS ( SELECT 1
                   FROM correspondence e
                  WHERE ((e.business_id = c.business_id) AND (e.direction = 'received'::text)
                    AND (e.entry_date > COALESCE(GREATEST(c.wp_modified, c.offer_confirmed_at), '-infinity'::timestamp with time zone))
                    AND (COALESCE(e.formatted_text_current, e.raw_text_original) ~* '(withdraw|remove (the|our) offer|no longer (offer|able to offer|run)|stop (the|our) (offer|discount)|change (the|our) offer|new offer|update (the|our) offer)'::text)))))) THEN 'offer_old'::text
                ELSE NULL::text
            END,
            CASE
                WHEN ((c.offer_ends IS NOT NULL) AND (c.offer_ends <= (td.d + 10))) THEN 'offer_ending'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (c.in_az_count = 0) THEN 'not_in_az'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (c.in_az_count > 1) THEN 'az_twice'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (c.map_count = 0) THEN 'not_on_map'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (cardinality(c.categories) = 0) THEN 'no_category'::text
                ELSE NULL::text
            END,
            CASE
                WHEN (cardinality(c.contact_mismatch) > 0) THEN 'contact_differs'::text
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
    ((cardinality(c.categories) > 0) AND (NOT (COALESCE(b.category, ''::text) = ANY (ARRAY( SELECT
                CASE x.x
                    WHEN 'Food & drink'::text THEN 'Food & Drink'::text
                    WHEN 'Health & beauty'::text THEN 'Health & Beauty'::text
                    WHEN 'Children'::text THEN 'For Children'::text
                    ELSE x.x
                END AS x
           FROM unnest(c.categories) x(x)))))) AS category_differs
   FROM ((checks c
     JOIN biz b ON ((b.id = c.business_id)))
     CROSS JOIN today td);

CREATE OR REPLACE VIEW public.v_business_attention WITH (security_invoker = true) AS
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
          WHERE ((b_1.merged_into IS NULL) AND (COALESCE(b_1.status, ''::text) <> 'Not a business'::text))
        ), money AS (
         SELECT l.business_id,
            sum(i.balance) AS amount,
            min(i.due_date) AS oldest_due,
            count(*) AS invoices,
            string_agg(COALESCE(i.doc_number, i.qbo_invoice_id), ', '::text ORDER BY i.due_date) AS docs
           FROM ((qbo_invoices i
             JOIN qbo_links l ON ((l.qbo_customer_id = i.qbo_customer_id)))
             CROSS JOIN today)
          WHERE ((i.balance > (0)::numeric) AND (COALESCE(i.private_memo, ''::text) <> 'Voided'::text) AND (i.due_date < today.d) AND (NOT (EXISTS ( SELECT 1
                   FROM care_exclusions e
                  WHERE ((e.business_id = l.business_id) AND (e.kind = ANY (ARRAY['all'::text, 'overdue'::text])))))) AND (NOT (EXISTS ( SELECT 1
                   FROM correspondence c
                  WHERE ((c.business_id = l.business_id) AND (c.direction = 'sent'::text) AND (c.entry_date > (now() - '7 days'::interval)) AND (((c.ai_metadata ->> 'source'::text) = 'quickbooks_notice'::text) OR (c.subject ~* '(invoice|payment|overdue|outstanding)'::text)))))) AND (NOT (EXISTS ( SELECT 1
                   FROM routine_drafts d
                  WHERE ((d.business_id = l.business_id) AND (d.kind = 'overdue'::text) AND (d.sent_at > (now() - '7 days'::interval)))))))
          GROUP BY l.business_id
        ), renewal AS (
         SELECT DISTINCT ON (s.business_id) s.business_id,
            s.id AS contract_id,
            s.membership_type,
            s.contract_end,
            s.contract_amount
           FROM ((contracts s
             JOIN biz b_1 ON ((b_1.id = s.business_id)))
             CROSS JOIN today)
          WHERE (s.is_current AND (s.membership_type = ANY (ARRAY['club_card'::text, 'advertiser'::text])) AND ((s.contract_end >= (today.d - 60)) AND (s.contract_end <= (today.d + 45))) AND (COALESCE(b_1.renewal_stage, 'not_started'::text) <> ALL (ARRAY['agreed'::text, 'invoice_paid'::text, 'not_renewing'::text])) AND (b_1.renewal_declined_at IS NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM contracts n
                  WHERE ((n.business_id = s.business_id) AND (n.id <> s.id) AND n.is_current AND (NOT (n.membership_type IS DISTINCT FROM s.membership_type)) AND (n.contract_end > s.contract_end))))) AND (NOT (EXISTS ( SELECT 1
                   FROM v_unrecorded_renewals u
                  WHERE (u.expiring_contract_id = s.id)))))
          ORDER BY s.business_id, s.contract_end
        ), waiting AS (
         SELECT r.business_id,
            count(*) AS emails,
            min(r.entry_date) AS oldest,
            (array_agg(r.id ORDER BY r.entry_date DESC))[1] AS latest_id,
            (array_agg(r.subject ORDER BY r.entry_date DESC))[1] AS latest_subject
           FROM ((biz b_1
             JOIN correspondence r ON ((r.business_id = b_1.id)))
             LEFT JOIN org_business_types t ON (((t.org_id = b_1.organization_id) AND (t.value = b_1.business_type))))
          WHERE ((r.direction = 'received'::text) AND (r.entry_date > (now() - '30 days'::interval)) AND (r.reply_dismissed_at IS NULL) AND (COALESCE((r.action_needed)::text, 'none'::text) <> 'waiting_on_them'::text) AND ((r.intent IS NULL) OR (r.intent = ANY (ARRAY['reply_needed'::text, 'money'::text, 'lead'::text, 'meeting'::text]))) AND (COALESCE(b_1.status, ''::text) <> 'Unreviewed'::text) AND (NOT COALESCE(b_1.mute_replies, false)) AND COALESCE(t.is_commercial, true) AND (NOT (EXISTS ( SELECT 1
                   FROM correspondence o
                  WHERE (((o.business_id = r.business_id) OR (r.business_id = ANY (o.linked_business_ids))) AND (o.direction = 'sent'::text) AND (o.entry_date > r.entry_date))))) AND email_needs_reply(r.subject, r.formatted_text_current))
          GROUP BY r.business_id
        ), todo_items AS (
         SELECT t.business_id,
            t.id,
            t.title,
            t.due_date,
            t.created_at
           FROM (tasks t
             CROSS JOIN today)
          WHERE ((t.status = 'open'::text) AND (t.source = 'manual'::text) AND (t.business_id IS NOT NULL) AND (t.due_date <= today.d))
        UNION ALL
         SELECT co.business_id,
            co.id,
            ('Follow up: '::text || COALESCE(NULLIF(co.subject, ''::text), '(no subject)'::text)),
            ((co.due_at AT TIME ZONE 'Europe/London'::text))::date AS timezone,
            co.created_at
           FROM (correspondence co
             CROSS JOIN today)
          WHERE (((co.action_needed)::text = 'follow_up'::text) AND (co.due_at IS NOT NULL) AND (((co.due_at AT TIME ZONE 'Europe/London'::text))::date <= today.d) AND (NOT (EXISTS ( SELECT 1
                   FROM correspondence c2
                  WHERE ((c2.business_id = co.business_id) AND (c2.direction = 'sent'::text) AND (c2.entry_date > co.entry_date))))))
        ), todo AS (
         SELECT todo_items.business_id,
            count(*) AS todos,
            min(todo_items.due_date) AS earliest_due,
            (array_agg(todo_items.id ORDER BY todo_items.due_date, todo_items.created_at))[1] AS first_id,
            (array_agg(todo_items.title ORDER BY todo_items.due_date, todo_items.created_at))[1] AS first_title
           FROM todo_items
          GROUP BY todo_items.business_id
        ), club_card AS (
         SELECT m_1.business_id,
            m_1.issues,
            ('page_lapsed'::text = ANY (m_1.issues)) AS lapsed,
            m_1.contract_end,
            m_1.offer_ends,
            m_1.wp_id
           FROM v_club_card_members m_1
          WHERE (cardinality(m_1.issues) > 0)
        )
 SELECT b.id AS business_id,
    b.organization_id,
    b.name AS business_name,
    b.status,
        CASE
            WHEN (m.business_id IS NOT NULL) THEN 1
            WHEN (rn.business_id IS NOT NULL) THEN 2
            WHEN cc.lapsed THEN 3
            WHEN (w.business_id IS NOT NULL) THEN 4
            WHEN (tk.business_id IS NOT NULL) THEN 5
            ELSE 6
        END AS priority,
        CASE
            WHEN (m.business_id IS NOT NULL) THEN 'money_owed'::text
            WHEN (rn.business_id IS NOT NULL) THEN 'renewal'::text
            WHEN cc.lapsed THEN 'club_card_lapsed'::text
            WHEN (w.business_id IS NOT NULL) THEN 'waiting_on_you'::text
            WHEN (tk.business_id IS NOT NULL) THEN 'todo'::text
            ELSE 'club_card'::text
        END AS reason,
        CASE
            WHEN (m.business_id IS NOT NULL) THEN ((((('£'::text || to_char(m.amount, 'FM999999990.00'::text)) || ' owed on '::text) || m.docs) || ', due '::text) || to_char((m.oldest_due)::timestamp with time zone, 'DD/MM/YYYY'::text))
            WHEN (rn.business_id IS NOT NULL) THEN ((
            CASE rn.membership_type
                WHEN 'club_card'::text THEN 'Club Card'::text
                ELSE 'Advertising'::text
            END ||
            CASE
                WHEN (rn.contract_end < td.d) THEN ' ended '::text
                ELSE ' ends '::text
            END) || to_char((rn.contract_end)::timestamp with time zone, 'DD/MM/YYYY'::text))
            WHEN cc.lapsed THEN ('Club Card page still live; card '::text || COALESCE(('ended '::text || to_char((cc.contract_end)::timestamp with time zone, 'DD/MM/YYYY'::text)), 'not renewing'::text))
            WHEN (w.business_id IS NOT NULL) THEN (COALESCE(NULLIF(w.latest_subject, ''::text), '(no subject)'::text) ||
            CASE
                WHEN (w.emails > 1) THEN ((' ('::text || w.emails) || ' emails)'::text)
                ELSE ''::text
            END)
            WHEN (tk.business_id IS NOT NULL) THEN (tk.first_title ||
            CASE
                WHEN (tk.todos > 1) THEN ((' (+'::text || (tk.todos - 1)) || ' more)'::text)
                ELSE ''::text
            END)
            ELSE ('Club Card page: '::text || array_to_string(ARRAY( SELECT
                    CASE i.i
                        WHEN 'page_no_member'::text THEN 'page but no Club Card on file'::text
                        WHEN 'no_page'::text THEN 'no page'::text
                        WHEN 'offer_old'::text THEN 'offer looks out of date'::text
                        WHEN 'offer_ending'::text THEN ('offer ends '::text || to_char((cc.offer_ends)::timestamp with time zone, 'DD/MM/YYYY'::text))
                        WHEN 'not_in_az'::text THEN 'not in the A-Z'::text
                        WHEN 'az_twice'::text THEN 'listed twice in the A-Z'::text
                        WHEN 'not_on_map'::text THEN 'not on the map'::text
                        WHEN 'no_category'::text THEN 'in no category'::text
                        WHEN 'contact_differs'::text THEN 'contact details differ'::text
                        ELSE i.i
                    END AS i
               FROM unnest(cc.issues) i(i)), ', '::text))
        END AS detail,
        CASE
            WHEN (m.business_id IS NOT NULL) THEN m.oldest_due
            WHEN (rn.business_id IS NOT NULL) THEN rn.contract_end
            WHEN cc.lapsed THEN cc.contract_end
            WHEN (w.business_id IS NOT NULL) THEN ((w.oldest AT TIME ZONE 'Europe/London'::text))::date
            WHEN (tk.business_id IS NOT NULL) THEN tk.earliest_due
            ELSE cc.offer_ends
        END AS since,
        CASE
            WHEN (m.business_id IS NOT NULL) THEN true
            WHEN (rn.business_id IS NOT NULL) THEN (rn.contract_end < td.d)
            WHEN cc.lapsed THEN false
            WHEN (w.business_id IS NOT NULL) THEN false
            WHEN (tk.business_id IS NOT NULL) THEN (tk.earliest_due < td.d)
            ELSE COALESCE((cc.offer_ends < td.d), false)
        END AS is_overdue,
        CASE
            WHEN (m.business_id IS NOT NULL) THEN m.docs
            WHEN (rn.business_id IS NOT NULL) THEN (rn.contract_id)::text
            WHEN cc.lapsed THEN (cc.wp_id)::text
            WHEN (w.business_id IS NOT NULL) THEN (w.latest_id)::text
            WHEN (tk.business_id IS NOT NULL) THEN (tk.first_id)::text
            ELSE (cc.wp_id)::text
        END AS ref_id,
    array_remove(ARRAY[
        CASE
            WHEN (m.business_id IS NOT NULL) THEN 'money_owed'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (rn.business_id IS NOT NULL) THEN 'renewal'::text
            ELSE NULL::text
        END,
        CASE
            WHEN cc.lapsed THEN 'club_card_lapsed'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (w.business_id IS NOT NULL) THEN 'waiting_on_you'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (tk.business_id IS NOT NULL) THEN 'todo'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((cc.business_id IS NOT NULL) AND (NOT cc.lapsed)) THEN 'club_card'::text
            ELSE NULL::text
        END], NULL::text) AS reasons,
    m.amount AS amount_owed,
    w.emails AS emails_waiting,
    tk.todos AS todos_due,
    b.attention_snoozed_until,
    COALESCE((b.attention_snoozed_until >= td.d), false) AS is_snoozed,
    cc.issues AS club_card_issues
   FROM ((((((biz b
     CROSS JOIN today td)
     LEFT JOIN money m ON ((m.business_id = b.id)))
     LEFT JOIN renewal rn ON ((rn.business_id = b.id)))
     LEFT JOIN waiting w ON ((w.business_id = b.id)))
     LEFT JOIN todo tk ON ((tk.business_id = b.id)))
     LEFT JOIN club_card cc ON ((cc.business_id = b.id)))
  WHERE ((m.business_id IS NOT NULL) OR (rn.business_id IS NOT NULL) OR (w.business_id IS NOT NULL) OR (tk.business_id IS NOT NULL) OR (cc.business_id IS NOT NULL));
