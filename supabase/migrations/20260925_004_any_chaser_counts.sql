-- 20260925_004_any_chaser_counts.sql
--
-- A chaser is a chaser, whoever sent it.
--
-- On 25 Sep the routine drafted a payment chaser to Oddono's the morning after
-- QuickBooks had sent them its own automatic reminder, and eight days after
-- Tom's chaser. The queue only rested an invoice after a routine draft went
-- out. It now also rests for 7 days after any email Tom sent them about an
-- invoice or payment, and after a QuickBooks invoice or reminder (the webhook
-- files those as source 'quickbooks_notice' since this change). Renewals rest
-- for 7 days after any renewal or Club Card email Tom sent himself.

CREATE OR REPLACE VIEW public.v_member_care_queue AS
WITH biz_live AS (
  SELECT b.* FROM businesses b
  WHERE NOT coalesce(b.mute_replies, false)
    AND coalesce(b.status, '') NOT IN ('Closed', 'Inactive')
),
biz_money AS (
  SELECT b.* FROM businesses b WHERE NOT coalesce(b.mute_replies, false)
),
blocked AS (
  SELECT business_id, kind FROM routine_drafts
  WHERE outcome = 'skipped' AND snooze_until >= current_date
),
last_draft AS (
  SELECT DISTINCT ON (business_id, kind)
         business_id, kind, id AS draft_id, outlook_draft_id, created_at, sent_at, bump_count,
         coalesce(bumped_at, created_at) AS last_touched
  FROM routine_drafts
  WHERE outcome = 'drafted'
  ORDER BY business_id, kind, created_at DESC
),
renewal AS (
  SELECT 'renewal'::text AS kind, 1 AS priority, s.business_id, s.contract_id::text AS ref,
         s.membership_type, s.contract_start, s.contract_end, s.contract_amount, s.deal_terms,
         NULL::text AS invoices, NULL::numeric AS amount_due, NULL::integer AS days_overdue
  FROM v_contract_status s
  JOIN biz_live b ON b.id = s.business_id
  LEFT JOIN last_draft d ON d.business_id = s.business_id AND d.kind = 'renewal'
  WHERE s.is_current
    AND s.membership_type IN ('club_card', 'advertiser')
    AND s.contract_end BETWEEN current_date - 60 AND current_date + 35
    AND coalesce(b.renewal_stage, 'not_started') NOT IN ('agreed', 'invoice_paid', 'not_renewing')
    AND b.renewal_declined_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM contracts n
                    WHERE n.business_id = s.business_id AND n.is_current
                      AND n.membership_type IS NOT DISTINCT FROM s.membership_type
                      AND n.contract_start > coalesce(s.contract_start, '1900-01-01'))
    AND (d.sent_at IS NULL OR d.sent_at < now() - interval '7 days')
    AND (d.draft_id IS NULL OR d.sent_at IS NOT NULL OR d.last_touched < now() - interval '20 hours')
    -- Tom asked about the renewal himself in the last week, drafted or not.
    AND NOT EXISTS (SELECT 1 FROM correspondence c
                    WHERE c.business_id = s.business_id AND c.direction = 'sent'
                      AND c.entry_date > now() - interval '7 days'
                      AND c.subject ~* '(renew|club card|advertis|sidebar|listing)')
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
  JOIN biz_money b ON b.id = l.business_id
  LEFT JOIN last_draft d ON d.business_id = l.business_id AND d.kind = 'overdue'
  WHERE i.balance > 0
    AND coalesce(i.private_memo, '') <> 'Voided'
    AND i.due_date <= current_date - 7
    AND (d.sent_at IS NULL OR d.sent_at < now() - interval '7 days')
    AND (d.draft_id IS NULL OR d.sent_at IS NOT NULL OR d.last_touched < now() - interval '20 hours')
    -- Any chaser in the last week counts: Tom's own, or a QuickBooks reminder.
    AND NOT EXISTS (SELECT 1 FROM correspondence c
                    WHERE c.business_id = l.business_id AND c.direction = 'sent'
                      AND c.entry_date > now() - interval '7 days'
                      AND (c.ai_metadata->>'source' = 'quickbooks_notice'
                           OR c.subject ~* '(invoice|payment|overdue|outstanding)'))
  GROUP BY l.business_id
),
checkin AS (
  SELECT 'checkin'::text, 2, s.business_id, s.contract_id::text,
         s.membership_type, s.contract_start, s.contract_end, s.contract_amount, s.deal_terms,
         NULL::text, NULL::numeric, NULL::integer
  FROM v_contract_status s
  JOIN biz_live b ON b.id = s.business_id
  LEFT JOIN last_draft d ON d.business_id = s.business_id AND d.kind = 'checkin'
  WHERE s.in_force
    AND coalesce(b.status, '') <> 'Former'
    AND s.membership_type IN ('club_card', 'advertiser')
    AND s.days_to_renewal > 45
    AND (d.draft_id IS NULL OR d.sent_at IS NOT NULL)
    AND greatest(coalesce(s.contract_start, b.created_at::date),
                 coalesce((SELECT max(dd.created_at)::date FROM routine_drafts dd
                           WHERE dd.kind = 'checkin' AND dd.outcome = 'drafted'
                             AND dd.business_id = s.business_id), '1900-01-01'))
        <= current_date - 90
),
q AS (SELECT * FROM renewal UNION ALL SELECT * FROM overdue UNION ALL SELECT * FROM checkin)
SELECT q.*, b.name AS business_name,
  ld.outlook_draft_id AS open_draft_id,
  ld.created_at       AS open_draft_written_at,
  ld.bump_count       AS open_draft_bumps,
  ld.draft_id         AS open_draft_row_id,
  (SELECT max(c.entry_date) FROM correspondence c
    WHERE c.business_id = q.business_id AND c.direction = 'sent'
      AND c.type IN ('Email','Email Thread','Call','Meeting')) AS last_sent_at,
  (SELECT max(c.entry_date) FROM correspondence c
    WHERE c.business_id = q.business_id AND c.direction = 'received'
      AND c.type IN ('Email','Email Thread','Call','Meeting')) AS last_received_at,
  (SELECT max(d2.created_at) FROM routine_drafts d2
    WHERE d2.business_id = q.business_id AND d2.outcome = 'drafted') AS last_draft_at
FROM q
JOIN businesses b ON b.id = q.business_id
LEFT JOIN last_draft ld ON ld.business_id = q.business_id AND ld.kind = q.kind AND ld.sent_at IS NULL
WHERE NOT EXISTS (SELECT 1 FROM blocked x WHERE x.business_id = q.business_id AND x.kind = q.kind)
  AND NOT EXISTS (SELECT 1 FROM care_exclusions e
                  WHERE e.business_id = q.business_id AND e.kind IN ('all', q.kind));

REVOKE ALL ON public.v_member_care_queue FROM anon, authenticated;
GRANT SELECT ON public.v_member_care_queue TO service_role;
