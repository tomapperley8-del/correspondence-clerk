-- Add remaining performance indexes
-- 1. Temporary email data indexes for token lookup and cleanup
-- 2. CC contacts GIN index for searching correspondence by CC recipients

-- Index for token lookup in temporary_email_data
CREATE INDEX IF NOT EXISTS idx_temporary_email_data_token
  ON public.temporary_email_data (token);

-- Index for cleanup queries on expires_at
CREATE INDEX IF NOT EXISTS idx_temporary_email_data_expires_at
  ON public.temporary_email_data (expires_at);

-- GIN index for cc_contact_ids (bcc already has one from 20260131_001)
CREATE INDEX IF NOT EXISTS idx_correspondence_cc_contacts
  ON public.correspondence USING GIN (cc_contact_ids);
