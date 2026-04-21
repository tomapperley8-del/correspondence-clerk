-- get_contract_expiries
--
-- Returns businesses in an org whose contract_end falls in [-90 days, +90 days]
-- along with the most recent correspondence entry_date + snippet for each.
--
-- Replaces the previous two-step pattern (fetch businesses, then fetch up to
-- businessIds.length*5 correspondence rows, then dedupe in JS). A single round
-- trip with DISTINCT ON gives exactly one latest correspondence per business.
--
-- The caller (app/actions/correspondence.ts) still:
--   - filters out contract_renewal_type='one_off' in JS (NULL-safe)
--   - runs keyword detection on the returned latest_text
--   - persists auto-detected one_off rows back to businesses

CREATE OR REPLACE FUNCTION public.get_contract_expiries(p_org_id UUID)
RETURNS TABLE (
  id                      UUID,
  name                    TEXT,
  contract_end            DATE,
  contract_amount         NUMERIC,
  contract_currency       TEXT,
  contract_renewal_type   TEXT,
  last_correspondence_date TIMESTAMPTZ,
  last_correspondence_text TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH eligible AS (
    SELECT b.id,
           b.name,
           b.contract_end,
           b.contract_amount,
           b.contract_currency,
           b.contract_renewal_type
    FROM public.businesses b
    WHERE b.organization_id = p_org_id
      AND b.contract_end IS NOT NULL
      AND b.contract_end >= (CURRENT_DATE - INTERVAL '90 days')
      AND b.contract_end <= (CURRENT_DATE + INTERVAL '90 days')
  ),
  latest AS (
    SELECT DISTINCT ON (c.business_id)
           c.business_id,
           c.entry_date,
           c.formatted_text_current
    FROM public.correspondence c
    JOIN eligible e ON e.id = c.business_id
    WHERE c.organization_id = p_org_id
    ORDER BY c.business_id, c.entry_date DESC
  )
  SELECT e.id,
         e.name,
         e.contract_end,
         e.contract_amount,
         e.contract_currency,
         e.contract_renewal_type,
         l.entry_date AS last_correspondence_date,
         l.formatted_text_current AS last_correspondence_text
  FROM eligible e
  LEFT JOIN latest l ON l.business_id = e.id
  ORDER BY e.contract_end ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_contract_expiries(UUID) TO authenticated;
