-- Add GIN index for bcc_contact_ids array queries
-- This speeds up array containment queries used when checking if a contact
-- is BCC'd on any correspondence (e.g., during contact deletion)

CREATE INDEX IF NOT EXISTS idx_correspondence_bcc_contacts
  ON public.correspondence USING GIN (bcc_contact_ids);
