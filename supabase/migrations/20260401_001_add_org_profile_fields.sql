-- Add extended AI context fields to organizations table
-- These fields power the Insights feature prompt builders

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS value_proposition      TEXT,
  ADD COLUMN IF NOT EXISTS ideal_customer_profile TEXT,
  ADD COLUMN IF NOT EXISTS services_offered       TEXT,
  ADD COLUMN IF NOT EXISTS typical_deal_value     TEXT,
  ADD COLUMN IF NOT EXISTS email_writing_style    TEXT;
