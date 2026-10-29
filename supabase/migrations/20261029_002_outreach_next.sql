-- Stage 16c2: Outreach "Work on next" (docs/ui-overhaul-plan.md, Decision 29 Oct).
--
-- v_outreach_signals   one row per business: the fit-score signals measured on 29 Oct
--                      (supabase/.local/16c2/findings.md) and the latest sent or received email.
-- v_outreach_next      every business on an open outreach stage, put in a bucket by plain rules
--                      (Reply, Chase, Follow up once, Close?, New, Find a contact, Tidy up, Waiting)
--                      and ordered. The Outreach tab and the outreach routine read the same order.
-- v_outreach_suggestions  businesses not on outreach that could be: former members, Unreviewed
--                      senders, newsletter or news mentions with no deal. Accept is by hand only.
-- outreach_suggestion_dismissals  "Not now" on a suggestion.
--
-- Nothing is written to existing tables. All three views are security invoker.

CREATE TABLE IF NOT EXISTS public.outreach_suggestion_dismissals (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  dismissed_by uuid
);
ALTER TABLE public.outreach_suggestion_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_suggestion_dismissals_org ON public.outreach_suggestion_dismissals TO authenticated
  USING (organization_id IN (SELECT user_profiles.organization_id FROM public.user_profiles WHERE user_profiles.id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT user_profiles.organization_id FROM public.user_profiles WHERE user_profiles.id = auth.uid()));
GRANT SELECT, INSERT, DELETE ON public.outreach_suggestion_dismissals TO authenticated;
GRANT ALL ON public.outreach_suggestion_dismissals TO service_role;

-- Points (measured reply rates, with / without): named contact with email 33% / 6% +3;
-- wrote to us before 36% / 12% +2; in a confirmed news article 37% / 16% +2; had a deal before
-- 30% / 17% +2; category Entertainment +2, Activities +1, Food & Drink +1, Retail 0,
-- Services / For Children / Health & Beauty -1. Newsletter mentions and routine drafts showed
-- no lift: shown, not scored.
CREATE OR REPLACE VIEW public.v_outreach_signals WITH (security_invoker = true) AS
WITH mail AS (
  SELECT c.business_id AS bid, c.direction::text AS direction, c.entry_date
  FROM public.correspondence c
  WHERE c.direction IN ('sent', 'received') AND c.type IS DISTINCT FROM 'Draft' AND c.business_id IS NOT NULL
  UNION ALL
  SELECT l.bid, c.direction::text, c.entry_date
  FROM public.correspondence c CROSS JOIN LATERAL unnest(c.linked_business_ids) AS l(bid)
  WHERE c.direction IN ('sent', 'received') AND c.type IS DISTINCT FROM 'Draft' AND cardinality(c.linked_business_ids) > 0
),
last_mail AS (
  SELECT DISTINCT ON (bid) bid, direction, entry_date
  FROM mail ORDER BY bid, entry_date DESC NULLS LAST
),
wrote AS (SELECT DISTINCT bid FROM mail WHERE direction = 'received'),
named AS (
  SELECT DISTINCT ct.business_id
  FROM public.contacts ct
  WHERE COALESCE(ct.is_active, true) AND NOT COALESCE(ct.name_is_placeholder, false)
    AND jsonb_array_length(COALESCE(ct.emails, '[]'::jsonb)) > 0
),
any_mail AS (
  SELECT DISTINCT ct.business_id FROM public.contacts ct
  WHERE jsonb_array_length(COALESCE(ct.emails, '[]'::jsonb)) > 0
),
news AS (
  SELECT business_id, max(COALESCE(published_date, found_at::date)) AS last_article
  FROM public.business_articles WHERE status = 'confirmed' GROUP BY business_id
),
deals AS (SELECT DISTINCT business_id FROM public.contracts),
drafts AS (
  SELECT DISTINCT business_id FROM public.routine_drafts
  WHERE routine = 'outreach' AND outcome = 'drafted' AND sent_at IS NULL AND created_at >= now() - interval '30 days'
),
s AS (
  SELECT b.id AS business_id, b.organization_id,
    (n.business_id IS NOT NULL) AS has_named_contact,
    (n.business_id IS NOT NULL OR a.business_id IS NOT NULL OR COALESCE(b.email, '') <> '') AS has_email,
    (w.bid IS NOT NULL) AS wrote_before,
    (ne.business_id IS NOT NULL) AS in_news,
    ne.last_article,
    (d.business_id IS NOT NULL) AS had_deal,
    COALESCE(nl.mentions_last_12_months, 0) AS newsletter_mentions_12m,
    (dr.business_id IS NOT NULL) AS draft_ready,
    lm.direction AS last_direction,
    lm.entry_date AS last_email_at,
    CASE b.category WHEN 'Entertainment' THEN 2 WHEN 'Activities' THEN 1 WHEN 'Food & Drink' THEN 1
      WHEN 'Services' THEN -1 WHEN 'For Children' THEN -1 WHEN 'Health & Beauty' THEN -1 ELSE 0 END AS pts_category
  FROM public.v_businesses b
  LEFT JOIN named n ON n.business_id = b.id
  LEFT JOIN any_mail a ON a.business_id = b.id
  LEFT JOIN wrote w ON w.bid = b.id
  LEFT JOIN news ne ON ne.business_id = b.id
  LEFT JOIN deals d ON d.business_id = b.id
  LEFT JOIN public.v_business_newsletter nl ON nl.business_id = b.id
  LEFT JOIN drafts dr ON dr.business_id = b.id
  LEFT JOIN last_mail lm ON lm.bid = b.id
  WHERE b.merged_into IS NULL
)
SELECT s.*,
  CASE WHEN has_named_contact THEN 3 ELSE 0 END AS pts_named_contact,
  CASE WHEN wrote_before THEN 2 ELSE 0 END AS pts_wrote_before,
  CASE WHEN in_news THEN 2 ELSE 0 END AS pts_in_news,
  CASE WHEN had_deal THEN 2 ELSE 0 END AS pts_had_deal,
  (CASE WHEN has_named_contact THEN 3 ELSE 0 END + CASE WHEN wrote_before THEN 2 ELSE 0 END
   + CASE WHEN in_news THEN 2 ELSE 0 END + CASE WHEN had_deal THEN 2 ELSE 0 END + pts_category) AS fit_score
