-- Dead letter queue for inbound emails that failed to insert
-- Emails that hit DB errors are saved here so they can be retried rather than lost silently.

CREATE TABLE email_dead_letters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  raw_payload JSONB NOT NULL,
  failure_reason TEXT NOT NULL,
  failure_point TEXT NOT NULL,   -- 'auto_file_sent' | 'queue_sent' | 'auto_file_received' | 'queue_received'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX email_dead_letters_org_created ON email_dead_letters (org_id, created_at DESC);

ALTER TABLE email_dead_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own org dead letters"
  ON email_dead_letters FOR SELECT
  USING (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));
