-- Add BCC contacts support to correspondence table
-- BCC contacts are hidden recipients (not shown in correspondence display, but tracked for search)

ALTER TABLE public.correspondence
ADD COLUMN IF NOT EXISTS bcc_contact_ids UUID[] DEFAULT '{}';

-- Create GIN index for efficient array queries
CREATE INDEX IF NOT EXISTS idx_correspondence_bcc_contacts
ON public.correspondence USING GIN (bcc_contact_ids);

COMMENT ON COLUMN public.correspondence.bcc_contact_ids IS 'Array of contact IDs who were BCC recipients';
