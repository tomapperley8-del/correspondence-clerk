-- Stage 11c (trimmed, Decision 29 Oct): Data health, win-backs and category gaps.
-- docs/ui-overhaul-plan.md, "One source of truth (Stage 11)" parts 2 and 3.
--
-- v_data_health          one row per thing to fix: check_key, business, a date or contract where
--                        it helps. Quiet when nothing has drifted.
-- v_data_health_counts   one row per check per organisation, zero included, with where it is
--                        fixed, so the desk email or a routine can read the numbers.
-- v_outreach_winbacks    former members and advertisers not in an open conversation, scored by
--                        how recently and how much Tom dealt with them.
-- v_category_gaps        Club Card members per category (the seven), thin = fewer than 5.
-- v_category_gap_prospects  businesses in a thin category that could fill it, best fit first.
--
-- New views only: nothing existing is changed, so no other reader is affected. All security
-- invoker, explicit grants.

-- Checks (Tom's defaults, 29 Oct): hidden records (Not a business, merged) left out; the
-- named-contact check covers Active businesses only.
CREATE OR REPLACE VIEW public.v_data_health WITH (security_invoker = true) AS
WITH live AS (
  SELECT v.* FROM public.v_businesses v
  WHERE v.merged_into IS NULL AND COALESCE(v.status, '') <> 'Not a business'
)
-- 1. Club Card shown, but no card in force or in grace (the deal is still marked current)
SELECT b.organization_id, 'club_card_no_card'::text AS check_key, b.id AS business_id, b.name AS business_name,
  b.current_contract_id AS contract_id,
  (SELECT max(c.contract_end) FROM public.contracts c WHERE c.business_id = b.id AND c.membership_type = 'club_card') AS ref_date,
  m.card_state AS detail
FROM live b
LEFT JOIN public.v_club_card_members m ON m.business_id = b.id
WHERE b.is_club_card AND COALESCE(m.card_state, 'none') NOT IN ('member', 'grace')
UNION ALL
-- 2. A deal in force or in grace with no QuickBooks link
SELECT b.organization_id, 'deal_no_quickbooks', b.id, b.name, c.id, c.contract_end, c.membership_type
FROM public.contracts c
JOIN live b ON b.id = c.business_id
WHERE c.is_current
  AND (c.contract_end IS NULL OR c.contract_end >= public.cc_today() - 60)
  AND c.qbo_invoice_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.qbo_links l WHERE l.business_id = c.business_id)
UNION ALL
-- 3. An Active business with no named, active contact
SELECT b.organization_id, 'active_no_named_contact', b.id, b.name, b.current_contract_id, NULL::date, b.deal_state
FROM live b
WHERE b.status = 'Active' AND COALESCE(b.is_commercial, true)
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts ct
    WHERE ct.business_id = b.id AND COALESCE(ct.is_active, true) AND NOT COALESCE(ct.name_is_placeholder, false))
UNION ALL
-- 4. Stored status or last in touch differs from the worked-out one (v_businesses)
SELECT b.organization_id, 'stored_out_of_step', b.id, b.name, NULL::uuid, b.last_contacted_at_stored::date,
  concat_ws(', ',
    CASE WHEN b.status IS DISTINCT FROM b.status_stored THEN 'status' END,
    CASE WHEN b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored THEN 'last_in_touch' END)
FROM live b
WHERE b.status IS DISTINCT FROM b.status_stored OR b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored;

