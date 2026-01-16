-- Create contacts table
-- This table stores contact persons for each business

CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  normalized_email TEXT,
  role TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure normalized_email is unique per business (but allow NULL)
  CONSTRAINT unique_business_email UNIQUE (business_id, normalized_email)
);

-- Create index on business_id for fast lookups of contacts per business
CREATE INDEX IF NOT EXISTS idx_contacts_business_id
  ON public.contacts(business_id);

-- Create index on normalized_email for search/matching
CREATE INDEX IF NOT EXISTS idx_contacts_normalized_email
  ON public.contacts(normalized_email) WHERE normalized_email IS NOT NULL;

-- Create index on name for search
CREATE INDEX IF NOT EXISTS idx_contacts_name
  ON public.contacts(name);

-- Create trigger to call the updated_at function
CREATE TRIGGER set_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.contacts IS 'Stores contact persons for businesses with role, email, and phone details';
COMMENT ON CONSTRAINT unique_business_email ON public.contacts IS 'Ensures each email is unique within a business (NULL emails allowed)';
