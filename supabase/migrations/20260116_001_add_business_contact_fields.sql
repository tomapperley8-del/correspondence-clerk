-- Add contact information fields to businesses table
-- Migration: 20260116_001_add_business_contact_fields
-- Purpose: Allow storing business address, email, and phone for display in business context box

ALTER TABLE businesses
  ADD COLUMN address TEXT,
  ADD COLUMN email TEXT,
  ADD COLUMN phone TEXT;

COMMENT ON COLUMN businesses.address IS 'Business physical address';
COMMENT ON COLUMN businesses.email IS 'Business primary email contact';
COMMENT ON COLUMN businesses.phone IS 'Business primary phone number';
