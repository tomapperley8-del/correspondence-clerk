-- get_needs_reply_candidates
--
-- Returns the 500 most recent correspondence entries in an org within the past
-- year that are NOT reply-dismissed. The caller (app/actions/correspondence.ts)
-- runs the direction/date/action_needed filtering and per-business dedup in JS
-- (logic is intricate — kept out of SQL intentionally).
--
-- The ONLY purpose of this RPC is to replace `formatted_text_current` with a
-- 600-char truncation, cutting wire transfer from ~several MB to a few hundred
-- KB on orgs with long email bodies. 600 chars is comfortably more than the
-- client-side likelyNeedsReply() heuristic or the 150-char display snippet need.

CREATE OR REPLACE FUNCTION public.get_needs_reply_candidates(p_org_id UUID)
RETURNS TABLE (
  id             UUID,
  business_id    UUID,
  contact_id     UUID,
  subject        TEXT,
  type           TEXT,
  direction      TEXT,
  entry_date     TIMESTAMPTZ,
  action_needed  TEXT,
  due_at         TIMESTAMPTZ,
  snippet_text   TEXT,
  business_name  TEXT,
  contact_name   TEXT,
  contact_role   TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.id,
         c.business_id,
         c.contact_id,
         c.subject,
         c.type,
         c.direction,
         c.entry_date,
         c.action_needed,
         c.due_at,
         LEFT(c.formatted_text_current, 600) AS snippet_text,
         b.name AS business_name,
         ct.name AS contact_name,
         ct.role AS contact_role
  FROM public.correspondence c
  JOIN public.businesses b ON b.id = c.business_id
  LEFT JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE c.organization_id = p_org_id
    AND c.entry_date >= (NOW() - INTERVAL '365 days')
    AND c.reply_dismissed_at IS NULL
  ORDER BY c.entry_date DESC
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.get_needs_reply_candidates(UUID) TO authenticated;
