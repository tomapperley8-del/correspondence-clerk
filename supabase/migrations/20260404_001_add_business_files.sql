-- Business files table
CREATE TABLE IF NOT EXISTS business_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  parsed_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_business_files_business_id ON business_files(business_id);
CREATE INDEX idx_business_files_org_id ON business_files(organization_id);

-- RLS
ALTER TABLE business_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage files in their org" ON business_files
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );
