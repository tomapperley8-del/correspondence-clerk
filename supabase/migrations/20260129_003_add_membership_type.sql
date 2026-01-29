-- Add membership_type field to businesses table
-- Replaces is_club_card and is_advertiser boolean fields with a single enum

-- Add the new column
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS membership_type TEXT DEFAULT NULL;

-- Migrate existing data
UPDATE public.businesses
SET membership_type = CASE
  WHEN is_club_card = true AND is_advertiser = true THEN 'club_card' -- Prioritize club card if both
  WHEN is_club_card = true THEN 'club_card'
  WHEN is_advertiser = true THEN 'advertiser'
  ELSE NULL
END
WHERE membership_type IS NULL AND (is_club_card = true OR is_advertiser = true);

-- Add constraint for valid values
ALTER TABLE public.businesses
ADD CONSTRAINT businesses_membership_type_check
CHECK (membership_type IS NULL OR membership_type IN ('club_card', 'advertiser', 'former_club_card', 'former_advertiser'));

COMMENT ON COLUMN public.businesses.membership_type IS 'Membership status: club_card, advertiser, former_club_card, former_advertiser';
