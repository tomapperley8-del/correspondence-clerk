-- Undo 20261029_005: the v_data_health definition from 20261029_004.
CREATE OR REPLACE VIEW public.v_data_health WITH (security_invoker = true) AS
WITH live AS (
  SELECT v.* FROM public.v_businesses v
  WHERE v.merged_into IS NULL AND COALESCE(v.status, '') <> 'Not a business'
)
-- 1. Club Card shown, but no card in force or in grace (the deal is still marked current)
SELECT b.organization_id, 'club_card_no_card'::text AS check_key, b.id AS business_id, b.name AS business_name,
  b.current_contract_id AS contract_id,
  (SELECT max(c.contract_end) FROM public.contracts c WHERE c.business_id = b.id AND c.membership_type = 'club_card') AS ref_date,
  m.card_state AS detail
FROM live b
LEFT JOIN public.v_club_card_members m ON m.business_id = b.id
WHERE b.is_club_card AND COALESCE(m.card_state, 'none') NOT IN ('member', 'grace')
UNION ALL
-- 2. A deal in force or in grace with no QuickBooks link
SELECT b.organization_id, 'deal_no_quickbooks', b.id, b.name, c.id, c.contract_end, c.membership_type
FROM public.contracts c
JOIN live b ON b.id = c.business_id
WHERE c.is_current
  AND (c.contract_end IS NULL OR c.contract_end >= public.cc_today() - 60)
  AND c.qbo_invoice_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.qbo_links l WHERE l.business_id = c.business_id)
UNION ALL
-- 3. An Active business with no named, active contact
SELECT b.organization_id, 'active_no_named_contact', b.id, b.name, b.current_contract_id, NULL::date, b.deal_state
FROM live b
WHERE b.status = 'Active' AND COALESCE(b.is_commercial, true)
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts ct
    WHERE ct.business_id = b.id AND COALESCE(ct.is_active, true) AND NOT COALESCE(ct.name_is_placeholder, false))
UNION ALL
-- 4. Stored status or last in touch differs from the worked-out one (v_businesses)
SELECT b.organization_id, 'stored_out_of_step', b.id, b.name, NULL::uuid, b.last_contacted_at_stored::date,
  concat_ws(', ',
    CASE WHEN b.status IS DISTINCT FROM b.status_stored THEN 'status' END,
    CASE WHEN b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored THEN 'last_in_touch' END)
FROM live b
WHERE b.status IS DISTINCT FROM b.status_stored OR b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored;
