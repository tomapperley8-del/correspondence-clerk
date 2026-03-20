-- Add is_pinned column to correspondence
-- Pinned entries appear at the top of each section (Recent + Archive)

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_correspondence_pinned
  ON public.correspondence(business_id, is_pinned) WHERE is_pinned = true;

COMMENT ON COLUMN public.correspondence.is_pinned IS 'When true, entry is shown at the top of the section regardless of date';
