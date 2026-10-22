-- Stage 6b fix: "no page" waits for the website to have been read, and isn't
-- flagged while a page suggested for the business waits on Tom's matching page.
-- Applied live, the first version flagged all 54 members as "no page" before
-- any page had been read. Only v_club_card_members changes (same columns).
-- Rollback: rerun the v_club_card_members part of 20261022_001_club_card_pages.sql.

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
         -- No page: only once the website has been read, and not while a page
         -- suggested for this business waits on the matching page
         WHEN c.page_id IS NULL THEN
           CASE WHEN EXISTS (SELECT 1 FROM public.club_card_sync_runs r
                             WHERE r.organization_id = b.organization_id AND r.ok)
                 AND NOT EXISTS (SELECT 1 FROM public.club_card_pages p
                                 WHERE p.suggested_business_id = c.business_id AND p.gone_at IS NULL
                                   AND p.match_status IN ('unmatched', 'suggested'))
                THEN ARRAY['no_page'] ELSE ARRAY[]::text[] END
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

