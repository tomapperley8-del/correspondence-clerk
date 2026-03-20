-- Drop the unique_business_email constraint on contacts
-- Allow same email address across multiple contacts at the same business
-- (e.g. shared mailbox, or multiple contacts who all use info@business.com)

-- Drop the unique constraint if it exists (name may vary)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'contacts'
    AND constraint_name = 'unique_business_email'
  ) THEN
    ALTER TABLE public.contacts DROP CONSTRAINT unique_business_email;
  END IF;
END $$;

-- Also drop the unique index if it exists separately
DROP INDEX IF EXISTS public.idx_contacts_unique_business_email;
DROP INDEX IF EXISTS public.unique_business_email;