FROM s;

-- Buckets, in order (days = London today minus the latest sent or received email; for a
-- Contacted or Followed up business with no email on record, the stage date stands in for it):
-- 1 reply           they wrote last, 60 days ago or less
-- 2 chase           In discussion, you wrote last, 14 to 90 days ago
-- 3 follow_up       Contacted, you wrote last, 10 to 60 days ago
-- 4 close           Followed up, you wrote last, 30 or more days ago
-- 5 new             Identified, with an email address, best fit first
-- 6 find_contact    Identified, no email address
-- 7 tidy_wrote      they wrote last, more than 60 days ago
-- 7 tidy_discussion In discussion, you wrote last, more than 90 days ago
-- 7 tidy_contacted  Contacted, you wrote last, more than 60 days ago
-- 9 waiting         nothing to do yet (you wrote recently)
CREATE OR REPLACE VIEW public.v_outreach_next WITH (security_invoker = true) AS
WITH b AS (
  SELECT v.id AS business_id, v.organization_id, v.name, v.category, v.outreach_stage, v.main_contact_id,
    CASE v.outreach_stage
      WHEN 'identified' THEN v.outreach_identified_at
      WHEN 'contacted' THEN v.outreach_contacted_at
      WHEN 'followed_up' THEN v.outreach_followed_up_at
      WHEN 'in_discussion' THEN v.outreach_in_discussion_at
    END::date AS stage_since,
    s.has_named_contact, s.has_email, s.wrote_before, s.in_news, s.had_deal, s.newsletter_mentions_12m, s.draft_ready,
    s.pts_named_contact, s.pts_wrote_before, s.pts_in_news, s.pts_had_deal, s.pts_category, s.fit_score,
    COALESCE(s.last_direction, CASE WHEN v.outreach_stage IN ('contacted', 'followed_up') THEN 'sent' END) AS last_direction,
    COALESCE(s.last_email_at::date,
      CASE v.outreach_stage WHEN 'contacted' THEN v.outreach_contacted_at::date WHEN 'followed_up' THEN v.outreach_followed_up_at::date END) AS last_email_on
  FROM public.v_businesses v
  JOIN public.v_outreach_signals s ON s.business_id = v.id
  WHERE v.merged_into IS NULL AND v.outreach_stage IN ('identified', 'contacted', 'followed_up', 'in_discussion')
),
d AS (SELECT b.*, (public.cc_today() - b.last_email_on) AS days_quiet FROM b),
k AS (
  SELECT d.*,
    CASE
      WHEN last_direction = 'received' AND days_quiet <= 60 THEN 'reply'
      WHEN last_direction = 'received' THEN 'tidy_wrote'
      WHEN outreach_stage = 'in_discussion' AND days_quiet > 90 THEN 'tidy_discussion'
      WHEN outreach_stage = 'in_discussion' AND days_quiet >= 14 THEN 'chase'
      WHEN outreach_stage = 'contacted' AND days_quiet > 60 THEN 'tidy_contacted'
      WHEN outreach_stage = 'contacted' AND days_quiet >= 10 THEN 'follow_up'
      WHEN outreach_stage = 'followed_up' AND days_quiet >= 30 THEN 'close'
      WHEN outreach_stage = 'identified' AND has_email THEN 'new'
      WHEN outreach_stage = 'identified' THEN 'find_contact'
      ELSE 'waiting'
    END AS bucket
  FROM d
)
SELECT k.*,
  CASE bucket WHEN 'reply' THEN 1 WHEN 'chase' THEN 2 WHEN 'follow_up' THEN 3 WHEN 'close' THEN 4
    WHEN 'new' THEN 5 WHEN 'find_contact' THEN 6 WHEN 'waiting' THEN 9 ELSE 7 END AS bucket_order,
  row_number() OVER (PARTITION BY organization_id ORDER BY
    CASE bucket WHEN 'reply' THEN 1 WHEN 'chase' THEN 2 WHEN 'follow_up' THEN 3 WHEN 'close' THEN 4
      WHEN 'new' THEN 5 WHEN 'find_contact' THEN 6 WHEN 'waiting' THEN 9 ELSE 7 END,
    fit_score DESC, days_quiet ASC NULLS LAST, name) AS next_order
