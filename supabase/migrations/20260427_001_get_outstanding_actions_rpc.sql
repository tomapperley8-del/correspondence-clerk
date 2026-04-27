-- get_outstanding_actions: returns flagged/actioned correspondence for the Actions page.
--
-- Key filter: for items where due_at IS NULL, exclude them if any later correspondence
-- exists for the same business. This prevents old stale flags (invoice sent, waiting_on_them)
-- from accumulating indefinitely when the relationship has clearly moved on.
-- Items with a due_at are always returned regardless.

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
  contact jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    END AS contact
  FROM correspondence c
  JOIN businesses b ON b.id = c.business_id AND b.organization_id = p_org_id
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.organization_id = p_org_id
    AND c.action_needed != 'none'
    AND (
      -- Time-bound items always surface
      c.due_at IS NOT NULL
      -- No-due-date items only if no later correspondence exists for this business
      OR NOT EXISTS (
        SELECT 1 FROM correspondence c2
        WHERE c2.business_id = c.business_id
          AND c2.organization_id = p_org_id
          AND c2.entry_date > c.entry_date
      )
    )
  ORDER BY c.due_at ASC NULLS LAST, c.entry_date DESC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION get_outstanding_actions(uuid) TO authenticated;
