-- Add contract fields to businesses table
-- For Club Cards: start/end dates
-- For Advertisers: deal terms, payment structure, amount

ALTER TABLE businesses
ADD COLUMN contract_start DATE,
ADD COLUMN contract_end DATE,
ADD COLUMN deal_terms TEXT,
ADD COLUMN payment_structure TEXT,
ADD COLUMN contract_amount NUMERIC(10, 2);

-- Add index for contract end date (useful for finding expiring contracts)
CREATE INDEX idx_businesses_contract_end ON businesses(contract_end) WHERE contract_end IS NOT NULL;
