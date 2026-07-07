-- Feature 1: tables written by external Claude Code Routines (news + prospecting scrapers).
-- The app only reads these and updates status.
-- Applied to production via Supabase MCP on 07/07/2026.

CREATE TABLE IF NOT EXISTS news_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_name text NOT NULL,
  source_url text,
  snippet text,
  relevance_reason text,
  story_type text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','writing','published','killed')),
  found_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospect_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  source_name text NOT NULL,
  source_url text,
  address text,
  business_category text,
  snippet text,
  matched_business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  match_type text NOT NULL CHECK (match_type IN ('new_business','existing_no_deal','existing_expired','existing_dormant')),
  opportunity_notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','outreach_planned','contacted','converted','rejected')),
  found_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scraper_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_type text CHECK (scraper_type IN ('news','prospecting')),
  sources_checked text[],
  leads_created integer,
  errors jsonb,
  run_at timestamptz DEFAULT now(),
  duration_seconds integer
);

-- Indexes on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_news_leads_status ON news_leads (status);
CREATE INDEX IF NOT EXISTS idx_news_leads_found_at ON news_leads (found_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_leads_source_name ON news_leads (source_name);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_status ON prospect_leads (status);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_found_at ON prospect_leads (found_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_source_name ON prospect_leads (source_name);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_matched_business_id ON prospect_leads (matched_business_id);
CREATE INDEX IF NOT EXISTS idx_scraper_logs_run_at ON scraper_logs (run_at DESC);

-- updated_at triggers (same handle_updated_at fn used elsewhere)
CREATE TRIGGER news_leads_updated_at BEFORE UPDATE ON news_leads
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER prospect_leads_updated_at BEFORE UPDATE ON prospect_leads
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- RLS: authenticated users only (matches business_articles pattern; Routines write via service role)
ALTER TABLE news_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read news leads" ON news_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert news leads" ON news_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update news leads" ON news_leads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete news leads" ON news_leads FOR DELETE TO authenticated USING (true);

CREATE POLICY "Users can read prospect leads" ON prospect_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert prospect leads" ON prospect_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update prospect leads" ON prospect_leads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete prospect leads" ON prospect_leads FOR DELETE TO authenticated USING (true);

CREATE POLICY "Users can read scraper logs" ON scraper_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert scraper logs" ON scraper_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update scraper logs" ON scraper_logs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete scraper logs" ON scraper_logs FOR DELETE TO authenticated USING (true);

-- Explicit grants (matches 20260514_003 pattern)
GRANT SELECT, INSERT, UPDATE, DELETE ON news_leads, prospect_leads, scraper_logs TO authenticated;
GRANT ALL ON news_leads, prospect_leads, scraper_logs TO service_role;
