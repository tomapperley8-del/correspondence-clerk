-- 20260925_001_care_exclusions.sql
--
-- "Let them go": Tom's way of telling the routines to stop writing to someone.
--
-- On 25 Sep Tom asked to stop chasing Chiswick Physio, Pub in the Park Festivals
-- and Tarantella. A snooze would not do: snoozes expire, money snoozes are
-- capped at a week, and the watchdog flags any chaser parked longer. So a
-- decision to stop gets its own table. A row here takes the business out of the
-- member care queue (for one kind of email, or 'all') and out of the watchdog,
-- and says who decided and why. Deleting the row puts them back.
--
-- The invoices themselves are untouched: they stay outstanding in QuickBooks and
-- in the money totals until they are paid or written off there.

CREATE TABLE IF NOT EXISTS public.care_exclusions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'all'
                CHECK (kind IN ('all', 'overdue', 'renewal', 'checkin')),
  reason      text,
  decided_by  text,
  UNIQUE (business_id, kind)
);

ALTER TABLE public.care_exclusions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.care_exclusions TO service_role;
GRANT SELECT ON public.care_exclusions TO authenticated;
DROP POLICY IF EXISTS care_exclusions_read ON public.care_exclusions;
CREATE POLICY care_exclusions_read ON public.care_exclusions FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.care_exclusions IS
  'Businesses Tom has told the routines to stop writing to, for one kind of email or all. Delete the row to resume.';

INSERT INTO care_exclusions (business_id, kind, reason, decided_by) VALUES
  ('a9577c47-a5f3-4de6-a2dd-422cf7ecbb3a', 'all', 'Tom, 25 Sep 2026: let it go (invoice 1793, £720)', 'Tom'),
  ('40b3a3ae-612c-4e97-800a-2678b3c17171', 'all', 'Tom, 25 Sep 2026: let it go (invoice 1602, £360, from April 2025)', 'Tom'),
  ('3c37480f-20c3-434a-ab76-fd9b0d6ed67d', 'all', 'Tom, 25 Sep 2026: let it go (invoice 1782, £250)', 'Tom')
ON CONFLICT (business_id, kind) DO NOTHING;

-- The queue: rewritten in full, identical to 20260924_001 apart from the
-- exclusion test in the final WHERE clause.
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

-- The watchdog stops flagging what Tom has deliberately let go.
CREATE OR REPLACE VIEW public.v_care_gaps AS
SELECT * FROM (
  SELECT 1 AS severity,
         'Owed money but not linked to a business' AS gap,
         coalesce(qc.display_name, i.qbo_customer_id) || ', £' || to_char(sum(i.balance), 'FM999999990.00') AS detail,
         NULL::uuid AS business_id
  FROM qbo_invoices i
  LEFT JOIN qbo_customers qc ON qc.qbo_customer_id = i.qbo_customer_id
  WHERE i.balance > 0 AND coalesce(i.private_memo, '') <> 'Voided'
    AND NOT EXISTS (SELECT 1 FROM qbo_links l WHERE l.qbo_customer_id = i.qbo_customer_id)
  GROUP BY 2, coalesce(qc.display_name, i.qbo_customer_id)
  HAVING sum(i.balance) >= 1

  UNION ALL
  SELECT 1, 'Owes money but replies are muted',
         b.name || ', £' || to_char(sum(i.balance), 'FM999999990.00'), b.id
  FROM qbo_invoices i
  JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
  JOIN businesses b ON b.id = l.business_id
  WHERE i.balance > 0 AND coalesce(i.private_memo, '') <> 'Voided'
    AND i.due_date <= current_date - 7 AND b.mute_replies
  GROUP BY b.name, b.id

  UNION ALL
  SELECT 2, 'Payment chaser parked for more than a week',
         b.name || ' until ' || to_char(d.snooze_until, 'DD Mon') || ' (' || coalesce(left(d.reason, 60), 'no reason') || ')',
         b.id
  FROM routine_drafts d
  JOIN businesses b ON b.id = d.business_id
  WHERE d.outcome = 'skipped' AND d.kind = 'overdue' AND d.snooze_until > current_date + 7

  UNION ALL
  SELECT 2, 'Draft waiting over a week',
         b.name || ', ' || coalesce(d.subject, d.kind) || ', written ' || to_char(d.created_at, 'DD Mon')
         || CASE WHEN d.bump_count > 0 THEN ', moved back up ' || d.bump_count || 'x' ELSE '' END,
         b.id
  FROM routine_drafts d
  JOIN businesses b ON b.id = d.business_id
  WHERE d.outcome = 'drafted' AND d.sent_at IS NULL
    AND d.created_at < now() - interval '7 days'

  UNION ALL
  SELECT 2, 'Member with no contract on file', b.name, b.id
  FROM businesses b
  WHERE (b.is_club_card OR b.is_advertiser)
    AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.business_id = b.id AND c.is_current)

  UNION ALL
  SELECT 3, 'Term ended, nothing recorded since',
         b.name || ', ended ' || to_char(s.contract_end, 'DD Mon YYYY'), b.id
  FROM v_contract_status s
  JOIN businesses b ON b.id = s.business_id
  WHERE s.is_current AND s.contract_end BETWEEN current_date - 120 AND current_date - 1
    AND coalesce(b.renewal_stage, '') NOT IN ('not_renewing', 'invoice_paid')
    AND NOT EXISTS (SELECT 1 FROM contracts n WHERE n.business_id = b.id AND n.is_current
                    AND n.contract_start > coalesce(s.contract_start, '1900-01-01'))
) g
WHERE g.business_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM care_exclusions e WHERE e.business_id = g.business_id AND e.kind = 'all');

REVOKE ALL ON public.v_care_gaps FROM anon, authenticated;
GRANT SELECT ON public.v_care_gaps TO service_role;
