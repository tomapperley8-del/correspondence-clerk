-- UI overhaul Stage 16a, the Newsletter tab (agreed 29 Oct 2026, Tom: "Yes, build it").
--
-- Each stored issue is split into items (stories, guest blogs, freebies, Club Card pieces, markets,
-- jazz listings) by plain rules in lib/newsletter/items.ts; Tom can change an item's kind, business or
-- contributor and the reader then leaves it alone (edited_at set). Contributors are a list Tom edits.
-- Promises are the newsletter space a deal includes (blogs, editorials, banners, ads), counted against
-- the issues; banners are images, so they are ticked by hand.
--
-- Readers: the Newsletter tab, the business page (freebies), and views the desk email and routines can
-- read (v_newsletter_items, v_newsletter_contributors, v_newsletter_promises). Nothing else changes.
-- Rollback: supabase/migrations/rollback/20261029_001_newsletter_items_down.sql

CREATE TABLE IF NOT EXISTS public.newsletter_contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  column_name text,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  -- Other ways the name appears in the text ("Rosie", "Head of Gardens"); matched as whole words
  aliases text[] NOT NULL DEFAULT '{}',
  expected_every_days integer CHECK (expected_every_days IS NULL OR expected_every_days > 0),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
COMMENT ON TABLE public.newsletter_contributors IS 'Stage 16a: regular newsletter writers (guest bloggers, columnists), kept by Tom.';

