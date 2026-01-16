-- Add formatting status tracking to correspondence table
-- This allows us to track entries that were saved without AI formatting

-- Add formatting_status column
ALTER TABLE correspondence
ADD COLUMN formatting_status TEXT NOT NULL DEFAULT 'formatted'
CHECK (formatting_status IN ('formatted', 'unformatted', 'failed'));

-- Add index for finding unformatted entries
CREATE INDEX idx_correspondence_formatting_status
ON correspondence(formatting_status)
WHERE formatting_status != 'formatted';

-- Add comment for documentation
COMMENT ON COLUMN correspondence.formatting_status IS
'Status of AI formatting: formatted (successful), unformatted (user bypassed AI), failed (AI error but saved anyway)';
