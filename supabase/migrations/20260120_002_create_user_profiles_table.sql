-- Create user_profiles table
-- Links users to organizations (one user = one organization)

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index on organization_id for lookups
CREATE INDEX idx_user_profiles_organization_id ON public.user_profiles(organization_id);

-- Ensure one user = one organization (this is the primary key, but making it explicit)
-- The primary key on id already enforces one row per user

-- Add trigger to update updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.user_profiles IS 'User profiles linking users to organizations. One-to-one relationship: one user belongs to one organization.';
COMMENT ON COLUMN public.user_profiles.id IS 'References auth.users(id). Primary key enforces one profile per user.';
COMMENT ON COLUMN public.user_profiles.organization_id IS 'The organization this user belongs to';
COMMENT ON COLUMN public.user_profiles.display_name IS 'Optional display name for the user';
