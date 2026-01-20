-- Update RLS policies for organization-based multi-tenancy
-- CRITICAL SECURITY MIGRATION: Switches from "all users see all data" to organization isolation
-- After this migration, users can only access data from their own organization

-- ============================================================================
-- BUSINESSES TABLE
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can read all businesses" ON public.businesses;
DROP POLICY IF EXISTS "Authenticated users can insert businesses" ON public.businesses;
DROP POLICY IF EXISTS "Authenticated users can update all businesses" ON public.businesses;
DROP POLICY IF EXISTS "Authenticated users can delete businesses" ON public.businesses;

-- Create new organization-scoped policies
CREATE POLICY "Users can read own organization businesses"
  ON public.businesses
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert own organization businesses"
  ON public.businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update own organization businesses"
  ON public.businesses
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete own organization businesses"
  ON public.businesses
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- ============================================================================
-- CONTACTS TABLE
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can read all contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can update all contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can delete contacts" ON public.contacts;

-- Create new organization-scoped policies
CREATE POLICY "Users can read own organization contacts"
  ON public.contacts
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert own organization contacts"
  ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update own organization contacts"
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete own organization contacts"
  ON public.contacts
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- ============================================================================
-- CORRESPONDENCE TABLE
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can read all correspondence" ON public.correspondence;
DROP POLICY IF EXISTS "Authenticated users can insert correspondence" ON public.correspondence;
DROP POLICY IF EXISTS "Authenticated users can update all correspondence" ON public.correspondence;
DROP POLICY IF EXISTS "Authenticated users can delete correspondence" ON public.correspondence;

-- Create new organization-scoped policies
CREATE POLICY "Users can read own organization correspondence"
  ON public.correspondence
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert own organization correspondence"
  ON public.correspondence
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update own organization correspondence"
  ON public.correspondence
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete own organization correspondence"
  ON public.correspondence
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================

-- Enable RLS on organizations table
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Users can only read their own organization
CREATE POLICY "Users can read own organization"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id = public.get_user_organization_id());

-- Users can update their own organization (for renaming)
CREATE POLICY "Users can update own organization"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (id = public.get_user_organization_id())
  WITH CHECK (id = public.get_user_organization_id());

-- Users can create organizations (during onboarding)
CREATE POLICY "Users can create organizations"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- No restriction on INSERT (handled by application logic)

-- ============================================================================
-- USER_PROFILES TABLE
-- ============================================================================

-- Enable RLS on user_profiles table
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Users can read profiles from their organization (for team member list)
CREATE POLICY "Users can read organization profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- Users can insert their own profile (during onboarding)
CREATE POLICY "Users can create own profile"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- INVITATIONS TABLE
-- ============================================================================

-- Enable RLS on invitations table
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Users can read invitations from their organization
CREATE POLICY "Users can read own organization invitations"
  ON public.invitations
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- Users can create invitations for their organization
CREATE POLICY "Users can create own organization invitations"
  ON public.invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Users can update invitations from their organization (cancel, accept)
CREATE POLICY "Users can update own organization invitations"
  ON public.invitations
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Users can delete invitations from their organization
CREATE POLICY "Users can delete own organization invitations"
  ON public.invitations
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON POLICY "Users can read own organization businesses" ON public.businesses IS
  'Multi-tenancy: Users can only read businesses from their organization';

COMMENT ON POLICY "Users can read own organization contacts" ON public.contacts IS
  'Multi-tenancy: Users can only read contacts from their organization';

COMMENT ON POLICY "Users can read own organization correspondence" ON public.correspondence IS
  'Multi-tenancy: Users can only read correspondence from their organization';

COMMENT ON POLICY "Users can read own organization" ON public.organizations IS
  'Multi-tenancy: Users can only read their own organization details';

COMMENT ON POLICY "Users can read organization profiles" ON public.user_profiles IS
  'Multi-tenancy: Users can read profiles of team members in their organization';

COMMENT ON POLICY "Users can read own organization invitations" ON public.invitations IS
  'Multi-tenancy: Users can manage invitations for their organization';
