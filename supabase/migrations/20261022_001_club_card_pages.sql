-- Stage 6b of the UI overhaul: the Club Card pages on the website.
--
--   club_card_pages          one row per member page on chiswickcalendar.co.uk
--                            (children of page 97569, plus member pages the A-Z
--                            or the map link from elsewhere on the site). Filled
--                            nightly by /api/cron/club-card-pages from the public
--                            WordPress REST API and the public Google My Maps KML.
--                            Read-only towards the website: nothing is written back.
--                            Tom's own fields (business match, offer end date,
--                            "offer still right") are never overwritten by the sync.
--   club_card_sync_runs      one row per sync, with what it couldn't read
--   v_club_card_members      one row per Club Card member (card in force or ended
--                            within the 60-day grace), and per business with a
--                            live page, with its problems in `issues`:
--                              page_lapsed     card ended (past the grace) or not
--                                              renewing, page still live
--                              page_no_member  page matched to a business that has
--                                              never had a Club Card
--                              no_page         member with no page
--                              offer_old       no end date, not edited or confirmed
--                                              for 12 months
--                              offer_ending    end date within 10 days, or passed
--                              not_in_az / az_twice / not_on_map / no_category
--                              contact_differs page phone, postcode or website
--                                              differs from the app's
--   v_business_attention     two new reasons (Decision 22 Oct):
--                              3 club_card_lapsed  page_lapsed, just after renewal
--                              6 club_card         any other Club Card problem,
--                                                  after to-dos
--                            waiting_on_you moves 3 -> 4 and todo 4 -> 5; the rules
--                            for money_owed, renewal, waiting_on_you and todo are
--                            unchanged.
--   get_attention_count      counts the new reasons, and Club Card pages waiting
--                            for Tom to match (club_card_to_match, not in total)
--
-- Additive. Rollback: rollback/20261022_001_club_card_pages_rollback.sql

