-- get_gone_quiet
--
-- Returns businesses in an org where:
--   - last_contacted_at IS NOT NULL
--   - last_contacted_at < NOW() - 60 days
--   - business has >= 3 correspondence entries
--
-- Replaces the previous pattern of fetching businesses + embedded count and
-- filtering client-side. Moving the HAVING clause to SQL cuts transfer size
-- and avoids O(n) JS post-processing.

CREATE OR REPLACE FUNCTION public.get_gone_quiet(p_org_id UUID)
RETURNS TABLE (
  id                   UUID,
  name                 TEXT,
  last_contacted_at    TIMESTAMPTZ,
  correspondence_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT b.id,
         b.name,
         b.last_contacted_at,
         COUNT(c.id) AS correspondence_count
  FROM public.businesses b
  LEFT JOIN public.correspondence c ON c.business_id = b.id
  WHERE b.organization_id = p_org_id
    AND b.last_contacted_at IS NOT NULL
    AND b.last_contacted_at < (NOW() - INTERVAL '60 days')
  GROUP BY b.id
  HAVING COUNT(c.id) >= 3
  ORDER BY b.last_contacted_at ASC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_gone_quiet(UUID) TO authenticated;