CREATE OR REPLACE VIEW public.v_data_health_counts WITH (security_invoker = true) AS
WITH checks(sort, check_key, title, fixed_on) AS (
  VALUES
    (1, 'club_card_no_card', 'Club Card shown, no card in force', '/data-health'),
    (2, 'deal_no_quickbooks', 'Deal with no QuickBooks link', '/data-health'),
    (3, 'active_no_named_contact', 'Active business with no named contact', '/data-health'),
    (4, 'stored_out_of_step', 'Stored status or last in touch out of step', '/data-health'),
    (5, 'club_card_website', 'Club Card members with a website problem', '/club-card?show=problems'),
    (6, 'club_card_pages_to_match', 'Club Card website pages waiting to be matched', '/club-card'),
    (7, 'newsletter_unclear', 'Unclear newsletter mentions', '/newsletter?view=check')
),
n AS (
  SELECT organization_id, check_key, count(*) AS n FROM public.v_data_health GROUP BY 1, 2
  UNION ALL
  SELECT organization_id, 'club_card_website', count(*) FROM public.v_club_card_members
  WHERE cardinality(COALESCE(issues, '{}')) > 0 GROUP BY 1
  UNION ALL
  SELECT organization_id, 'club_card_pages_to_match', count(*) FROM public.club_card_pages
  WHERE gone_at IS NULL AND match_status IN ('unmatched', 'suggested') GROUP BY 1
  UNION ALL
  SELECT organization_id, 'newsletter_unclear', count(*) FROM public.newsletter_mentions
  WHERE status = 'unclear' GROUP BY 1
)
SELECT o.id AS organization_id, k.sort, k.check_key, k.title, k.fixed_on, COALESCE(n.n, 0)::int AS n
FROM public.organizations o
CROSS JOIN checks k
LEFT JOIN n ON n.organization_id = o.id AND n.check_key = k.check_key;

-- Win-backs: Former (Stage 11a status), commercial, not merged, and not in an open conversation
-- (no outreach stage, or Identified). Not interested and "Not a win-back"
-- (outreach_suggestion_dismissals) leave the list. A "Not now" (outreach_snoozes) in force gives
-- snoozed_until; it ends early if they email after it was set, as in v_outreach_next.
-- Points: dealt with (latest deal end, invoice or email) in the last year +3, in the last two
-- years +2; paid £500 or more +2, anything paid +1; 20 or more emails +1.
CREATE OR REPLACE VIEW public.v_outreach_winbacks WITH (security_invoker = true) AS
WITH f AS (
  SELECT v.id, v.organization_id, v.name, v.category, v.outreach_stage, v.main_contact_id,
    v.last_contacted_at::date AS last_email_on
  FROM public.v_businesses v
  WHERE v.merged_into IS NULL AND v.status = 'Former' AND COALESCE(v.is_commercial, true)
    AND (v.outreach_stage IS NULL OR v.outreach_stage = 'identified')
    AND NOT EXISTS (SELECT 1 FROM public.outreach_suggestion_dismissals x WHERE x.business_id = v.id)
),
deals AS (
  SELECT c.business_id, count(*) AS deals, max(c.contract_end) AS last_deal_end,
    COALESCE(sum(c.contract_amount), 0) AS deal_total,
    (array_agg(c.membership_type ORDER BY c.contract_end DESC NULLS LAST))[1] AS last_deal_type
  FROM public.contracts c WHERE c.business_id IN (SELECT id FROM f) GROUP BY 1
),
inv AS (
  SELECT l.business_id, COALESCE(sum(i.total_amount), 0) AS invoiced, max(i.txn_date) AS last_invoice_on
  FROM public.qbo_links l
  JOIN public.qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id AND i.organization_id = l.organization_id AND i.voided_at IS NULL
  WHERE l.business_id IN (SELECT id FROM f) GROUP BY 1
),
mail AS (
  SELECT c.business_id, count(*) AS emails,
    max(c.entry_date) FILTER (WHERE c.direction = 'received') AS last_received_at
  FROM public.correspondence c
  WHERE c.business_id IN (SELECT id FROM f) AND c.type IS DISTINCT FROM 'Draft'
  GROUP BY 1
),
s AS (
  SELECT f.*, COALESCE(d.deals, 0) AS deals, d.last_deal_end, d.last_deal_type,
    GREATEST(COALESCE(d.deal_total, 0), COALESCE(i.invoiced, 0)) AS paid_total,
    i.last_invoice_on, COALESCE(m.emails, 0) AS emails,
    GREATEST(d.last_deal_end, i.last_invoice_on, f.last_email_on) AS last_dealt_on,
    sn.snoozed_until
  FROM f
  LEFT JOIN deals d ON d.business_id = f.id
  LEFT JOIN inv i ON i.business_id = f.id
  LEFT JOIN mail m ON m.business_id = f.id
  LEFT JOIN public.outreach_snoozes sn
    ON sn.business_id = f.id AND sn.snoozed_until > public.cc_today()
   AND NOT (m.last_received_at IS NOT NULL AND m.last_received_at > sn.snoozed_at)
),
p AS (
  SELECT s.*,
    CASE WHEN s.last_dealt_on >= public.cc_today() - 365 THEN 3
         WHEN s.last_dealt_on >= public.cc_today() - 730 THEN 2 ELSE 0 END AS pts_recent,
    CASE WHEN s.paid_total >= 500 THEN 2 WHEN s.paid_total > 0 THEN 1 ELSE 0 END AS pts_paid,
    CASE WHEN s.emails >= 20 THEN 1 ELSE 0 END AS pts_emails
  FROM s
)
SELECT p.id AS business_id, p.organization_id, p.name, p.category, p.outreach_stage, p.main_contact_id,
  p.deals, p.last_deal_end, p.last_deal_type, p.paid_total, p.last_invoice_on, p.emails, p.last_email_on,
  p.last_dealt_on, p.pts_recent, p.pts_paid, p.pts_emails,
  (p.pts_recent + p.pts_paid + p.pts_emails) AS score,
  p.snoozed_until,
  row_number() OVER (PARTITION BY p.organization_id
    ORDER BY (p.snoozed_until IS NOT NULL), (p.pts_recent + p.pts_paid + p.pts_emails) DESC,
             p.last_dealt_on DESC NULLS LAST, p.paid_total DESC, p.name) AS winback_order
