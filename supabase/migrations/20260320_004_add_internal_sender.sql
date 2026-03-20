-- Add internal_sender column to correspondence
-- Stores the name of the internal team member who sent/received (Bridget, Tom, James, Dawn)

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS internal_sender TEXT;

COMMENT ON COLUMN public.correspondence.internal_sender IS 'Internal team member name (Bridget/Tom/James/Dawn/info@) who sent or received this correspondence';
