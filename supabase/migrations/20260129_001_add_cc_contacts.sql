-- Migration: Add CC contacts support for correspondence entries
-- This allows a correspondence entry to have a primary contact plus optional CC contacts

-- Add cc_contact_ids column to correspondence table
ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS cc_contact_ids UUID[] DEFAULT '{}';

-- Create a GIN index for efficient querying of CC contacts
CREATE INDEX IF NOT EXISTS idx_correspondence_cc_contacts
  ON public.correspondence USING GIN (cc_contact_ids);

-- Add comment for documentation
COMMENT ON COLUMN public.correspondence.cc_contact_ids IS 'Array of contact UUIDs who were CC''d on this correspondence (optional)';
