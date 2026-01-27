-- Performance indexes for multi-tenant queries
-- All data tables filter by organization_id; these indexes make those queries fast.

-- 1.1a: Index on businesses.organization_id
CREATE INDEX IF NOT EXISTS idx_businesses_organization_id
  ON public.businesses (organization_id);

-- 1.1b: Index on contacts.organization_id
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id
  ON public.contacts (organization_id);

-- 1.1c: Index on correspondence.organization_id
CREATE INDEX IF NOT EXISTS idx_correspondence_organization_id
  ON public.correspondence (organization_id);

-- 1.1d: Compound index for correspondence queries scoped to a business
CREATE INDEX IF NOT EXISTS idx_correspondence_org_business
  ON public.correspondence (organization_id, business_id);

-- 1.1e: Index for duplicate detection (content_hash + business_id)
CREATE INDEX IF NOT EXISTS idx_correspondence_content_hash_business
  ON public.correspondence (content_hash, business_id)
  WHERE content_hash IS NOT NULL;

-- 1.1f: Index for contacts by business_id (used on every business detail page)
CREATE INDEX IF NOT EXISTS idx_contacts_business_id
  ON public.contacts (business_id);

-- 1.1g: Index for correspondence entry_date ordering
CREATE INDEX IF NOT EXISTS idx_correspondence_entry_date
  ON public.correspondence (business_id, entry_date DESC NULLS LAST);
