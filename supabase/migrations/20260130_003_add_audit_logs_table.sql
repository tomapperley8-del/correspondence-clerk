-- Audit logging table for tracking admin actions
-- Records who performed sensitive operations and when

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,               -- e.g., 'import_mastersheet', 'import_google_docs'
  status TEXT NOT NULL DEFAULT 'success',  -- 'success', 'failure', 'partial'
  metadata JSONB DEFAULT '{}',        -- Additional details (counts, errors, etc.)
  ip_address TEXT,                    -- Optional: client IP if available
  user_agent TEXT,                    -- Optional: client user agent
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by user
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);

-- Index for querying by organization
CREATE INDEX idx_audit_logs_organization_id ON public.audit_logs(organization_id);

-- Index for querying by action type
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- Index for time-based queries
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- RLS: Only admins can read audit logs, system can write
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs in their organization
CREATE POLICY "Admins can read org audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can insert (used by server actions)
-- Note: Server actions use service role key, so this policy allows inserts
CREATE POLICY "Service can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.audit_logs IS 'Audit trail for sensitive admin operations like data imports.';
COMMENT ON COLUMN public.audit_logs.action IS 'Type of action performed (import_mastersheet, import_google_docs, etc.)';
COMMENT ON COLUMN public.audit_logs.status IS 'Outcome of the action: success, failure, or partial';
COMMENT ON COLUMN public.audit_logs.metadata IS 'JSON containing action-specific details like record counts, errors, etc.';
