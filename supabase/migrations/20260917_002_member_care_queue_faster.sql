-- 20260917_002_member_care_queue_faster.sql
--
-- Applied 2026-09-17. The first member care run timed out (60s MCP limit)
-- reading v_member_care_queue: last_sent_at / last_received_at were computed
-- for all ~850 businesses with an OR/ANY filter no index could serve.
-- They are now computed only for the queued rows (about 80), from the
-- business's own correspondence, via a new composite index. 2.9s -> 0.07s.
-- Linked-business rows are left to the routine's own history read.
--
-- The view body is otherwise identical to 20260917_001; see that file.

CREATE INDEX IF NOT EXISTS idx_correspondence_business_direction_date
  ON public.correspondence (business_id, direction, entry_date DESC);

CREATE OR REPLACE VIEW public.v_member_care_queue AS
WITH biz_ok AS (
  SELECT b.* FROM businesses b
  WHERE NOT coalesce(b.mute_replies, false)
    AND coalesce(b.status, '') NOT IN ('Former', 'Closed', 'Inactive')
),
blocked AS (   -- snoozed skips
  SELECT business_id, kind FROM routine_drafts
  WHERE outcome = 'skipped' AND snooze_until >= current_date
),
renewal AS (
  SELECT 'renewal'::text AS kind, 1 AS priority, s.business_id, s.contract_id::text AS ref,
         s.membership_type, s.contract_start, s.contract_end, s.contract_amount, s.deal_terms,
         NULL::text AS invoices, NULL::numeric AS amount_due, NULL::integer AS days_overdue
  FROM v_contract_status s
  JOIN biz_ok b ON b.id = s.business_id
  WHERE s.in_force
    AND s.membership_type IN ('club_card', 'advertiser')
    AND s.contract_end BETWEEN current_date AND current_date + 35
    AND coalesce(b.renewal_stage, 'not_started') NOT IN ('agreed', 'invoice_paid', 'not_renewing')
    AND b.renewal_declined_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM contracts n WHERE n.business_id = s.business_id
                    AND n.contract_start > coalesce(s.contract_start, '1900-01-01'))
    AND NOT EXISTS (SELECT 1 FROM routine_drafts d WHERE d.kind = 'renewal'
                    AND d.outcome = 'drafted' AND d.ref = s.contract_id::text)
),
overdue AS (
  SELECT 'overdue'::text, 0, l.business_id,
         string_agg(i.qbo_invoice_id, ',' ORDER BY i.due_date),
         NULL::text, NULL::date, NULL::date, NULL::numeric, NULL::text,
         string_agg(coalesce(i.doc_number, i.qbo_invoice_id) || ' (' || to_char(i.txn_date, 'DD Mon YYYY')
                    || ', £' || to_char(i.balance, 'FM999999990.00') || ' due '
                    || to_char(i.due_date, 'DD Mon YYYY') || ')', '; ' ORDER BY i.due_date),
         sum(i.balance),
         max(current_date - i.due_date)
  FROM qbo_invoices i
  JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
  JOIN biz_ok b ON b.id = l.business_id
  WHERE i.balance > 0
    AND coalesce(i.private_memo, '') <> 'Voided'
    AND i.due_date <= current_date - 7
  GROUP BY l.business_id
  HAVING NOT EXISTS (SELECT 1 FROM routine_drafts d WHERE d.kind = 'overdue'
                     AND d.outcome = 'drafted' AND d.business_id = l.business_id
                     AND d.created_at > now() - interval '21 days')
),
checkin AS (
  SELECT 'checkin'::text, 2, s.business_id, s.contract_id::text,
         s.membership_type, s.contract_start, s.contract_end, s.contract_amount, s.deal_terms,
         NULL::text, NULL::numeric, NULL::integer
  FROM v_contract_status s
  JOIN biz_ok b ON b.id = s.business_id
  WHERE s.in_force
    AND s.membership_type IN ('club_card', 'advertiser')
    AND s.days_to_renewal > 45
    -- three months into the term, then every three months
    AND greatest(coalesce(s.contract_start, b.created_at::date),
                 coalesce((SELECT max(d.created_at)::date FROM routine_drafts d
                           WHERE d.kind = 'checkin' AND d.outcome = 'drafted'
                             AND d.business_id = s.business_id), '1900-01-01'))
        <= current_date - 90
),
q AS (
  SELECT * FROM renewal UNION ALL SELECT * FROM overdue UNION ALL SELECT * FROM checkin
)
SELECT q.*, b.name AS business_name,
  (SELECT max(c.entry_date) FROM correspondence c
    WHERE c.business_id = q.business_id AND c.direction = 'sent'
      AND c.type IN ('Email','Email Thread','Call','Meeting')) AS last_sent_at,
  (SELECT max(c.entry_date) FROM correspondence c
    WHERE c.business_id = q.business_id AND c.direction = 'received'
      AND c.type IN ('Email','Email Thread','Call','Meeting')) AS last_received_at,
  (SELECT max(d.created_at) FROM routine_drafts d
    WHERE d.business_id = q.business_id AND d.outcome = 'drafted') AS last_draft_at
FROM q
JOIN businesses b ON b.id = q.business_id
WHERE NOT EXISTS (SELECT 1 FROM blocked x WHERE x.business_id = q.business_id AND x.kind = q.kind);
