-- Add role enum and column to user_profiles
-- Enables admin-only access to sensitive operations like imports

-- Create role enum type
CREATE TYPE public.user_role AS ENUM ('member', 'admin');

-- Add role column to user_profiles with default 'member'
ALTER TABLE public.user_profiles
ADD COLUMN role public.user_role NOT NULL DEFAULT 'member';

-- Set organization creators as admins automatically
UPDATE public.user_profiles up
SET role = 'admin'
FROM public.organizations o
WHERE up.organization_id = o.id
  AND up.id = o.created_by;

-- Create helper function for admin checks (used in application code via RPC)
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
$$;

-- Add index on role for filtered queries
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.role IS 'User role: member (default) or admin. Admins can perform sensitive operations like data imports.';
COMMENT ON FUNCTION public.is_user_admin() IS 'Returns true if the current authenticated user has admin role';
