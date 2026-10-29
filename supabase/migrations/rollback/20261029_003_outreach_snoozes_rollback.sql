-- Undo 20261029_003_outreach_snoozes: v_outreach_next back exactly as 20261029_001 made it
-- (DROP first: CREATE OR REPLACE cannot take the added column away), then the table.
DROP VIEW IF EXISTS public.v_outreach_next;
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
GRANT SELECT ON public.v_outreach_next TO authenticated, service_role;
DROP TABLE IF EXISTS public.outreach_snoozes;
