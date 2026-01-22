-- Add contract_currency column to businesses table
-- Migration: 20260122_001_add_contract_currency
-- Purpose: Allow storing contract currency (default GBP)

ALTER TABLE businesses
  ADD COLUMN contract_currency VARCHAR(3) DEFAULT 'GBP';

COMMENT ON COLUMN businesses.contract_currency IS 'Currency code for contract amount (ISO 4217, default GBP)';
