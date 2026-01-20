-- Add organization_id to data tables for multi-tenancy
-- Columns are nullable initially to allow zero-downtime migration
-- Migration 005 will populate data and make NOT NULL

-- Add organization_id to businesses
ALTER TABLE public.businesses
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to contacts
ALTER TABLE public.contacts
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to correspondence
ALTER TABLE public.correspondence
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create indexes for RLS performance (denormalized for fast lookups)
CREATE INDEX idx_businesses_organization_id ON public.businesses(organization_id);
CREATE INDEX idx_contacts_organization_id ON public.contacts(organization_id);
CREATE INDEX idx_correspondence_organization_id ON public.correspondence(organization_id);

-- Add comments for documentation
COMMENT ON COLUMN public.businesses.organization_id IS 'Organization that owns this business record. Denormalized for RLS performance.';
COMMENT ON COLUMN public.contacts.organization_id IS 'Organization that owns this contact record. Denormalized for RLS performance.';
COMMENT ON COLUMN public.correspondence.organization_id IS 'Organization that owns this correspondence entry. Denormalized for RLS performance.';
