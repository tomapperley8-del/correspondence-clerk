-- Table for temporary email data storage (expires after 1 hour)
-- Used by bookmarklet to bypass URL length limits
CREATE TABLE IF NOT EXISTS public.temporary_email_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  email_data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast token lookups
CREATE INDEX idx_temp_email_token ON public.temporary_email_data(token);

-- Index for cleanup queries
CREATE INDEX idx_temp_email_expires ON public.temporary_email_data(expires_at);

-- Row Level Security (RLS)
ALTER TABLE public.temporary_email_data ENABLE ROW LEVEL SECURITY;

-- Users can only insert their own temporary data
CREATE POLICY "Users can insert their own temp email data"
  ON public.temporary_email_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only select their own non-expired temporary data
CREATE POLICY "Users can select their own temp email data"
  ON public.temporary_email_data
  FOR SELECT
  USING (auth.uid() = user_id AND expires_at > now());

-- Users can only delete their own temporary data
CREATE POLICY "Users can delete their own temp email data"
  ON public.temporary_email_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to automatically clean up expired tokens (for scheduled cleanup jobs)
CREATE OR REPLACE FUNCTION cleanup_expired_temp_email_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.temporary_email_data
  WHERE expires_at < now();
END;
$$;

-- Grant execute permission on cleanup function to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_expired_temp_email_data() TO authenticated;
