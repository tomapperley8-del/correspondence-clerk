-- get_outstanding_actions v3 (drop required — return type changed to add other_items_count):
-- + other_items_count: number of hidden sibling items for the same business
-- - removed stale-overdue filter (overdue items now stay until explicitly marked Done)
-- Keeps: no-due-date stale filter, one-per-business deduplication

DROP FUNCTION IF EXISTS get_outstanding_actions(uuid);

CREATE OR REPLACE FUNCTION get_outstanding_actions(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  contact_id uuid,
  subject text,
  type text,
  direction text,
  entry_date timestamptz,
  due_at timestamptz,
  action_needed text,
  formatted_text_current text,
  businesses jsonb,
  contact jsonb,
  other_items_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH filtered AS (
  SELECT
    c.id,
    c.business_id,
    c.contact_id,
    c.subject,
    c.type,
    c.direction,
    c.entry_date,
    c.due_at,
    c.action_needed,
    c.formatted_text_current,
    jsonb_build_object('id', b.id, 'name', b.name) AS businesses,
    CASE WHEN ct.id IS NOT NULL
         THEN jsonb_build_object('name', ct.name, 'role', ct.role)
         ELSE NULL
    END AS contact,
    ROW_NUMBER() OVER (
      PARTITION BY c.business_id
      ORDER BY
        CASE WHEN c.due_at < NOW() THEN 0 WHEN c.due_at IS NOT NULL THEN 1 ELSE 2 END,
        c.due_at ASC NULLS LAST,
        c.entry_date DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY c.business_id) - 1 AS other_items_count
  FROM correspondence c
  JOIN businesses b ON b.id = c.business_id AND b.organization_id = p_org_id
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.organization_id = p_org_id
    AND c.action_needed != 'none'
    -- No-due-date items: hide if any later correspondence exists (moved on)
    AND (
      c.due_at IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM correspondence c2
        WHERE c2.business_id = c.business_id
          AND c2.organization_id = p_org_id
          AND c2.entry_date > c.entry_date
      )
    )
)
SELECT id, business_id, contact_id, subject, type, direction, entry_date, due_at,
       action_needed, formatted_text_current, businesses, contact,
       other_items_count::integer
FROM filtered
WHERE rn = 1
ORDER BY due_at ASC NULLS LAST, entry_date DESC
LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION get_outstanding_actions(uuid) TO authenticated;
