-- Create businesses table
-- This table stores all business/client records

CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  category TEXT,
  status TEXT,
  is_club_card BOOLEAN NOT NULL DEFAULT false,
  is_advertiser BOOLEAN NOT NULL DEFAULT false,
  last_contacted_at TIMESTAMPTZ,
  mastersheet_source_ids JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on normalized_name for fast lookups
CREATE INDEX IF NOT EXISTS idx_businesses_normalized_name
  ON public.businesses(normalized_name);

-- Create index on last_contacted_at for sorting dashboard
CREATE INDEX IF NOT EXISTS idx_businesses_last_contacted
  ON public.businesses(last_contacted_at DESC NULLS LAST);

-- Create index on category and status for filtering
CREATE INDEX IF NOT EXISTS idx_businesses_category
  ON public.businesses(category) WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_status
  ON public.businesses(status) WHERE status IS NOT NULL;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function on updates
CREATE TRIGGER set_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.businesses IS 'Stores business/client records with category, status, and contact tracking';
