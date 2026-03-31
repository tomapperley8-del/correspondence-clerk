-- Insight cache: stores generated insight content per org/business/type
-- Results are upserted on each generation; two partial indexes handle NULL business_id uniqueness

CREATE TABLE IF NOT EXISTS public.insight_cache (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_id    UUID        REFERENCES public.businesses(id) ON DELETE CASCADE,
  insight_type   TEXT        NOT NULL,
  content        TEXT        NOT NULL,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PostgreSQL treats NULL as distinct in UNIQUE constraints, so we need two partial indexes
-- to enforce one cache row per (org, type) for org-wide and one per (org, business, type) for business-scoped

CREATE UNIQUE INDEX IF NOT EXISTS idx_insight_cache_org_wide
  ON public.insight_cache(org_id, insight_type)
  WHERE business_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_insight_cache_business_scoped
  ON public.insight_cache(org_id, business_id, insight_type)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_insight_cache_lookup
  ON public.insight_cache(org_id, generated_at DESC);

ALTER TABLE public.insight_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage insight cache"
  ON public.insight_cache FOR ALL
  USING (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

-- User AI presets: custom insight prompts per user
-- Max 5 per user enforced in application code (not DB constraint) so it can be raised per plan tier

CREATE TABLE IF NOT EXISTS public.user_ai_presets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  prompt_text TEXT        NOT NULL,
  scope       TEXT        NOT NULL CHECK (scope IN ('org', 'business')),
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ai_presets_user_org
  ON public.user_ai_presets(user_id, org_id, sort_order);

ALTER TABLE public.user_ai_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own presets"
  ON public.user_ai_presets FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
