-- Create ENUM types for correspondence
CREATE TYPE public.entry_type AS ENUM ('Email', 'Call', 'Meeting');
CREATE TYPE public.action_needed_type AS ENUM ('none', 'prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal');

-- Create correspondence table
-- This table stores all correspondence entries (emails, calls, meetings)

CREATE TABLE IF NOT EXISTS public.correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Original and formatted text
  raw_text_original TEXT NOT NULL,
  formatted_text_original TEXT,
  formatted_text_current TEXT,

  -- Entry metadata
  entry_date TIMESTAMPTZ,
  subject TEXT,
  type public.entry_type,
  action_needed public.action_needed_type NOT NULL DEFAULT 'none',
  due_at TIMESTAMPTZ,

  -- AI processing metadata
  ai_metadata JSONB,

  -- Timestamps and edit tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for fast queries
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

-- Create compound index for dashboard queries (business + date)
CREATE INDEX IF NOT EXISTS idx_correspondence_business_date
  ON public.correspondence(business_id, entry_date DESC NULLS LAST);

-- Create trigger to call the updated_at function
CREATE TRIGGER set_correspondence_updated_at
  BEFORE UPDATE ON public.correspondence
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.correspondence IS 'Stores all correspondence entries (emails, calls, meetings) with original and formatted text';
COMMENT ON COLUMN public.correspondence.raw_text_original IS 'Original unformatted text as entered by user - never modified';
COMMENT ON COLUMN public.correspondence.formatted_text_original IS 'AI-formatted version of text when first saved - never modified';
COMMENT ON COLUMN public.correspondence.formatted_text_current IS 'Current version of formatted text - can be manually edited';
COMMENT ON COLUMN public.correspondence.edited_at IS 'Timestamp of last manual edit to formatted_text_current';
COMMENT ON COLUMN public.correspondence.edited_by IS 'User who made the last edit';
