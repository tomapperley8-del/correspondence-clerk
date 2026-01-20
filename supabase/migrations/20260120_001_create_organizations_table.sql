-- Create organizations table
-- Foundation for multi-tenancy

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index on created_by for lookups
CREATE INDEX idx_organizations_created_by ON public.organizations(created_by);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.organizations IS 'Organizations for multi-tenancy. Each user belongs to one organization.';
COMMENT ON COLUMN public.organizations.name IS 'Organization display name';
COMMENT ON COLUMN public.organizations.created_by IS 'User who created this organization';
