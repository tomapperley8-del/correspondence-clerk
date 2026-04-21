-- Partial index on the hot slice of correspondence rows where reply_dismissed_at IS NULL.
-- Accelerates getNeedsReply(), getNavData() counts, and the get_open_threads RPC.

CREATE INDEX IF NOT EXISTS idx_correspondence_reply_dismissed_null
  ON correspondence (organization_id, entry_date DESC)
  WHERE reply_dismissed_at IS NULL;
