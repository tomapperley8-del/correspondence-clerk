-- Migration: Add inbound email forwarding support
-- Adds: inbound_email_token on user_profiles, inbound_queue table, domain_mappings table

-- 1. Token column on user_profiles (unique slug per user, e.g. 'tom-a4x9')
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS inbound_email_token TEXT UNIQUE;

-- 2. Inbound queue — holds unmatched emails awaiting manual triage
CREATE TABLE IF NOT EXISTS public.inbound_queue (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_email   TEXT        NOT NULL,
  from_name    TEXT,
  subject      TEXT,
  body_preview TEXT,
  raw_payload  JSONB       NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'filed', 'discarded')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_queue_org_status
  ON public.inbound_queue(org_id, status, received_at DESC);

ALTER TABLE public.inbound_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own org inbound queue"
  ON public.inbound_queue FOR ALL
  USING (
    org_id IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- 3. Domain mappings — learned from manual filing (auto-file future emails)
CREATE TABLE IF NOT EXISTS public.domain_mappings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain      TEXT        NOT NULL,
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_domain_mappings_org_domain
  ON public.domain_mappings(org_id, domain);

ALTER TABLE public.domain_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own org domain mappings"
  ON public.domain_mappings FOR ALL
  USING (
    org_id IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );
