-- Rate limiting table for serverless-compatible rate limiting
-- Replaces in-memory store that doesn't work across Vercel instances

CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,           -- user_id or 'anonymous' or custom key
  endpoint TEXT NOT NULL,             -- endpoint being rate limited (e.g., 'ai-formatter')
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: one rate limit entry per identifier+endpoint combo
  CONSTRAINT rate_limits_identifier_endpoint_key UNIQUE (identifier, endpoint)
);

-- Index for fast lookups
CREATE INDEX idx_rate_limits_identifier_endpoint ON public.rate_limits(identifier, endpoint);

-- Index for cleanup queries
CREATE INDEX idx_rate_limits_expires_at ON public.rate_limits(expires_at);

-- RLS: Users can only see/modify their own rate limit entries
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own rate limits"
  ON public.rate_limits
  FOR ALL
  USING (identifier = auth.uid()::text OR identifier = 'anonymous')
  WITH CHECK (identifier = auth.uid()::text OR identifier = 'anonymous');

-- Function to clean up expired rate limit entries
-- Can be called via cron job or scheduled function
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits
  WHERE expires_at < now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Comment for documentation
COMMENT ON TABLE public.rate_limits IS 'Rate limiting entries for API endpoints. Entries auto-expire and should be cleaned up periodically.';
COMMENT ON FUNCTION public.cleanup_expired_rate_limits() IS 'Removes expired rate limit entries. Call periodically via cron or scheduled function.';
