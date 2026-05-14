-- Add business_type field to businesses
-- This is a separate classification from the existing status/membership_type system.
-- Values come from the org_business_types lookup table (per-org configurable).

ALTER TABLE public.businesses
  ADD COLUMN business_type TEXT;

CREATE INDEX idx_businesses_business_type
  ON public.businesses (business_type, organization_id);

-- Per-org configurable business type taxonomy (mirrors org_membership_types pattern)
CREATE TABLE public.org_business_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, value)
);

ALTER TABLE public.org_business_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_business_types"
  ON public.org_business_types
  FOR ALL
  USING (org_id = get_user_organization_id())
  WITH CHECK (org_id = get_user_organization_id());

-- Seed default types for The Chiswick Calendar org
INSERT INTO public.org_business_types (org_id, label, value, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Business',              'business',       1),
  ('00000000-0000-0000-0000-000000000001', 'Internal',              'internal',       2),
  ('00000000-0000-0000-0000-000000000001', 'Contributor',           'contributor',    3),
  ('00000000-0000-0000-0000-000000000001', 'Community',             'community',      4),
  ('00000000-0000-0000-0000-000000000001', 'Council / Public sector','council',       5),
  ('00000000-0000-0000-0000-000000000001', 'Media / PR',            'media_pr',       6),
  ('00000000-0000-0000-0000-000000000001', 'Venue / Promoter',      'venue_promoter', 7),
  ('00000000-0000-0000-0000-000000000001', 'Supplier',              'supplier',       8)
ON CONFLICT (org_id, value) DO NOTHING;
