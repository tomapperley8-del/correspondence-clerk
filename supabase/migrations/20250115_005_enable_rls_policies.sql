-- Enable Row Level Security (RLS) on all tables
-- V1: All authenticated users can access all data

-- Enable RLS on businesses table
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for businesses
CREATE POLICY "Authenticated users can read all businesses"
  ON public.businesses
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert businesses"
  ON public.businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update all businesses"
  ON public.businesses
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete businesses"
  ON public.businesses
  FOR DELETE
  TO authenticated
  USING (true);

-- Enable RLS on contacts table
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contacts
CREATE POLICY "Authenticated users can read all contacts"
  ON public.contacts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert contacts"
  ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update all contacts"
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contacts"
  ON public.contacts
  FOR DELETE
  TO authenticated
  USING (true);

-- Enable RLS on correspondence table
ALTER TABLE public.correspondence ENABLE ROW LEVEL SECURITY;

-- RLS Policies for correspondence
CREATE POLICY "Authenticated users can read all correspondence"
  ON public.correspondence
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert correspondence"
  ON public.correspondence
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update all correspondence"
  ON public.correspondence
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete correspondence"
  ON public.correspondence
  FOR DELETE
  TO authenticated
  USING (true);

-- Add comments for documentation
COMMENT ON POLICY "Authenticated users can read all businesses" ON public.businesses IS 'V1: All authenticated users can view all business records';
COMMENT ON POLICY "Authenticated users can read all contacts" ON public.contacts IS 'V1: All authenticated users can view all contact records';
COMMENT ON POLICY "Authenticated users can read all correspondence" ON public.correspondence IS 'V1: All authenticated users can view all correspondence records';
