-- Insight history: stores every generated insight (not just the latest cache)
-- Populated on each new generation, before overwriting the cache row

CREATE TABLE IF NOT EXISTS public.insight_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_id    UUID        REFERENCES public.businesses(id) ON DELETE CASCADE,
  insight_type   TEXT        NOT NULL,
  content        TEXT        NOT NULL,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary lookup: history for a specific insight type, newest first
CREATE INDEX IF NOT EXISTS idx_insight_history_lookup
  ON public.insight_history(org_id, insight_type, generated_at DESC);

-- Business-scoped lookup
CREATE INDEX IF NOT EXISTS idx_insight_history_business
  ON public.insight_history(org_id, business_id, insight_type, generated_at DESC)
  WHERE business_id IS NOT NULL;

ALTER TABLE public.insight_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read insight history"
  ON public.insight_history FOR SELECT
  USING (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "org members can insert insight history"
  ON public.insight_history FOR INSERT
  WITH CHECK (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));
