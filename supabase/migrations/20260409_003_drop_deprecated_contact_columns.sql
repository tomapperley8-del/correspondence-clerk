-- Drop deprecated single-value contact columns.
-- Replaced by emails[] (JSONB) and phones[] (JSONB) in migration 20250117_001.
-- normalized_email is kept — it is still used as a lookup index.
-- All application code has been updated to use the array fields.

ALTER TABLE public.contacts
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS phone;
