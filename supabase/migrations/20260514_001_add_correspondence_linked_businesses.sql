-- Add linked_business_ids array to correspondence
-- Allows a single correspondence record to surface on multiple business pages.
-- The primary business_id remains the owner; linked_business_ids holds secondary associations.
-- Edits to the record reflect on all associated pages automatically (one source of truth).

ALTER TABLE public.correspondence
  ADD COLUMN linked_business_ids UUID[] NOT NULL DEFAULT '{}';

-- GIN index for efficient ANY() queries when fetching correspondence for a business
CREATE INDEX idx_correspondence_linked_business_ids
  ON public.correspondence USING GIN (linked_business_ids);
