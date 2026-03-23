-- Add OAuth token columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS google_access_token     TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token    TEXT,
  ADD COLUMN IF NOT EXISTS google_token_expiry     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS microsoft_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS microsoft_token_expiry  TIMESTAMPTZ;

-- Import queue for background AI formatting of bulk-imported emails
CREATE TABLE IF NOT EXISTS public.import_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  correspondence_id UUID NOT NULL REFERENCES public.correspondence(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  retry_count       INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_queue_status ON public.import_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_import_queue_org_id ON public.import_queue(org_id);
CREATE INDEX IF NOT EXISTS idx_import_queue_corr_id ON public.import_queue(correspondence_id);

ALTER TABLE public.import_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own org queue"
  ON public.import_queue FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE TRIGGER update_import_queue_updated_at
  BEFORE UPDATE ON public.import_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.import_queue IS
  'Background AI formatting queue for bulk-imported emails.';
