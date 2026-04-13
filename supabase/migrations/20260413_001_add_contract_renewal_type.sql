-- Add contract_renewal_type to businesses
-- null     = unknown (default — existing behaviour, fires renewal signal)
-- recurring = annual/ongoing membership — fires renewal signal as normal
-- one_off   = event, campaign, short-term deal — suppressed from renewal signals forever
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS contract_renewal_type TEXT DEFAULT NULL
  CHECK (contract_renewal_type IN ('recurring', 'one_off'));