CREATE TABLE IF NOT EXISTS public.club_card_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  wp_id integer NOT NULL,
  slug text NOT NULL,
  link text NOT NULL,
  title text NOT NULL,
  wp_modified timestamptz,
  offer_text text,
  offer_ends_on date,
  page_address text,
  page_postcode text,
  page_phone text,
  page_phone_digits text,
  page_website text,
  page_website_host text,
  page_email text,
  in_az_count integer NOT NULL DEFAULT 0,
  in_latest_offers boolean NOT NULL DEFAULT false,
  map_count integer NOT NULL DEFAULT 0,
  map_folders text[] NOT NULL DEFAULT '{}',
  categories text[] NOT NULL DEFAULT '{}',
  outside_club_card_folder boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  gone_at timestamptz,
  -- Matching: the sync suggests, Tom confirms on the review page (or the sync is sure)
  match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'suggested', 'confirmed', 'not_a_member')),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  suggested_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  match_reason text,
  matched_by text,
  matched_at timestamptz,
  -- Tom's own: an end date the sync can't read ("Autumn 2026"), and "offer still right"
  offer_ends_set date,
  offer_confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, wp_id),
  CHECK (match_status <> 'confirmed' OR business_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS club_card_pages_business_idx ON public.club_card_pages (business_id) WHERE business_id IS NOT NULL;

COMMENT ON TABLE public.club_card_pages IS
  'Club Card member pages on chiswickcalendar.co.uk, read nightly from the public WordPress API (Stage 6b). Never written back to the website.';
COMMENT ON COLUMN public.club_card_pages.in_az_count IS 'Times the A-Z directory links this page (2+ = listed twice).';
COMMENT ON COLUMN public.club_card_pages.offer_ends_set IS 'Offer end date set by Tom where the page wording cannot be read. Wins over offer_ends_on.';
COMMENT ON COLUMN public.club_card_pages.offer_confirmed_at IS 'Tom confirmed the offer is still right; restarts the 12-month clock.';

CREATE TABLE IF NOT EXISTS public.club_card_sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ran_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  pages_seen integer,
  pages_new integer,
  pages_gone integer,
  auto_matched integer,
  -- Links in the A-Z or on the map that lead to no page, and anything that failed
  problems jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

ALTER TABLE public.club_card_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_card_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_card_pages_org ON public.club_card_pages;
CREATE POLICY club_card_pages_org ON public.club_card_pages TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS club_card_sync_runs_org ON public.club_card_sync_runs;
CREATE POLICY club_card_sync_runs_org ON public.club_card_sync_runs FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

REVOKE ALL ON public.club_card_pages, public.club_card_sync_runs FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.club_card_pages TO authenticated;
GRANT SELECT ON public.club_card_sync_runs TO authenticated;
GRANT ALL ON public.club_card_pages, public.club_card_sync_runs TO service_role;

-- UK phone to bare national digits, the same rule as normalisePhone() in lib/club-card/parse.ts
CREATE OR REPLACE FUNCTION public.cc_phone_digits(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN length(d) >= 10 THEN d END
  FROM (SELECT CASE WHEN x LIKE '44%' THEN '0' || substr(x, 3)
                    WHEN x LIKE '00%' THEN substr(x, 2) ELSE x END AS d
        FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS x) s) t
$$;

-- A UK postcode in any text, upper case with one space; the same rule as normalisePostcode()
CREATE OR REPLACE FUNCTION public.cc_postcode(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT upper(m[1] || ' ' || m[2])
  FROM (SELECT regexp_match(coalesce(p, ''), '\m([A-Za-z]{1,2}\d[A-Za-z\d]?)\s*(\d[A-Za-z]{2})\M') AS m) s
$$;

CREATE OR REPLACE VIEW public.v_club_card_members WITH (security_invoker = true) AS
WITH today AS (
  SELECT public.cc_today() AS d
),
biz AS (
  SELECT b.* FROM public.businesses b
  WHERE b.merged_into IS NULL
    AND coalesce(b.status, '') <> 'Not a business'
),
-- The latest Club Card contract, current or former
card AS (
  SELECT DISTINCT ON (c.business_id)
         c.business_id, c.id AS contract_id, c.membership_type, c.contract_start, c.contract_end, c.is_current
  FROM public.contracts c
  WHERE c.membership_type IN ('club_card', 'former_club_card')
  ORDER BY c.business_id, (c.membership_type = 'club_card' AND c.is_current) DESC,
           c.contract_end DESC NULLS FIRST, c.created_at DESC
),
state AS (
  SELECT b.id AS business_id,
         k.contract_id, k.contract_start, k.contract_end,
         CASE
           WHEN k.business_id IS NULL THEN 'none'
           -- A card that hasn't ended yet still counts, even if it won't be renewed
           WHEN k.contract_end >= td.d THEN 'member'
           WHEN k.contract_end IS NULL AND k.membership_type = 'club_card' AND k.is_current THEN 'member'
           WHEN k.membership_type = 'club_card' AND k.is_current
                AND k.contract_end >= td.d - 60
                AND coalesce(b.renewal_stage, '') <> 'not_renewing'
                AND b.renewal_declined_at IS NULL THEN 'grace'
           ELSE 'lapsed'
         END AS card_state
  FROM biz b
  CROSS JOIN today td
  LEFT JOIN card k ON k.business_id = b.id
),
live_pages AS (
  SELECT p.* FROM public.club_card_pages p
  WHERE p.match_status = 'confirmed' AND p.gone_at IS NULL AND p.business_id IS NOT NULL
),
page AS (
  SELECT DISTINCT ON (p.business_id) p.*, count(*) OVER (PARTITION BY p.business_id) AS live_page_count
  FROM live_pages p
  ORDER BY p.business_id, p.wp_modified DESC NULLS LAST
),
app_phones AS (
  SELECT x.business_id, array_agg(DISTINCT x.digits) AS digits
  FROM (
    SELECT b.id AS business_id, public.cc_phone_digits(b.phone) AS digits FROM biz b
    UNION ALL
    SELECT c.business_id, public.cc_phone_digits(ph.value #>> '{}')
    FROM public.contacts c
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.phones) = 'array' THEN c.phones ELSE '[]'::jsonb END) ph
  ) x
  WHERE x.digits IS NOT NULL
  GROUP BY x.business_id
),
app_domains AS (
  SELECT dm.business_id, array_agg(DISTINCT lower(regexp_replace(dm.domain, '^www\.', ''))) AS hosts
  FROM public.domain_mappings dm
  WHERE dm.business_id IS NOT NULL
  GROUP BY dm.business_id
),
checks AS (
  SELECT s.business_id, s.card_state, s.contract_id, s.contract_start, s.contract_end,
         p.id AS page_id, p.wp_id, p.link AS page_link, p.title AS page_title, p.offer_text,
         p.wp_modified, p.offer_confirmed_at, coalesce(p.live_page_count, 0) AS live_page_count,
         coalesce(p.offer_ends_set, p.offer_ends_on) AS offer_ends,
         p.in_az_count, p.map_count, p.map_folders, p.categories, p.in_latest_offers,
         p.page_address, p.page_phone, p.page_website, p.page_email,
         -- Each differs only where both the page and the app have a value
         array_remove(ARRAY[
           CASE WHEN p.page_phone_digits IS NOT NULL AND ph.digits IS NOT NULL
                 AND NOT p.page_phone_digits = ANY (ph.digits) THEN 'phone' END,
           CASE WHEN p.page_postcode IS NOT NULL AND public.cc_postcode(b.address) IS NOT NULL
                 AND p.page_postcode <> public.cc_postcode(b.address) THEN 'postcode' END,
           CASE WHEN p.page_website_host IS NOT NULL AND dm.hosts IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM unnest(dm.hosts) h
                                 WHERE p.page_website_host = h OR p.page_website_host LIKE '%.' || h
                                    OR h LIKE '%.' || p.page_website_host) THEN 'website' END
         ], NULL) AS contact_mismatch
  FROM state s
  JOIN biz b ON b.id = s.business_id
  LEFT JOIN page p ON p.business_id = s.business_id
  LEFT JOIN app_phones ph ON ph.business_id = s.business_id
  LEFT JOIN app_domains dm ON dm.business_id = s.business_id
  WHERE s.card_state IN ('member', 'grace') OR p.id IS NOT NULL
)
SELECT b.id AS business_id,
       b.organization_id,
       b.name AS business_name,
       c.card_state,
       c.contract_id,
       c.contract_start,
       c.contract_end,
       c.page_id, c.wp_id, c.page_link, c.page_title, c.offer_text, c.offer_ends,
       c.wp_modified, c.offer_confirmed_at, c.live_page_count,
       c.in_az_count, c.map_count, c.map_folders, c.categories, c.in_latest_offers,
       c.page_address, c.page_phone, c.page_website, c.page_email,
       c.contact_mismatch,
       CASE
         WHEN c.page_id IS NOT NULL AND c.card_state = 'lapsed' THEN ARRAY['page_lapsed']
         WHEN c.page_id IS NOT NULL AND c.card_state = 'none' THEN ARRAY['page_no_member']
         WHEN c.page_id IS NULL THEN ARRAY['no_page']
         ELSE array_remove(ARRAY[
           CASE WHEN c.offer_ends IS NULL
                 AND greatest(c.wp_modified, c.offer_confirmed_at) < (td.d - interval '12 months')
                THEN 'offer_old' END,
           CASE WHEN c.offer_ends IS NOT NULL AND c.offer_ends <= td.d + 10 THEN 'offer_ending' END,
           CASE WHEN c.in_az_count = 0 THEN 'not_in_az' END,
           CASE WHEN c.in_az_count > 1 THEN 'az_twice' END,
           CASE WHEN c.map_count = 0 THEN 'not_on_map' END,
           CASE WHEN cardinality(c.categories) = 0 THEN 'no_category' END,
           CASE WHEN cardinality(c.contact_mismatch) > 0 THEN 'contact_differs' END
         ], NULL)
       END AS issues