FROM p;

-- Category gaps: Club Card members in force or in grace per category (the seven, lib/categories.ts).
CREATE OR REPLACE VIEW public.v_category_gaps WITH (security_invoker = true) AS
WITH cats(sort, category) AS (
  VALUES (1, 'Food & Drink'), (2, 'Health & Beauty'), (3, 'Retail'), (4, 'Entertainment'),
         (5, 'Activities'), (6, 'Services'), (7, 'For Children')
),
m AS (
  SELECT v.organization_id, v.category, count(*) AS members
  FROM public.v_club_card_members cm
  JOIN public.v_businesses v ON v.id = cm.business_id
  WHERE cm.card_state IN ('member', 'grace') AND v.merged_into IS NULL
  GROUP BY 1, 2
)
SELECT o.id AS organization_id, c.sort, c.category, COALESCE(m.members, 0)::int AS members,
  (COALESCE(m.members, 0) < 5) AS is_thin
FROM public.organizations o
CROSS JOIN cats c
LEFT JOIN m ON m.organization_id = o.id AND m.category = c.category;

-- Who could fill a thin category: commercial, not merged, Prospect, Former or Unreviewed, not in an
-- open conversation (no stage, or Identified), not dismissed; best fit first (v_outreach_signals).
CREATE OR REPLACE VIEW public.v_category_gap_prospects WITH (security_invoker = true) AS
SELECT v.id AS business_id, v.organization_id, v.name, v.category, v.status, v.outreach_stage, v.main_contact_id,
  v.last_contacted_at::date AS last_email_on,
  s.fit_score, s.has_named_contact, s.has_email, s.wrote_before, s.in_news, s.had_deal,
  sn.snoozed_until,
  row_number() OVER (PARTITION BY v.organization_id, v.category
    ORDER BY (sn.snoozed_until IS NOT NULL), s.fit_score DESC, v.last_contacted_at DESC NULLS LAST, v.name) AS gap_order
FROM public.v_businesses v
JOIN public.v_category_gaps g ON g.organization_id = v.organization_id AND g.category = v.category AND g.is_thin
JOIN public.v_outreach_signals s ON s.business_id = v.id
LEFT JOIN public.outreach_snoozes sn ON sn.business_id = v.id AND sn.snoozed_until > public.cc_today()
WHERE v.merged_into IS NULL AND COALESCE(v.is_commercial, true)
  AND v.status IN ('Prospect', 'Former', 'Unreviewed')
  AND (v.outreach_stage IS NULL OR v.outreach_stage = 'identified')
  AND NOT EXISTS (SELECT 1 FROM public.outreach_suggestion_dismissals x WHERE x.business_id = v.id);

GRANT SELECT ON public.v_data_health, public.v_data_health_counts, public.v_outreach_winbacks,
  public.v_category_gaps, public.v_category_gap_prospects TO authenticated, service_role;
