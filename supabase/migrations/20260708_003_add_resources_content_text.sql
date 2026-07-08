-- Feature 2 addition: paste-text resources (email templates etc.) store their body directly
-- in the row so it can be viewed and copied inline on the Resource Hub, formatting preserved.
-- Applied to production via Supabase MCP on 08/07/2026.
ALTER TABLE resources ADD COLUMN IF NOT EXISTS content_text text;
