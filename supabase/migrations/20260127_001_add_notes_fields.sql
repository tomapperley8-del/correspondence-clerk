-- Add notes fields to businesses and contacts tables
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
