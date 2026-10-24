-- Stage 16a (UI overhaul), data half: newsletter issues and who they mention.
--
--   newsletter_issues        one row per issue of "The Chiswick Calendar Newsletter", read from
--                            Mailchimp's public archive of the list (Tom's choice, 24 Oct: no Gmail
--                            or Outlook access needed): sent date, subject, Mailchimp campaign id,
--                            the text with each link's address kept, and the "view in browser" link
--                            (mailchi.mp/...). The archive lists the latest 20 issues, so the store
--                            starts in June 2026 and grows weekly. Never stored as correspondence.
--   newsletter_mentions      one row per issue and business: how it matched (club_card_page, website,
--                            name), the text that matched with a little context, and its status:
--                            confirmed (a sure match, or Tom said yes), unclear (waiting for Tom),
--                            rejected (Tom said no). Tom's decisions (decided_at set) are never
--                            overwritten by a later read.
--   newsletter_read_runs     one row per read, with what it found or why it stopped (for example
--                            the archive not answering).
--   v_business_newsletter    one row per business with a confirmed mention: last_in_newsletter (the
--                            date of the latest issue), its issue id and link, mentions in all and in
--                            the last 12 months. A merged business's mentions count for the business
--                            it was merged into. Read by the app, the desk email and the routines.
--
-- Additive: no existing table, view or function changes, so v_businesses, v_business_attention and
-- v_morning_desk are untouched. Rollback: rollback/20261024_003_newsletter_rollback.sql

CREATE TABLE IF NOT EXISTS public.newsletter_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'mailchimp_archive',
  source_id text NOT NULL,
  sent_at timestamptz NOT NULL,
  subject text NOT NULL,
  plain_text text NOT NULL DEFAULT '',
  browser_url text,
  read_at timestamptz NOT NULL DEFAULT now(),
  matched_at timestamptz,
  UNIQUE (organization_id, source_id)
);
CREATE INDEX IF NOT EXISTS newsletter_issues_org_sent_idx ON public.newsletter_issues (organization_id, sent_at DESC);
COMMENT ON TABLE public.newsletter_issues IS 'Stage 16a: issues of The Chiswick Calendar Newsletter, read from Mailchimp''s public archive. source_id = Mailchimp campaign id. Not correspondence.';

CREATE TABLE IF NOT EXISTS public.newsletter_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.newsletter_issues(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  match_kind text NOT NULL CHECK (match_kind IN ('club_card_page', 'website', 'name')),
  matched_text text NOT NULL,
  context text,
  status text NOT NULL CHECK (status IN ('confirmed', 'unclear', 'rejected')),
  unclear_reason text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_id, business_id)
);
CREATE INDEX IF NOT EXISTS newsletter_mentions_business_idx ON public.newsletter_mentions (business_id, status);
CREATE INDEX IF NOT EXISTS newsletter_mentions_org_status_idx ON public.newsletter_mentions (organization_id, status);
COMMENT ON TABLE public.newsletter_mentions IS 'Stage 16a: businesses mentioned in a newsletter issue, found by plain matching (no AI). unclear = waiting for Tom.';

CREATE TABLE IF NOT EXISTS public.newsletter_read_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ran_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  trigger text NOT NULL DEFAULT 'cron',
  issues_seen integer,
  issues_new integer,
  mentions_new integer,
  error text
);
CREATE INDEX IF NOT EXISTS newsletter_read_runs_org_idx ON public.newsletter_read_runs (organization_id, ran_at DESC);

ALTER TABLE public.newsletter_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_read_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS newsletter_issues_org ON public.newsletter_issues;
CREATE POLICY newsletter_issues_org ON public.newsletter_issues FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS newsletter_mentions_org ON public.newsletter_mentions;
CREATE POLICY newsletter_mentions_org ON public.newsletter_mentions TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS newsletter_read_runs_org ON public.newsletter_read_runs;
CREATE POLICY newsletter_read_runs_org ON public.newsletter_read_runs FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

-- Issues and runs are written only by the server (service role); Tom's review decisions update mentions.
REVOKE ALL ON public.newsletter_issues, public.newsletter_mentions, public.newsletter_read_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.newsletter_issues, public.newsletter_read_runs TO authenticated;
GRANT SELECT, UPDATE ON public.newsletter_mentions TO authenticated;
GRANT ALL ON public.newsletter_issues, public.newsletter_mentions, public.newsletter_read_runs TO service_role;

CREATE OR REPLACE VIEW public.v_business_newsletter WITH (security_invoker = true) AS
WITH m AS (
  SELECT COALESCE(b.merged_into, b.id) AS business_id,
         i.id AS issue_id, i.sent_at, i.browser_url, i.subject
  FROM public.newsletter_mentions nm
  JOIN public.newsletter_issues i ON i.id = nm.issue_id
  JOIN public.businesses b ON b.id = nm.business_id
  WHERE nm.status = 'confirmed'
)
SELECT DISTINCT ON (m.business_id)
  m.business_id,
  (m.sent_at AT TIME ZONE 'Europe/London')::date AS last_in_newsletter,
  m.issue_id AS last_issue_id,
  m.browser_url AS last_issue_url,
  count(*) OVER (PARTITION BY m.business_id) AS mentions_total,
  count(*) FILTER (WHERE m.sent_at >= now() - interval '12 months') OVER (PARTITION BY m.business_id) AS mentions_last_12_months
FROM m
ORDER BY m.business_id, m.sent_at DESC;
COMMENT ON VIEW public.v_business_newsletter IS 'Stage 16a: last time each business was in the newsletter (confirmed mentions only). Join on business_id.';

REVOKE ALL ON public.v_business_newsletter FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_business_newsletter TO authenticated, service_role;
