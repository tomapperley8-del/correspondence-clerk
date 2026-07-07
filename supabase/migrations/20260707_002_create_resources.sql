-- Feature 2: Resource Hub — documents, reports, templates, reference materials.
-- Applied to production via Supabase MCP on 07/07/2026.

CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('ad_report','template','sales_sheet','rate_card','media_pack','spreadsheet','other')),
  file_url text,
  file_type text,
  is_uploaded boolean DEFAULT false,
  storage_path text,
  linked_business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_category ON resources (category);
CREATE INDEX IF NOT EXISTS idx_resources_linked_business_id ON resources (linked_business_id);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_tags ON resources USING GIN (tags);

CREATE TRIGGER resources_updated_at BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own organization resources" ON resources
  FOR SELECT TO authenticated USING (organization_id = get_user_organization_id());
CREATE POLICY "Users can insert own organization resources" ON resources
  FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "Users can update own organization resources" ON resources
  FOR UPDATE TO authenticated USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "Users can delete own organization resources" ON resources
  FOR DELETE TO authenticated USING (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON resources TO authenticated;
GRANT ALL ON resources TO service_role;

-- Storage bucket for uploaded resource files (private; org-folder paths like business-files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resources', 'resources', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can manage their org resource files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'resources'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'resources'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM user_profiles WHERE id = auth.uid()
    )
  );