FROM checks c
JOIN biz b ON b.id = c.business_id
CROSS JOIN today td;

COMMENT ON VIEW public.v_club_card_members IS
  'Club Card members and businesses with a live Club Card page, with page problems in issues. See docs/ui-overhaul-plan.md, Club Card tab (Stage 6b).';

REVOKE ALL ON public.v_club_card_members FROM PUBLIC, anon;
GRANT SELECT ON public.v_club_card_members TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cc_phone_digits(text), public.cc_postcode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cc_phone_digits(text), public.cc_postcode(text) TO authenticated, service_role;

-- Needs attention, with the two Club Card reasons. Every CTE before club_card
-- is unchanged from 20261021_004.
CREATE OR REPLACE VIEW public.v_business_attention WITH (security_invoker = true) AS
WITH today AS (
  SELECT public.cc_today() AS d
),
biz AS (
  SELECT b.* FROM public.businesses b
  WHERE b.merged_into IS NULL
    AND coalesce(b.status, '') <> 'Not a business'
),
money AS (
  SELECT l.business_id,
         sum(i.balance) AS amount,
         min(i.due_date) AS oldest_due,
         count(*) AS invoices,
         string_agg(coalesce(i.doc_number, i.qbo_invoice_id), ', ' ORDER BY i.due_date) AS docs
  FROM public.qbo_invoices i
  JOIN public.qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
  CROSS JOIN today
  WHERE i.balance > 0
    AND coalesce(i.private_memo, '') <> 'Voided'
    AND i.due_date < today.d
    AND NOT EXISTS (SELECT 1 FROM public.care_exclusions e
                    WHERE e.business_id = l.business_id AND e.kind IN ('all', 'overdue'))
    -- A chaser in the last 7 days rests it: Tom's own, a QuickBooks reminder or a routine's
    AND NOT EXISTS (SELECT 1 FROM public.correspondence c
                    WHERE c.business_id = l.business_id AND c.direction = 'sent'
                      AND c.entry_date > now() - interval '7 days'
                      AND (c.ai_metadata->>'source' = 'quickbooks_notice'
                           OR c.subject ~* '(invoice|payment|overdue|outstanding)'))
    AND NOT EXISTS (SELECT 1 FROM public.routine_drafts d
                    WHERE d.business_id = l.business_id AND d.kind = 'overdue'
                      AND d.sent_at > now() - interval '7 days')
  GROUP BY l.business_id
),
renewal AS (
  SELECT DISTINCT ON (s.business_id)
         s.business_id, s.id AS contract_id, s.membership_type, s.contract_end, s.contract_amount
  FROM public.contracts s
  JOIN biz b ON b.id = s.business_id
  CROSS JOIN today
  WHERE s.is_current
    AND s.membership_type IN ('club_card', 'advertiser')
    AND s.contract_end BETWEEN today.d - 60 AND today.d + 45
    AND coalesce(b.renewal_stage, 'not_started') NOT IN ('agreed', 'invoice_paid', 'not_renewing')
    AND b.renewal_declined_at IS NULL
    -- Renewed: a later contract of the same kind, or QuickBooks has invoiced the new term
    AND NOT EXISTS (SELECT 1 FROM public.contracts n
                    WHERE n.business_id = s.business_id AND n.id <> s.id AND n.is_current
                      AND n.membership_type IS NOT DISTINCT FROM s.membership_type
                      AND n.contract_end > s.contract_end)
    AND NOT EXISTS (SELECT 1 FROM public.v_unrecorded_renewals u WHERE u.expiring_contract_id = s.id)
  ORDER BY s.business_id, s.contract_end
),
waiting AS (
  SELECT r.business_id,
         count(*) AS emails,
         min(r.entry_date) AS oldest,
         (array_agg(r.id ORDER BY r.entry_date DESC))[1] AS latest_id,
         (array_agg(r.subject ORDER BY r.entry_date DESC))[1] AS latest_subject
  FROM biz b
  JOIN public.correspondence r ON r.business_id = b.id
  LEFT JOIN public.org_business_types t
         ON t.org_id = b.organization_id AND t.value = b.business_type
  WHERE r.direction = 'received'
    AND r.entry_date > now() - interval '30 days'
    AND r.reply_dismissed_at IS NULL
    AND coalesce(r.action_needed::text, 'none') <> 'waiting_on_them'
    -- Where a routine has tagged the email, the tag says whether it wants a reply:
    -- newsletters, press releases (editorial has its own list), FYIs, thank-yous
    -- and agreements don't. Untagged email is left to the scoring below.
    AND (r.intent IS NULL OR r.intent IN ('reply_needed', 'money', 'lead', 'meeting'))
    AND coalesce(b.status, '') <> 'Unreviewed'
    AND NOT coalesce(b.mute_replies, false)
    AND coalesce(t.is_commercial, true)
    AND NOT EXISTS (SELECT 1 FROM public.correspondence o
                    WHERE (o.business_id = r.business_id OR r.business_id = ANY (o.linked_business_ids))
                      AND o.direction = 'sent'
                      AND o.entry_date > r.entry_date)
    AND public.email_needs_reply(r.subject, r.formatted_text_current)
  GROUP BY r.business_id
),
todo_items AS (
  SELECT t.business_id, t.id, t.title, t.due_date, t.created_at
  FROM public.tasks t
  CROSS JOIN today
  WHERE t.status = 'open' AND t.source = 'manual'
    AND t.business_id IS NOT NULL
    AND t.due_date <= today.d
  UNION ALL
  -- Tom's one-click "Follow-up" flag on an email is a to-do he set himself.
  -- The automatic 'prospect' and 'invoice' flags on outreach emails are not.
  SELECT co.business_id, co.id,
         'Follow up: ' || coalesce(nullif(co.subject, ''), '(no subject)'),
         (co.due_at AT TIME ZONE 'Europe/London')::date, co.created_at
  FROM public.correspondence co
  CROSS JOIN today
  WHERE co.action_needed::text = 'follow_up'
    AND co.due_at IS NOT NULL
    AND (co.due_at AT TIME ZONE 'Europe/London')::date <= today.d
    AND NOT EXISTS (SELECT 1 FROM public.correspondence c2
                    WHERE c2.business_id = co.business_id AND c2.direction = 'sent'
                      AND c2.entry_date > co.entry_date)
),
todo AS (
  SELECT business_id,
         count(*) AS todos,
         min(due_date) AS earliest_due,
         (array_agg(id ORDER BY due_date, created_at))[1] AS first_id,
         (array_agg(title ORDER BY due_date, created_at))[1] AS first_title
  FROM todo_items
  GROUP BY business_id
)
,
club_card AS (
  SELECT m.business_id,
         m.issues,
         'page_lapsed' = ANY (m.issues) AS lapsed,
         m.contract_end,
         m.offer_ends,
         m.wp_id
  FROM public.v_club_card_members m
  WHERE cardinality(m.issues) > 0
)
SELECT b.id AS business_id,
       b.organization_id,
       b.name AS business_name,
       b.status,
       CASE WHEN m.business_id IS NOT NULL THEN 1
            WHEN rn.business_id IS NOT NULL THEN 2
            WHEN cc.lapsed THEN 3
            WHEN w.business_id IS NOT NULL THEN 4
            WHEN tk.business_id IS NOT NULL THEN 5
            ELSE 6 END AS priority,
       CASE WHEN m.business_id IS NOT NULL THEN 'money_owed'
            WHEN rn.business_id IS NOT NULL THEN 'renewal'
            WHEN cc.lapsed THEN 'club_card_lapsed'
            WHEN w.business_id IS NOT NULL THEN 'waiting_on_you'
            WHEN tk.business_id IS NOT NULL THEN 'todo'
            ELSE 'club_card' END AS reason,
       CASE WHEN m.business_id IS NOT NULL THEN
              '£' || to_char(m.amount, 'FM999999990.00') || ' owed on ' || m.docs
              || ', due ' || to_char(m.oldest_due, 'DD/MM/YYYY')
            WHEN rn.business_id IS NOT NULL THEN
              CASE rn.membership_type WHEN 'club_card' THEN 'Club Card' ELSE 'Advertising' END
              || CASE WHEN rn.contract_end < td.d THEN ' ended ' ELSE ' ends ' END
              || to_char(rn.contract_end, 'DD/MM/YYYY')
            WHEN cc.lapsed THEN
              'Club Card page still live; card '
              || coalesce('ended ' || to_char(cc.contract_end, 'DD/MM/YYYY'), 'not renewing')
            WHEN w.business_id IS NOT NULL THEN
              coalesce(nullif(w.latest_subject, ''), '(no subject)')
              || CASE WHEN w.emails > 1 THEN ' (' || w.emails || ' emails)' ELSE '' END
            WHEN tk.business_id IS NOT NULL THEN
              tk.first_title || CASE WHEN tk.todos > 1 THEN ' (+' || (tk.todos - 1) || ' more)' ELSE '' END
            ELSE
              'Club Card page: ' || array_to_string(ARRAY(
                SELECT CASE i
                  WHEN 'page_no_member' THEN 'page but no Club Card on file'
                  WHEN 'no_page' THEN 'no page'
                  WHEN 'offer_old' THEN 'offer not checked for a year'
                  WHEN 'offer_ending' THEN 'offer ends ' || to_char(cc.offer_ends, 'DD/MM/YYYY')
                  WHEN 'not_in_az' THEN 'not in the A-Z'
                  WHEN 'az_twice' THEN 'listed twice in the A-Z'
                  WHEN 'not_on_map' THEN 'not on the map'
                  WHEN 'no_category' THEN 'in no category'
                  WHEN 'contact_differs' THEN 'contact details differ'
                  ELSE i END
                FROM unnest(cc.issues) i), ', ')
       END AS detail,
       -- The date that drives the item: invoice due, contract end, oldest unanswered email,
       -- to-do date; for Club Card, the card's end or the offer's end
       CASE WHEN m.business_id IS NOT NULL THEN m.oldest_due
            WHEN rn.business_id IS NOT NULL THEN rn.contract_end
            WHEN cc.lapsed THEN cc.contract_end
            WHEN w.business_id IS NOT NULL THEN (w.oldest AT TIME ZONE 'Europe/London')::date
            WHEN tk.business_id IS NOT NULL THEN tk.earliest_due
            ELSE cc.offer_ends END AS since,
       -- Overdue only where there is a real deadline (Definitions)
       CASE WHEN m.business_id IS NOT NULL THEN true
            WHEN rn.business_id IS NOT NULL THEN rn.contract_end < td.d
            WHEN cc.lapsed THEN false
            WHEN w.business_id IS NOT NULL THEN false
            WHEN tk.business_id IS NOT NULL THEN tk.earliest_due < td.d
            ELSE coalesce(cc.offer_ends < td.d, false) END AS is_overdue,
       CASE WHEN m.business_id IS NOT NULL THEN m.docs
            WHEN rn.business_id IS NOT NULL THEN rn.contract_id::text
            WHEN cc.lapsed THEN cc.wp_id::text
            WHEN w.business_id IS NOT NULL THEN w.latest_id::text
            WHEN tk.business_id IS NOT NULL THEN tk.first_id::text
            ELSE cc.wp_id::text END AS ref_id,
       array_remove(ARRAY[
         CASE WHEN m.business_id IS NOT NULL THEN 'money_owed' END,
         CASE WHEN rn.business_id IS NOT NULL THEN 'renewal' END,
         CASE WHEN cc.lapsed THEN 'club_card_lapsed' END,
         CASE WHEN w.business_id IS NOT NULL THEN 'waiting_on_you' END,
         CASE WHEN tk.business_id IS NOT NULL THEN 'todo' END,
         CASE WHEN cc.business_id IS NOT NULL AND NOT cc.lapsed THEN 'club_card' END
       ], NULL) AS reasons,
       m.amount AS amount_owed,
       w.emails AS emails_waiting,
       tk.todos AS todos_due,
       b.attention_snoozed_until,
       coalesce(b.attention_snoozed_until >= td.d, false) AS is_snoozed,
       cc.issues AS club_card_issues
