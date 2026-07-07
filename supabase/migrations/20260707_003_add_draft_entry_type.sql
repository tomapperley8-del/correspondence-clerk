-- Feature 4: AI-generated email drafts are stored as correspondence entries with type 'Draft'
-- Applied to production via Supabase MCP on 07/07/2026.
ALTER TYPE entry_type ADD VALUE IF NOT EXISTS 'Draft';
