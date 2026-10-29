-- Stage 16c3: "Not now" on any Outreach "Work on next" row (docs/ui-overhaul-plan.md, Decision 29 Oct).
--
-- outreach_snoozes   one row per business hidden from Work on next until a date. The stage is
--                    not touched. A snooze stops counting once the date comes, or sooner when
--                    they email after it was set.
-- v_outreach_next    the same view as 20261029_001 with every column kept in place. A business
--                    with a snooze in force gets the bucket 'snoozed' (order 8, after Tidy up and
--                    before Waiting), so the Outreach tab and the outreach routine (which reads
--                    bucket 'new') both leave it alone. One column is added at the end:
--                    snoozed_until (null unless the snooze is in force).
--
-- Nothing is written to existing tables.

CREATE TABLE IF NOT EXISTS public.outreach_snoozes (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snoozed_until date NOT NULL,
  snoozed_at timestamptz NOT NULL DEFAULT now(),
  snoozed_by uuid
);
ALTER TABLE public.outreach_snoozes ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_snoozes_org ON public.outreach_snoozes TO authenticated
  USING (organization_id IN (SELECT user_profiles.organization_id FROM public.user_profiles WHERE user_profiles.id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT user_profiles.organization_id FROM public.user_profiles WHERE user_profiles.id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_snoozes TO authenticated;
GRANT ALL ON public.outreach_snoozes TO service_role;

-- Buckets as in 20261029_001, plus:
-- 8 snoozed         "Not now" until a date that has not come, and no email from them since
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
      CASE v.outreach_stage WHEN 'contacted' THEN v.outreach_contacted_at::date WHEN 'followed_up' THEN v.outreach_followed_up_at::date END) AS last_email_on,
    s.last_direction AS email_direction,
    s.last_email_at
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
    END AS rule_bucket
  FROM d
),
z AS (
  SELECT k.*, sn.snoozed_until,
    CASE WHEN sn.business_id IS NOT NULL THEN 'snoozed' ELSE k.rule_bucket END AS bucket
  FROM k
  LEFT JOIN public.outreach_snoozes sn
    ON sn.business_id = k.business_id
   AND sn.snoozed_until > public.cc_today()
   AND NOT (k.email_direction = 'received' AND k.last_email_at > sn.snoozed_at)
)
SELECT z.business_id, z.organization_id, z.name, z.category, z.outreach_stage, z.main_contact_id, z.stage_since,
  z.has_named_contact, z.has_email, z.wrote_before, z.in_news, z.had_deal, z.newsletter_mentions_12m, z.draft_ready,
  z.pts_named_contact, z.pts_wrote_before, z.pts_in_news, z.pts_had_deal, z.pts_category, z.fit_score,
  z.last_direction, z.last_email_on, z.days_quiet, z.bucket,
  CASE z.bucket WHEN 'reply' THEN 1 WHEN 'chase' THEN 2 WHEN 'follow_up' THEN 3 WHEN 'close' THEN 4
    WHEN 'new' THEN 5 WHEN 'find_contact' THEN 6 WHEN 'snoozed' THEN 8 WHEN 'waiting' THEN 9 ELSE 7 END AS bucket_order,
  row_number() OVER (PARTITION BY z.organization_id ORDER BY
    CASE z.bucket WHEN 'reply' THEN 1 WHEN 'chase' THEN 2 WHEN 'follow_up' THEN 3 WHEN 'close' THEN 4
      WHEN 'new' THEN 5 WHEN 'find_contact' THEN 6 WHEN 'snoozed' THEN 8 WHEN 'waiting' THEN 9 ELSE 7 END,
    z.fit_score DESC, z.days_quiet ASC NULLS LAST, z.name) AS next_order,
  z.snoozed_until
FROM z;

GRANT SELECT ON public.v_outreach_next TO authenticated, service_role;
