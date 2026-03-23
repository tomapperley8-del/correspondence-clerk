-- Create org_membership_types table
CREATE TABLE public.org_membership_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, value)
);

ALTER TABLE public.org_membership_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage their membership types"
  ON public.org_membership_types FOR ALL
  USING (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

-- Drop the hardcoded CHECK constraint on businesses.membership_type
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_membership_type_check;

-- Seed existing orgs with the 4 legacy types
INSERT INTO public.org_membership_types (org_id, label, value, sort_order, is_active)
SELECT o.id, 'Club Card',          'club_card',          1, true FROM public.organizations o
UNION ALL
SELECT o.id, 'Advertiser',         'advertiser',         2, true FROM public.organizations o
UNION ALL
SELECT o.id, 'Former Club Card',   'former_club_card',   3, true FROM public.organizations o
UNION ALL
SELECT o.id, 'Former Advertiser',  'former_advertiser',  4, true FROM public.organizations o
ON CONFLICT (org_id, value) DO NOTHING;
