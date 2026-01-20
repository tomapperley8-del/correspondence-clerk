-- Create RLS helper functions for organization-scoped access
-- These functions are used by RLS policies to efficiently determine user organization

-- Function: Get the organization_id for the current authenticated user
-- STABLE: Result doesn't change within a single query (cached by Postgres)
-- SECURITY DEFINER: Runs with elevated permissions to read user_profiles
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_user_organization_id() IS
  'Returns the organization_id for the current authenticated user. Used by RLS policies for efficient organization-scoped access control. STABLE for query performance (result cached within query). SECURITY DEFINER to allow reading user_profiles.';
