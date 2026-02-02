-- Fix duplicate_dismissals RLS policy to be organization-scoped
-- Previously had permissive "USING (true)" policy that allowed cross-organization access

-- Drop the permissive policy
DROP POLICY IF EXISTS "Users can manage dismissals" ON duplicate_dismissals;

-- Create organization-scoped policies
-- Dismissals are tied to businesses, which have organization_id
CREATE POLICY "Users can read own organization dismissals"
  ON duplicate_dismissals
  FOR SELECT
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM businesses
      WHERE organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "Users can insert own organization dismissals"
  ON duplicate_dismissals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses
      WHERE organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "Users can delete own organization dismissals"
  ON duplicate_dismissals
  FOR DELETE
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM businesses
      WHERE organization_id = public.get_user_organization_id()
    )
  );
