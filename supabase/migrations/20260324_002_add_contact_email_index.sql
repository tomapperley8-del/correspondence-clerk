-- Compound index for contact lookup by org + normalised email
-- Used heavily during bulk import (execute-chunk resolveContact queries)
CREATE INDEX IF NOT EXISTS idx_contacts_org_normalized_email
  ON public.contacts (organization_id, normalized_email)
  WHERE normalized_email IS NOT NULL;
