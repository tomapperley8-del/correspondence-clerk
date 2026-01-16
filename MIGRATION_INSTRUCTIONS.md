# Running Migration: Add Formatting Status

## Quick Steps

1. **Open Supabase Dashboard**: Go to your project at https://supabase.com/dashboard
2. **Navigate to SQL Editor**: Click "SQL Editor" in the left sidebar
3. **Create New Query**: Click "New Query"
4. **Paste the SQL below** and click "Run"

## SQL to Run

```sql
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
```

## What This Does

- Adds `formatting_status` column to track whether entries were AI-formatted
- Defaults all existing entries to 'formatted' status
- Creates an index for quick filtering of unformatted entries
- Adds a constraint to ensure only valid values: 'formatted', 'unformatted', or 'failed'

## Verification

After running, you can verify it worked by running:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'correspondence'
AND column_name = 'formatting_status';
```

You should see the new column listed.
