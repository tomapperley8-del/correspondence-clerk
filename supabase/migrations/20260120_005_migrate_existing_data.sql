-- Migrate existing data to "The Chiswick Calendar" organization
-- This migration ensures all existing data is preserved and accessible to existing users

-- Step 1: Create "The Chiswick Calendar" organization with fixed UUID
-- Using fixed UUID ensures consistent reference across environments
INSERT INTO public.organizations (id, name, created_at, updated_at, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'The Chiswick Calendar',
  now(),
  now(),
  NULL -- No specific creator for the default organization
)
ON CONFLICT (id) DO NOTHING; -- Idempotent: safe to run multiple times

-- Step 2: Create user_profiles for all existing users
-- All existing users become members of The Chiswick Calendar
INSERT INTO public.user_profiles (id, organization_id, display_name, created_at, updated_at)
SELECT
  id,
  '00000000-0000-0000-0000-000000000001'::uuid AS organization_id,
  email AS display_name, -- Use email as default display name
  created_at,
  now() AS updated_at
FROM auth.users
ON CONFLICT (id) DO NOTHING; -- Idempotent: skip if profile already exists

-- Step 3: Update all existing businesses to belong to The Chiswick Calendar
UPDATE public.businesses
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Step 4: Update all existing contacts to belong to The Chiswick Calendar
UPDATE public.contacts
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Step 5: Update all existing correspondence to belong to The Chiswick Calendar
UPDATE public.correspondence
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Step 6: Make organization_id NOT NULL on all tables
-- This enforces data integrity going forward
ALTER TABLE public.businesses
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.contacts
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.correspondence
  ALTER COLUMN organization_id SET NOT NULL;

-- Add comments for documentation
COMMENT ON CONSTRAINT businesses_organization_id_fkey ON public.businesses IS 'Every business must belong to an organization';
COMMENT ON CONSTRAINT contacts_organization_id_fkey ON public.contacts IS 'Every contact must belong to an organization';
COMMENT ON CONSTRAINT correspondence_organization_id_fkey ON public.correspondence IS 'Every correspondence entry must belong to an organization';

-- Log migration completion (optional, for auditing)
DO $$
DECLARE
  business_count INTEGER;
  contact_count INTEGER;
  correspondence_count INTEGER;
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO business_count FROM public.businesses WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO contact_count FROM public.contacts WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO correspondence_count FROM public.correspondence WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO user_count FROM public.user_profiles WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

  RAISE NOTICE 'Migration complete: % businesses, % contacts, % correspondence entries, % users migrated to The Chiswick Calendar',
    business_count, contact_count, correspondence_count, user_count;
END $$;