FROM k;

-- Suggestions: not on outreach (any stage, Not interested included), commercial, no deal in
-- force, not dismissed. Former = had a deal (Stage 11a status), Unreviewed = created from an
-- inbound email, newsletter = mentioned in the last 12 months, news = a confirmed article in the
-- last 90 days.
CREATE OR REPLACE VIEW public.v_outreach_suggestions WITH (security_invoker = true) AS
SELECT v.id AS business_id, v.organization_id, v.name, v.category, v.status, v.main_contact_id, v.last_contacted_at,
  (v.status = 'Former') AS is_former,
  (v.status = 'Unreviewed') AS is_unreviewed,
  (s.newsletter_mentions_12m > 0) AS in_newsletter,
  (s.last_article >= public.cc_today() - 90) AS in_recent_news,
  s.last_article, s.newsletter_mentions_12m,
  s.has_named_contact, s.has_email, s.wrote_before, s.in_news, s.had_deal,
  s.pts_named_contact, s.pts_wrote_before, s.pts_in_news, s.pts_had_deal, s.pts_category, s.fit_score
FROM public.v_businesses v
JOIN public.v_outreach_signals s ON s.business_id = v.id
WHERE v.merged_into IS NULL
  AND v.outreach_stage IS NULL
  AND COALESCE(v.is_commercial, true)
  AND COALESCE(v.status, '') NOT IN ('Active', 'Not a business', 'Closed')
  AND NOT EXISTS (SELECT 1 FROM public.outreach_suggestion_dismissals x WHERE x.business_id = v.id)
  AND (v.status IN ('Former', 'Unreviewed') OR s.newsletter_mentions_12m > 0 OR s.last_article >= public.cc_today() - 90);

GRANT SELECT ON public.v_outreach_signals, public.v_outreach_next, public.v_outreach_suggestions TO authenticated, service_role;
