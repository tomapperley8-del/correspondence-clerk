-- Unique URL per news lead so scraper Routines can use ON CONFLICT (source_url) DO NOTHING.
-- The first Routine run failed on ON CONFLICT (no unique constraint existed) and improvised
-- a rogue news_items table; its rows were migrated into news_leads and the table dropped.
-- Applied to production via Supabase MCP on 08/07/2026.
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_leads_source_url_unique
  ON news_leads (source_url) WHERE source_url IS NOT NULL;
DROP TABLE IF EXISTS news_items;
