-- ==============================================
-- COMBINED MIGRATION: All database tables, indexes, and RLS policies
-- Run this entire file in Supabase SQL Editor
-- ==============================================

-- ==================== MIGRATION 1: BUSINESSES TABLE ====================

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

CREATE INDEX IF NOT EXISTS idx_businesses_normalized_name
  ON public.businesses(normalized_name);

CREATE INDEX IF NOT EXISTS idx_businesses_last_contacted
  ON public.businesses(last_contacted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_businesses_category
  ON public.businesses(category) WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_status
  ON public.businesses(status) WHERE status IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.businesses IS 'Stores business/client records with category, status, and contact tracking';

-- ==================== MIGRATION 2: CONTACTS TABLE ====================

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
  CONSTRAINT unique_business_email UNIQUE (business_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_contacts_business_id
  ON public.contacts(business_id);

CREATE INDEX IF NOT EXISTS idx_contacts_normalized_email
  ON public.contacts(normalized_email) WHERE normalized_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_name
  ON public.contacts(name);

CREATE TRIGGER set_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.contacts IS 'Stores contact persons for businesses with role, email, and phone details';
COMMENT ON CONSTRAINT unique_business_email ON public.contacts IS 'Ensures each email is unique within a business (NULL emails allowed)';

-- ==================== MIGRATION 3: CORRESPONDENCE TABLE ====================

CREATE TYPE public.entry_type AS ENUM ('Email', 'Call', 'Meeting');
CREATE TYPE public.action_needed_type AS ENUM ('none', 'prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal');

CREATE TABLE IF NOT EXISTS public.correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  raw_text_original TEXT NOT NULL,
  formatted_text_original TEXT,
  formatted_text_current TEXT,
  entry_date TIMESTAMPTZ,
  subject TEXT,
  type public.entry_type,
  action_needed public.action_needed_type NOT NULL DEFAULT 'none',
  due_at TIMESTAMPTZ,
  ai_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_correspondence_business_id
  ON public.correspondence(business_id);

CREATE INDEX IF NOT EXISTS idx_correspondence_contact_id
  ON public.correspondence(contact_id);

CREATE INDEX IF NOT EXISTS idx_correspondence_user_id
  ON public.correspondence(user_id);

CREATE INDEX IF NOT EXISTS idx_correspondence_entry_date
  ON public.correspondence(entry_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_correspondence_action_needed
  ON public.correspondence(action_needed) WHERE action_needed != 'none';

CREATE INDEX IF NOT EXISTS idx_correspondence_due_at
  ON public.correspondence(due_at) WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_correspondence_business_date
  ON public.correspondence(business_id, entry_date DESC NULLS LAST);

CREATE TRIGGER set_correspondence_updated_at
  BEFORE UPDATE ON public.correspondence
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.correspondence IS 'Stores all correspondence entries (emails, calls, meetings) with original and formatted text';
COMMENT ON COLUMN public.correspondence.raw_text_original IS 'Original unformatted text as entered by user - never modified';
COMMENT ON COLUMN public.correspondence.formatted_text_original IS 'AI-formatted version of text when first saved - never modified';
COMMENT ON COLUMN public.correspondence.formatted_text_current IS 'Current version of formatted text - can be manually edited';

-- ==================== MIGRATION 4: FULL-TEXT SEARCH ====================

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.correspondence_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.formatted_text_current, NEW.formatted_text_original, NEW.raw_text_original, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER correspondence_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.correspondence
  FOR EACH ROW
  EXECUTE FUNCTION public.correspondence_search_vector_update();

CREATE INDEX IF NOT EXISTS idx_correspondence_search_vector
  ON public.correspondence USING GIN(search_vector);

COMMENT ON COLUMN public.correspondence.search_vector IS 'Full-text search index combining subject (weight A) and content (weight B)';

-- ==================== MIGRATION 5: ROW LEVEL SECURITY (RLS) ====================

-- Enable RLS on all tables
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondence ENABLE ROW LEVEL SECURITY;

-- Businesses policies
CREATE POLICY "Authenticated users can read all businesses"
  ON public.businesses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert businesses"
  ON public.businesses FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update all businesses"
  ON public.businesses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete businesses"
  ON public.businesses FOR DELETE TO authenticated USING (true);

-- Contacts policies
CREATE POLICY "Authenticated users can read all contacts"
  ON public.contacts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert contacts"
  ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update all contacts"
  ON public.contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete contacts"
  ON public.contacts FOR DELETE TO authenticated USING (true);

-- Correspondence policies
CREATE POLICY "Authenticated users can read all correspondence"
  ON public.correspondence FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert correspondence"
  ON public.correspondence FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update all correspondence"
  ON public.correspondence FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete correspondence"
  ON public.correspondence FOR DELETE TO authenticated USING (true);

-- ==============================================
-- END OF COMBINED MIGRATION
-- ==============================================
