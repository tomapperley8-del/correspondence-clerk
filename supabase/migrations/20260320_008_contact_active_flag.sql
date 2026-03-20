-- Add is_active flag to contacts
-- Allows marking contacts who have left a company as inactive
-- Inactive contacts show as "(Former)" and are listed below active ones

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_contacts_active
  ON public.contacts(business_id, is_active);

COMMENT ON COLUMN public.contacts.is_active IS 'When false, contact has left the company. Shown as "(Former)" throughout the app.';