FROM biz b
CROSS JOIN today td
LEFT JOIN money m    ON m.business_id = b.id
LEFT JOIN renewal rn ON rn.business_id = b.id
LEFT JOIN waiting w  ON w.business_id = b.id
LEFT JOIN todo tk    ON tk.business_id = b.id
LEFT JOIN club_card cc ON cc.business_id = b.id
WHERE m.business_id IS NOT NULL OR rn.business_id IS NOT NULL
   OR w.business_id IS NOT NULL OR tk.business_id IS NOT NULL
   OR cc.business_id IS NOT NULL;

COMMENT ON VIEW public.v_business_attention IS
  'Needs attention: one top reason per business (money_owed, renewal, club_card_lapsed, waiting_on_you, todo, club_card), worked out live. See docs/ui-overhaul-plan.md, Definitions.';

CREATE OR REPLACE FUNCTION public.get_attention_count(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH org AS (
    SELECT coalesce(p_org_id, (SELECT organization_id FROM user_profiles WHERE id = auth.uid())) AS id
  ),
  a AS (
    SELECT v.* FROM v_business_attention v, org WHERE v.organization_id = org.id
  ),
  loose AS (
    SELECT count(*) AS n FROM tasks t, org
    WHERE t.organization_id = org.id AND t.status = 'open' AND t.source = 'manual'
      AND t.business_id IS NULL AND t.due_date <= cc_today()
  )
  SELECT jsonb_build_object(
    'today',          cc_today(),
    'total',          (SELECT count(*) FROM a WHERE NOT is_snoozed) + (SELECT n FROM loose),
    'businesses',     (SELECT count(*) FROM a WHERE NOT is_snoozed),
    'money_owed',     (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'money_owed'),
    'renewal',        (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'renewal'),
    'club_card_lapsed', (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'club_card_lapsed'),
    'waiting_on_you', (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'waiting_on_you'),
    'todo',           (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'todo'),
    'club_card',      (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'club_card'),
    'unlinked_todos', (SELECT n FROM loose),
    'snoozed',        (SELECT count(*) FROM a WHERE is_snoozed),
    'club_card_to_match', (SELECT count(*) FROM club_card_pages p, org
                           WHERE p.organization_id = org.id AND p.gone_at IS NULL
                             AND p.match_status IN ('unmatched', 'suggested'))
  )
$$;

-- CREATE OR REPLACE VIEW keeps the grants; restated so the file stands alone.
REVOKE ALL ON public.v_business_attention FROM PUBLIC, anon;
GRANT SELECT ON public.v_business_attention TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_attention_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attention_count(uuid) TO authenticated, service_role;
