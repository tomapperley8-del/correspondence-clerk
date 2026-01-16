-- Migration: Add support for multiple emails and phone numbers per contact
-- This migration adds JSONB array fields and migrates existing data

-- Add new columns for multiple emails and phones
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS emails JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS phones JSONB DEFAULT '[]'::jsonb;

-- Migrate existing email data to the emails array
UPDATE public.contacts
SET emails =
  CASE
    WHEN email IS NOT NULL AND email != '' THEN jsonb_build_array(email)
    ELSE '[]'::jsonb
  END
WHERE emails = '[]'::jsonb;

-- Migrate existing phone data to the phones array
UPDATE public.contacts
SET phones =
  CASE
    WHEN phone IS NOT NULL AND phone != '' THEN jsonb_build_array(phone)
    ELSE '[]'::jsonb
  END
WHERE phones = '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN public.contacts.emails IS 'Array of email addresses for this contact (stored as JSONB array)';
COMMENT ON COLUMN public.contacts.phones IS 'Array of phone numbers for this contact (stored as JSONB array)';

-- Note: We're keeping the old email/phone columns for backward compatibility
-- They can be removed in a future migration once all code has been updated
COMMENT ON COLUMN public.contacts.email IS 'DEPRECATED: Use emails array instead. Kept for backward compatibility.';
COMMENT ON COLUMN public.contacts.phone IS 'DEPRECATED: Use phones array instead. Kept for backward compatibility.';
