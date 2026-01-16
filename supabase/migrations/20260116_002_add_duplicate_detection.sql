-- Add duplicate detection via content hashing
-- Migration: 20260116_002_add_duplicate_detection
-- Purpose: Prevent duplicate correspondence entries by hashing raw_text_original

-- Add content hash column
ALTER TABLE correspondence
  ADD COLUMN content_hash TEXT;

COMMENT ON COLUMN correspondence.content_hash IS 'SHA256 hash of raw_text_original for duplicate detection';

-- Create function to compute SHA256 hash
CREATE OR REPLACE FUNCTION compute_content_hash(raw_text TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Return null for null input
  IF raw_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Compute SHA256 hash of trimmed text
  RETURN encode(digest(trim(raw_text), 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION compute_content_hash IS 'Computes SHA256 hash of trimmed raw text for duplicate detection';

-- Create index for fast duplicate lookups
CREATE INDEX idx_correspondence_content_hash
  ON correspondence(content_hash)
  WHERE content_hash IS NOT NULL;

-- Backfill existing entries with content hashes
UPDATE correspondence
SET content_hash = compute_content_hash(raw_text_original)
WHERE content_hash IS NULL AND raw_text_original IS NOT NULL;
