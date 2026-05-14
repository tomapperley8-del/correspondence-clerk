-- Add disposition and follow_up_after fields to businesses
-- disposition: null = no disposition, 'follow_up_later' = revisit after date, 'not_interested' = no further outreach
-- follow_up_after: only relevant when disposition = 'follow_up_later'

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS disposition TEXT
    CHECK (disposition IN ('follow_up_later', 'not_interested')),
  ADD COLUMN IF NOT EXISTS follow_up_after DATE;

-- Required explicit GRANTs per Supabase Oct 2026 enforcement
GRANT SELECT, INSERT, UPDATE, DELETE ON businesses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON businesses TO service_role;
