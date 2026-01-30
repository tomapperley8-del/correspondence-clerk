-- Create table to track dismissed duplicate pairs
-- Users can mark duplicate pairs as "not duplicates" to dismiss warnings

CREATE TABLE IF NOT EXISTS duplicate_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entry_id_1 UUID NOT NULL REFERENCES correspondence(id) ON DELETE CASCADE,
  entry_id_2 UUID NOT NULL REFERENCES correspondence(id) ON DELETE CASCADE,
  dismissed_by UUID REFERENCES auth.users(id),
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entry_id_1, entry_id_2)
);

-- Enable RLS
ALTER TABLE duplicate_dismissals ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can manage dismissals within their organization
CREATE POLICY "Users can manage dismissals" ON duplicate_dismissals
  FOR ALL USING (true) WITH CHECK (true);

-- Index for faster lookups by business_id
CREATE INDEX idx_duplicate_dismissals_business_id ON duplicate_dismissals(business_id);
