-- UI overhaul Stage 17b (5): Dawn's and James's ad emails.
-- Their emails (filed on their own records) are linked to the advertiser they are about (correspondence.linked_business_ids,
-- which the dossier and business page already read); sure matches are linked by the data script, the rest wait in
-- ad_email_links for Tom to confirm on Data health. ad_placements / ad_reports hold what the emails say (placement, live
-- from, expires, stats as written), each tied to its source email. business_dossier gets an `ads` key.
-- Explicit grants (Supabase 30 Oct 2026 rule). Rollback: rollback/20261102_006_ad_emails_rollback.sql.

CREATE TABLE IF NOT EXISTS public.ad_email_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  correspondence_id uuid NOT NULL REFERENCES public.correspondence(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  why text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','confirmed','rejected')),
  found_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (correspondence_id, business_id)
);

CREATE TABLE IF NOT EXISTS public.ad_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  placement text,                  -- sidebar, leaderboard, mobile sticky, home tile ... as the email says; null when not said
  live_from date,
  expires date,
  note text,                       -- the email's own words, short
  source_entry_id uuid REFERENCES public.correspondence(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_placements_business_idx ON public.ad_placements (business_id);

CREATE TABLE IF NOT EXISTS public.ad_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  period_start date,
  period_end date,
  placement text,
  figures jsonb NOT NULL DEFAULT '{}'::jsonb,   -- numbers as written, e.g. {"impressions": 66478, "clicks": 21}
  note text,
  source_entry_id uuid REFERENCES public.correspondence(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_reports_business_idx ON public.ad_reports (business_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ad_email_links','ad_placements','ad_reports'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_auth_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t || '_auth_all', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.v_ad_emails_to_match WITH (security_invoker = true) AS
SELECT l.organization_id, l.id AS link_id, l.correspondence_id, l.business_id, b.name AS business_name,
       c.entry_date, c.subject, k.name AS contact_name, l.why, l.found_at
  FROM ad_email_links l
  JOIN businesses b ON b.id = l.business_id
  JOIN correspondence c ON c.id = l.correspondence_id
  LEFT JOIN contacts k ON k.id = c.contact_id
 WHERE l.state = 'pending' AND b.merged_into IS NULL;
GRANT SELECT ON public.v_ad_emails_to_match TO authenticated, service_role;

-- business_dossier: add the `ads` key just before `attention`, made from the live definition (fails loudly if the
-- anchor is not found exactly once; skips if already there).
DO $do$
DECLARE
  def text := pg_get_functiondef('public.business_dossier(text)'::regprocedure);
  anchor text := $a$'attention', (SELECT jsonb_build_object('reason', a.reason$a$;
  newkey text := $n$'ads', jsonb_build_object(
      'note', 'From Dawn Wilson''s and James Willcocks''s emails (ad placements and stats). Figures are as written in the email; the source email is in correspondence (source_entry_id). Stats often arrive as screenshots that are not read.',
      'placements', (SELECT jsonb_agg(s.x) FROM (SELECT jsonb_build_object('placement', p.placement, 'live_from', p.live_from, 'expires', p.expires,
                       'note', p.note, 'source_entry_id', p.source_entry_id) AS x
                     FROM ad_placements p WHERE p.business_id = b.id ORDER BY coalesce(p.expires, p.live_from) DESC NULLS LAST LIMIT 30) s),
      'reports', (SELECT jsonb_agg(s.x) FROM (SELECT jsonb_build_object('period_start', r.period_start, 'period_end', r.period_end,
                       'placement', r.placement, 'figures', r.figures, 'note', r.note, 'source_entry_id', r.source_entry_id) AS x
                     FROM ad_reports r WHERE r.business_id = b.id ORDER BY coalesce(r.period_end, r.period_start) DESC NULLS LAST LIMIT 30) s),
      'emails_to_confirm', (SELECT count(*) FROM ad_email_links l WHERE l.business_id = b.id AND l.state = 'pending')),

    $n$;
  n int;
BEGIN
  IF position(E'''ads'', jsonb_build_object(' IN def) > 0 THEN RETURN; END IF;
  n := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'business_dossier anchor found % times, expected 1', n; END IF;
  EXECUTE replace(def, anchor, newkey || anchor);
END $do$;
