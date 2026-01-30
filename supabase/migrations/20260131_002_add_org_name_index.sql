-- Add compound index for dashboard name sorting within organization
-- This speeds up the common query: SELECT ... FROM businesses WHERE organization_id = ? ORDER BY name

CREATE INDEX IF NOT EXISTS idx_businesses_org_name
  ON public.businesses (organization_id, name);
