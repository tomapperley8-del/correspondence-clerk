-- Add billing_frequency to contracts table
-- Tracks whether the contract amount is monthly or annual

ALTER TABLE contracts
ADD COLUMN billing_frequency TEXT NOT NULL DEFAULT 'annual'
  CHECK (billing_frequency IN ('monthly', 'annual'));
