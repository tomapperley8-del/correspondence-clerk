-- Partial index on the hot path: reply_dismissed_at IS NULL rows
-- Hit by getNeedsReply(), getNavData() overdue counts, and get_open_threads RPC
CREATE INDEX IF NOT EXISTS idx_correspondence_reply_dismissed_null
  ON correspondence (organization_id, entry_date DESC)
  WHERE reply_dismissed_at IS NULL;
