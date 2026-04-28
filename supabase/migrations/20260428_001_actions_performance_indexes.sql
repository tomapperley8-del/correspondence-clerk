-- Performance indexes for the five parallel Actions page queries + getNavData counts.
-- All are partial indexes — they only index the rows that actually matter for each
-- query, so they stay tiny even as correspondence grows.

-- 1. get_outstanding_actions RPC
--    WHERE organization_id = x AND action_needed != 'none'
--    Replaces a full correspondence seq-scan with an index scan on ~N action items.
CREATE INDEX IF NOT EXISTS idx_correspondence_action_items
  ON public.correspondence (organization_id, action_needed, entry_date DESC)
  WHERE action_needed != 'none';

-- 2. getNavData urgent + overdue counts (run on every page load via Navigation)
--    WHERE organization_id = x AND action_needed != 'none' AND reply_dismissed_at IS NULL
--    AND (due_at IS NULL OR due_at <= now)   ← urgent
--    AND due_at < now                         ← overdue
--    Single partial index serves both count queries via bitmap scan on (organization_id, due_at).
CREATE INDEX IF NOT EXISTS idx_correspondence_pending_actions
  ON public.correspondence (organization_id, due_at)
  WHERE action_needed != 'none' AND reply_dismissed_at IS NULL;

-- 3. getPureReminders
--    WHERE organization_id = x AND action_needed = 'none' AND due_at IS NOT NULL
--    ORDER BY due_at ASC LIMIT 200
CREATE INDEX IF NOT EXISTS idx_correspondence_reminders
  ON public.correspondence (organization_id, due_at ASC)
  WHERE action_needed = 'none' AND due_at IS NOT NULL;

-- 4. get_contract_expiries RPC
--    WHERE organization_id = x AND contract_end IS NOT NULL
--      AND contract_end BETWEEN now-90d AND now+90d
CREATE INDEX IF NOT EXISTS idx_businesses_contract_end
  ON public.businesses (organization_id, contract_end)
  WHERE contract_end IS NOT NULL;

-- 5. get_gone_quiet RPC
--    WHERE organization_id = x AND last_contacted_at IS NOT NULL
--      AND last_contacted_at < now - 60d
CREATE INDEX IF NOT EXISTS idx_businesses_last_contacted
  ON public.businesses (organization_id, last_contacted_at)
  WHERE last_contacted_at IS NOT NULL;

-- 6. get_action_counts — single-scan replacement for the two separate COUNT queries
--    that getNavData runs on every page load (urgent count + overdue count).
--    Returns both numbers in one index scan instead of two.
CREATE OR REPLACE FUNCTION public.get_action_counts(p_org_id uuid)
RETURNS TABLE (urgent_count bigint, overdue_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE due_at IS NULL OR due_at <= NOW()),
    COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < NOW())
  FROM correspondence
  WHERE organization_id = p_org_id
    AND action_needed != 'none'
    AND reply_dismissed_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_action_counts(uuid) TO authenticated;
