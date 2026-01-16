-- Add full-text search to correspondence table
-- This allows fast keyword search across all correspondence entries

-- Add tsvector column for full-text search
ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create function to update search_vector
CREATE OR REPLACE FUNCTION public.correspondence_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.formatted_text_current, NEW.formatted_text_original, NEW.raw_text_original, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update search_vector on insert/update
CREATE TRIGGER correspondence_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.correspondence
  FOR EACH ROW
  EXECUTE FUNCTION public.correspondence_search_vector_update();

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_correspondence_search_vector
  ON public.correspondence USING GIN(search_vector);

-- Update existing rows (if any) with search vectors
UPDATE public.correspondence
SET search_vector =
  setweight(to_tsvector('english', COALESCE(subject, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(formatted_text_current, formatted_text_original, raw_text_original, '')), 'B')
WHERE search_vector IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.correspondence.search_vector IS 'Full-text search index combining subject (weight A) and content (weight B)';
COMMENT ON FUNCTION public.correspondence_search_vector_update IS 'Automatically updates search_vector when correspondence is inserted or updated';
