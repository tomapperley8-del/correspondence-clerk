-- 20260917_001_member_care.sql
--
-- Applied 2026-09-17. Personal, history-aware drafts for existing members and
-- advertisers, written by the "CC member care drafts" routine:
--   renewal  one month before a Club Card or advertising term ends
--   overdue  QuickBooks invoices 7+ days past due (one draft per business)
--   checkin  every 3 months while someone is a member or advertiser
--
-- The database decides WHO is due (v_member_care_queue). The routine decides
-- WHETHER and WHAT to write, after reading the history and both mailboxes.
-- Every decision, drafted or skipped, is recorded in routine_drafts, which
-- stops repeats and feeds the "Drafts waiting for you" section of the desk email.

CREATE TABLE IF NOT EXISTS public.routine_drafts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  routine          text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('outreach','renewal','overdue','checkin')),
  business_id      uuid REFERENCES businesses(id) ON DELETE CASCADE,
  ref              text,            -- contract id, or comma-separated invoice ids
  outcome          text NOT NULL CHECK (outcome IN ('drafted','skipped')),
  recipient        text,
  subject          text,
  outlook_draft_id text,
  reason           text,            -- why skipped, or one line on what the draft says
  snooze_until     date             -- for skips: do not reconsider before this date
);
CREATE INDEX IF NOT EXISTS idx_routine_drafts_biz_kind ON public.routine_drafts (business_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_drafts_created ON public.routine_drafts (created_at DESC);

ALTER TABLE public.routine_drafts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.routine_drafts TO service_role;

COMMENT ON TABLE public.routine_drafts IS
  'Every draft a routine wrote into Tom''s Outlook, and every candidate it considered and skipped. Stops repeats; the desk email lists recent drafts.';

CREATE OR REPLACE VIEW public.v_member_care_queue AS
WITH biz_ok AS (
  SELECT b.* FROM businesses b
  WHERE NOT coalesce(b.mute_replies, false)
    AND coalesce(b.status, '') NOT IN ('Former', 'Closed', 'Inactive')
),
last_touch AS (
  SELECT b.id AS business_id,
    (SELECT max(c.entry_date) FROM correspondence c
      WHERE (c.business_id = b.id OR b.id = ANY (c.linked_business_ids))
        AND c.direction = 'sent' AND c.type IN ('Email','Email Thread','Call','Meeting')) AS last_sent_at,
    (SELECT max(c.entry_date) FROM correspondence c
      WHERE (c.business_id = b.id OR b.id = ANY (c.linked_business_ids))
        AND c.direction = 'received' AND c.type IN ('Email','Email Thread','Call','Meeting')) AS last_received_at
  FROM biz_ok b
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
)
SELECT q.*, b.name AS business_name, t.last_sent_at, t.last_received_at,
       (SELECT max(d.created_at) FROM routine_drafts d
         WHERE d.business_id = q.business_id AND d.outcome = 'drafted') AS last_draft_at
FROM (SELECT * FROM renewal UNION ALL SELECT * FROM overdue UNION ALL SELECT * FROM checkin) q
JOIN businesses b ON b.id = q.business_id
LEFT JOIN last_touch t ON t.business_id = q.business_id
WHERE NOT EXISTS (SELECT 1 FROM blocked x WHERE x.business_id = q.business_id AND x.kind = q.kind);

COMMENT ON VIEW public.v_member_care_queue IS
  'Who is due a renewal, overdue-payment or check-in draft today. Read by the member care routine; it judges each one against the history before drafting.';

REVOKE ALL ON public.v_member_care_queue FROM anon, authenticated;
GRANT SELECT ON public.v_member_care_queue TO service_role;

INSERT INTO routine_schedule (routine, label, iso_days) VALUES
  ('member_care', 'CC member care drafts', ARRAY[1,2,3,4,5])
ON CONFLICT (routine) DO UPDATE SET label = EXCLUDED.label, iso_days = EXCLUDED.iso_days, enabled = true;