CREATE TABLE IF NOT EXISTS public.newsletter_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.newsletter_issues(id) ON DELETE CASCADE,
  position integer NOT NULL,
  section text NOT NULL DEFAULT 'features'
    CHECK (section IN ('top', 'more_news', 'features', 'club_card', 'whats_on', 'jazz', 'columnists', 'footer')),
  kind text NOT NULL DEFAULT 'feature'
    CHECK (kind IN ('news', 'more_news', 'feature', 'guest_blog', 'column', 'review', 'freebie', 'competition',
                    'club_card_join', 'club_card_offer', 'club_card_event', 'market', 'whats_on', 'jazz', 'banner', 'appeal', 'other')),
  headline text,
  blurb text,
  link_url text,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  contributor_id uuid REFERENCES public.newsletter_contributors(id) ON DELETE SET NULL,
  -- Freebies and competitions: the closing date the text gives
  closes_on date,
  -- Set when Tom changes kind, business or contributor; the reader then keeps his choice
  edited_by uuid,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_id, position)
);
CREATE INDEX IF NOT EXISTS newsletter_items_org_kind_idx ON public.newsletter_items (organization_id, kind);
CREATE INDEX IF NOT EXISTS newsletter_items_business_idx ON public.newsletter_items (business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS newsletter_items_contributor_idx ON public.newsletter_items (contributor_id) WHERE contributor_id IS NOT NULL;
COMMENT ON TABLE public.newsletter_items IS 'Stage 16a: each issue split into its items by plain rules (lib/newsletter/items.ts). Not correspondence.';

CREATE TABLE IF NOT EXISTS public.newsletter_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('blog', 'editorial', 'banner', 'ad', 'mention')),
  -- How many: per term (6 blogs), per month (1 blog a month) or per week (an ad every week)
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  per text NOT NULL DEFAULT 'term' CHECK (per IN ('term', 'month', 'week')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newsletter_promises_contract_idx ON public.newsletter_promises (contract_id);
COMMENT ON TABLE public.newsletter_promises IS 'Stage 16a: newsletter space a deal includes, counted against the issues (v_newsletter_promises).';

-- Banners and ads are images, so Tom ticks the issues they ran in
CREATE TABLE IF NOT EXISTS public.newsletter_promise_ticks (
  promise_id uuid NOT NULL REFERENCES public.newsletter_promises(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.newsletter_issues(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticked_by uuid,
  ticked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (promise_id, issue_id)
);

ALTER TABLE public.newsletter_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_promise_ticks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS newsletter_contributors_org ON public.newsletter_contributors;
CREATE POLICY newsletter_contributors_org ON public.newsletter_contributors TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS newsletter_items_org ON public.newsletter_items;
CREATE POLICY newsletter_items_org ON public.newsletter_items TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS newsletter_promises_org ON public.newsletter_promises;
CREATE POLICY newsletter_promises_org ON public.newsletter_promises TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS newsletter_promise_ticks_org ON public.newsletter_promise_ticks;
CREATE POLICY newsletter_promise_ticks_org ON public.newsletter_promise_ticks TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

-- Items are written by the server's reader; Tom's edits update them. Contributors, promises and ticks are his.
REVOKE ALL ON public.newsletter_contributors, public.newsletter_items, public.newsletter_promises, public.newsletter_promise_ticks FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.newsletter_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_contributors, public.newsletter_promises, public.newsletter_promise_ticks TO authenticated;
GRANT ALL ON public.newsletter_contributors, public.newsletter_items, public.newsletter_promises, public.newsletter_promise_ticks TO service_role;

-- Every item with its issue date, business and contributor
CREATE OR REPLACE VIEW public.v_newsletter_items WITH (security_invoker = true) AS
SELECT it.id, it.organization_id, it.issue_id,
       (i.sent_at AT TIME ZONE 'Europe/London')::date AS issue_date,
       i.browser_url AS issue_url,
       it.position, it.section, it.kind, it.headline, it.blurb, it.link_url, it.closes_on,
       COALESCE(b.merged_into, b.id) AS business_id, b.name AS business_name,
       it.contributor_id, c.name AS contributor_name, c.column_name,
       it.edited_at IS NOT NULL AS edited_by_hand
FROM public.newsletter_items it
JOIN public.newsletter_issues i ON i.id = it.issue_id
LEFT JOIN public.businesses b ON b.id = it.business_id
LEFT JOIN public.newsletter_contributors c ON c.id = it.contributor_id;
COMMENT ON VIEW public.v_newsletter_items IS 'Stage 16a: every newsletter item with issue date, business and contributor.';

-- Each contributor: how often, last time, and when next expected
CREATE OR REPLACE VIEW public.v_newsletter_contributors WITH (security_invoker = true) AS
SELECT c.id, c.organization_id, c.name, c.column_name, c.business_id, b.name AS business_name,
       c.expected_every_days, c.active,
       count(DISTINCT it.issue_id) AS issues_total,
       count(DISTINCT it.issue_id) FILTER (WHERE i.sent_at >= now() - interval '12 months') AS issues_last_12_months,
       min((i.sent_at AT TIME ZONE 'Europe/London')::date) AS first_in,
       max((i.sent_at AT TIME ZONE 'Europe/London')::date) AS last_in,
       max((i.sent_at AT TIME ZONE 'Europe/London')::date) + c.expected_every_days AS next_expected
FROM public.newsletter_contributors c
LEFT JOIN public.businesses b ON b.id = c.business_id
LEFT JOIN public.newsletter_items it ON it.contributor_id = c.id
LEFT JOIN public.newsletter_issues i ON i.id = it.issue_id
GROUP BY c.id, b.name;
COMMENT ON VIEW public.v_newsletter_contributors IS 'Stage 16a: regular newsletter writers with counts, last time in and next expected.';

-- Each deal promise: how many are due so far in the term and how many went in
CREATE OR REPLACE VIEW public.v_newsletter_promises WITH (security_invoker = true) AS
WITH p AS (
  SELECT np.*, ct.contract_start, ct.contract_end, b.name AS business_name,
         LEAST(COALESCE(ct.contract_end, public.cc_today()), public.cc_today()) AS counted_to
  FROM public.newsletter_promises np
  JOIN public.contracts ct ON ct.id = np.contract_id
  JOIN public.businesses b ON b.id = np.business_id
), d AS (
  SELECT p.id,
         CASE WHEN p.kind IN ('banner', 'ad') THEN
           (SELECT count(*) FROM public.newsletter_promise_ticks t WHERE t.promise_id = p.id)
         ELSE
           (SELECT count(DISTINCT it.issue_id) FROM public.newsletter_items it
             JOIN public.newsletter_issues i ON i.id = it.issue_id
             WHERE it.business_id = p.business_id
               AND (i.sent_at AT TIME ZONE 'Europe/London')::date BETWEEN p.contract_start AND COALESCE(p.contract_end, public.cc_today())
               AND (p.kind = 'mention'
                    OR (p.kind = 'blog' AND it.kind IN ('guest_blog', 'column'))
                    OR (p.kind = 'editorial' AND it.kind NOT IN ('more_news', 'jazz', 'banner', 'appeal', 'other'))))
         END AS delivered
  FROM p
)
SELECT p.id, p.organization_id, p.contract_id, p.business_id, p.business_name, p.kind, p.quantity, p.per, p.notes,
       p.contract_start, p.contract_end,
       CASE p.per
         WHEN 'term' THEN p.quantity
         WHEN 'month' THEN p.quantity * GREATEST(1, (EXTRACT(year FROM age(p.counted_to, p.contract_start)) * 12
                                                     + EXTRACT(month FROM age(p.counted_to, p.contract_start)) + 1)::int)
         ELSE p.quantity * GREATEST(1, ((p.counted_to - p.contract_start) / 7 + 1))
       END AS due_so_far,
       d.delivered,
       (p.contract_end IS NOT NULL AND p.contract_end < public.cc_today()) AS term_over
FROM p JOIN d ON d.id = p.id;
COMMENT ON VIEW public.v_newsletter_promises IS 'Stage 16a: deal newsletter promises, due so far against delivered (banners and ads by tick).';

REVOKE ALL ON public.v_newsletter_items, public.v_newsletter_contributors, public.v_newsletter_promises FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_newsletter_items, public.v_newsletter_contributors, public.v_newsletter_promises TO authenticated, service_role;
