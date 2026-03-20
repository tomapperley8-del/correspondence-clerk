-- Add 'Note' to entry_type enum
-- Also make contact_id nullable (Notes don't require a contact)

ALTER TYPE public.entry_type ADD VALUE IF NOT EXISTS 'Note';

ALTER TABLE public.correspondence
  ALTER COLUMN contact_id DROP NOT NULL;

COMMENT ON COLUMN public.correspondence.contact_id IS 'Contact this correspondence is with. Nullable for Note type entries.';
