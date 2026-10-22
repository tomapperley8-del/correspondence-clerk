-- Rollback for 20261022_001_club_card_pages: v_business_attention and
-- get_attention_count go back to 20261021_004 exactly, then the Club Card
-- objects are dropped. The view gained a column, so it is dropped and
-- recreated (nothing else depends on it; get_attention_count is a SQL
-- function, recreated below).

BEGIN;

DROP VIEW IF EXISTS public.v_business_attention;

CREATE OR REPLACE VIEW public.v_business_attention WITH (security_invoker = true) AS
WITH today AS (
  SELECT public.cc_today() AS d
),
biz AS (
  SELECT b.* FROM public.businesses b
  WHERE b.merged_into IS NULL
    AND coalesce(b.status, '') <> 'Not a business'
),
money AS (
  SELECT l.business_id,
         sum(i.balance) AS amount,
         min(i.due_date) AS oldest_due,
         count(*) AS invoices,
         string_agg(coalesce(i.doc_number, i.qbo_invoice_id), ', ' ORDER BY i.due_date) AS docs
  FROM public.qbo_invoices i
  JOIN public.qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
  CROSS JOIN today
  WHERE i.balance > 0
    AND coalesce(i.private_memo, '') <> 'Voided'
    AND i.due_date < today.d
    AND NOT EXISTS (SELECT 1 FROM public.care_exclusions e
                    WHERE e.business_id = l.business_id AND e.kind IN ('all', 'overdue'))
    -- A chaser in the last 7 days rests it: Tom's own, a QuickBooks reminder or a routine's
    AND NOT EXISTS (SELECT 1 FROM public.correspondence c
                    WHERE c.business_id = l.business_id AND c.direction = 'sent'
                      AND c.entry_date > now() - interval '7 days'
                      AND (c.ai_metadata->>'source' = 'quickbooks_notice'
                           OR c.subject ~* '(invoice|payment|overdue|outstanding)'))
    AND NOT EXISTS (SELECT 1 FROM public.routine_drafts d
                    WHERE d.business_id = l.business_id AND d.kind = 'overdue'
                      AND d.sent_at > now() - interval '7 days')
  GROUP BY l.business_id
),
renewal AS (
  SELECT DISTINCT ON (s.business_id)
         s.business_id, s.id AS contract_id, s.membership_type, s.contract_end, s.contract_amount
  FROM public.contracts s
  JOIN biz b ON b.id = s.business_id
  CROSS JOIN today
  WHERE s.is_current
    AND s.membership_type IN ('club_card', 'advertiser')
    AND s.contract_end BETWEEN today.d - 60 AND today.d + 45
    AND coalesce(b.renewal_stage, 'not_started') NOT IN ('agreed', 'invoice_paid', 'not_renewing')
    AND b.renewal_declined_at IS NULL
    -- Renewed: a later contract of the same kind, or QuickBooks has invoiced the new term
    AND NOT EXISTS (SELECT 1 FROM public.contracts n
                    WHERE n.business_id = s.business_id AND n.id <> s.id AND n.is_current
                      AND n.membership_type IS NOT DISTINCT FROM s.membership_type
                      AND n.contract_end > s.contract_end)
    AND NOT EXISTS (SELECT 1 FROM public.v_unrecorded_renewals u WHERE u.expiring_contract_id = s.id)
  ORDER BY s.business_id, s.contract_end
),
waiting AS (
  SELECT r.business_id,
         count(*) AS emails,
         min(r.entry_date) AS oldest,
         (array_agg(r.id ORDER BY r.entry_date DESC))[1] AS latest_id,
         (array_agg(r.subject ORDER BY r.entry_date DESC))[1] AS latest_subject
  FROM biz b
  JOIN public.correspondence r ON r.business_id = b.id
  LEFT JOIN public.org_business_types t
         ON t.org_id = b.organization_id AND t.value = b.business_type
  WHERE r.direction = 'received'
    AND r.entry_date > now() - interval '30 days'
    AND r.reply_dismissed_at IS NULL
    AND coalesce(r.action_needed::text, 'none') <> 'waiting_on_them'
    -- Where a routine has tagged the email, the tag says whether it wants a reply:
    -- newsletters, press releases (editorial has its own list), FYIs, thank-yous
    -- and agreements don't. Untagged email is left to the scoring below.
    AND (r.intent IS NULL OR r.intent IN ('reply_needed', 'money', 'lead', 'meeting'))
    AND coalesce(b.status, '') <> 'Unreviewed'
    AND NOT coalesce(b.mute_replies, false)
    AND coalesce(t.is_commercial, true)
    AND NOT EXISTS (SELECT 1 FROM public.correspondence o
                    WHERE (o.business_id = r.business_id OR r.business_id = ANY (o.linked_business_ids))
                      AND o.direction = 'sent'
                      AND o.entry_date > r.entry_date)
    AND public.email_needs_reply(r.subject, r.formatted_text_current)
  GROUP BY r.business_id
),
todo_items AS (
  SELECT t.business_id, t.id, t.title, t.due_date, t.created_at
  FROM public.tasks t
  CROSS JOIN today
  WHERE t.status = 'open' AND t.source = 'manual'
    AND t.business_id IS NOT NULL
    AND t.due_date <= today.d
  UNION ALL
  -- Tom's one-click "Follow-up" flag on an email is a to-do he set himself.
  -- The automatic 'prospect' and 'invoice' flags on outreach emails are not.
  SELECT co.business_id, co.id,
         'Follow up: ' || coalesce(nullif(co.subject, ''), '(no subject)'),
         (co.due_at AT TIME ZONE 'Europe/London')::date, co.created_at
  FROM public.correspondence co
  CROSS JOIN today
  WHERE co.action_needed::text = 'follow_up'
    AND co.due_at IS NOT NULL
    AND (co.due_at AT TIME ZONE 'Europe/London')::date <= today.d
    AND NOT EXISTS (SELECT 1 FROM public.correspondence c2
                    WHERE c2.business_id = co.business_id AND c2.direction = 'sent'
                      AND c2.entry_date > co.entry_date)
),
todo AS (
  SELECT business_id,
         count(*) AS todos,
         min(due_date) AS earliest_due,
         (array_agg(id ORDER BY due_date, created_at))[1] AS first_id,
         (array_agg(title ORDER BY due_date, created_at))[1] AS first_title
  FROM todo_items
  GROUP BY business_id
)
SELECT b.id AS business_id,
       b.organization_id,
       b.name AS business_name,
       b.status,
       CASE WHEN m.business_id IS NOT NULL THEN 1
            WHEN rn.business_id IS NOT NULL THEN 2
            WHEN w.business_id IS NOT NULL THEN 3
            ELSE 4 END AS priority,
       CASE WHEN m.business_id IS NOT NULL THEN 'money_owed'
            WHEN rn.business_id IS NOT NULL THEN 'renewal'
            WHEN w.business_id IS NOT NULL THEN 'waiting_on_you'
            ELSE 'todo' END AS reason,
       CASE WHEN m.business_id IS NOT NULL THEN
              '£' || to_char(m.amount, 'FM999999990.00') || ' owed on ' || m.docs
              || ', due ' || to_char(m.oldest_due, 'DD/MM/YYYY')
            WHEN rn.business_id IS NOT NULL THEN
              CASE rn.membership_type WHEN 'club_card' THEN 'Club Card' ELSE 'Advertising' END
              || CASE WHEN rn.contract_end < td.d THEN ' ended ' ELSE ' ends ' END
              || to_char(rn.contract_end, 'DD/MM/YYYY')
            WHEN w.business_id IS NOT NULL THEN
              coalesce(nullif(w.latest_subject, ''), '(no subject)')
              || CASE WHEN w.emails > 1 THEN ' (' || w.emails || ' emails)' ELSE '' END
            ELSE
              tk.first_title || CASE WHEN tk.todos > 1 THEN ' (+' || (tk.todos - 1) || ' more)' ELSE '' END
       END AS detail,
       -- The date that drives the item: invoice due, contract end, oldest unanswered email, to-do date
       CASE WHEN m.business_id IS NOT NULL THEN m.oldest_due
            WHEN rn.business_id IS NOT NULL THEN rn.contract_end
            WHEN w.business_id IS NOT NULL THEN (w.oldest AT TIME ZONE 'Europe/London')::date
            ELSE tk.earliest_due END AS since,
       -- Overdue only where there is a real deadline (Definitions)
       CASE WHEN m.business_id IS NOT NULL THEN true
            WHEN rn.business_id IS NOT NULL THEN rn.contract_end < td.d
            WHEN w.business_id IS NOT NULL THEN false
            ELSE tk.earliest_due < td.d END AS is_overdue,
       CASE WHEN m.business_id IS NOT NULL THEN m.docs
            WHEN rn.business_id IS NOT NULL THEN rn.contract_id::text
            WHEN w.business_id IS NOT NULL THEN w.latest_id::text
            ELSE tk.first_id::text END AS ref_id,
       array_remove(ARRAY[
         CASE WHEN m.business_id IS NOT NULL THEN 'money_owed' END,
         CASE WHEN rn.business_id IS NOT NULL THEN 'renewal' END,
         CASE WHEN w.business_id IS NOT NULL THEN 'waiting_on_you' END,
         CASE WHEN tk.business_id IS NOT NULL THEN 'todo' END
       ], NULL) AS reasons,
       m.amount AS amount_owed,
       w.emails AS emails_waiting,
       tk.todos AS todos_due,
       b.attention_snoozed_until,
       coalesce(b.attention_snoozed_until >= td.d, false) AS is_snoozed
FROM biz b
CROSS JOIN today td
LEFT JOIN money m    ON m.business_id = b.id
LEFT JOIN renewal rn ON rn.business_id = b.id
LEFT JOIN waiting w  ON w.business_id = b.id
LEFT JOIN todo tk    ON tk.business_id = b.id
WHERE m.business_id IS NOT NULL OR rn.business_id IS NOT NULL
   OR w.business_id IS NOT NULL OR tk.business_id IS NOT NULL;

COMMENT ON VIEW public.v_business_attention IS
  'Needs attention: one top reason per business (money_owed, renewal, waiting_on_you, todo), worked out live. See docs/ui-overhaul-plan.md, Definitions.';

-- The one count: businesses needing attention (not snoozed) plus hand-written
-- to-dos due with no business. p_org_id defaults to the signed-in user's organisation.
CREATE OR REPLACE FUNCTION public.get_attention_count(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH org AS (
    SELECT coalesce(p_org_id, (SELECT organization_id FROM user_profiles WHERE id = auth.uid())) AS id
  ),
  a AS (
    SELECT v.* FROM v_business_attention v, org WHERE v.organization_id = org.id
  ),
  loose AS (
    SELECT count(*) AS n FROM tasks t, org
    WHERE t.organization_id = org.id AND t.status = 'open' AND t.source = 'manual'
      AND t.business_id IS NULL AND t.due_date <= cc_today()
  )
  SELECT jsonb_build_object(
    'today',          cc_today(),
    'total',          (SELECT count(*) FROM a WHERE NOT is_snoozed) + (SELECT n FROM loose),
    'businesses',     (SELECT count(*) FROM a WHERE NOT is_snoozed),
    'money_owed',     (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'money_owed'),
    'renewal',        (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'renewal'),
    'waiting_on_you', (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'waiting_on_you'),
    'todo',           (SELECT count(*) FROM a WHERE NOT is_snoozed AND reason = 'todo'),
    'unlinked_todos', (SELECT n FROM loose),
    'snoozed',        (SELECT count(*) FROM a WHERE is_snoozed)
  )
$$;

REVOKE ALL ON public.v_business_attention FROM PUBLIC, anon;
GRANT SELECT ON public.v_business_attention TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_attention_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attention_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.email_needs_reply(text, text) TO authenticated, service_role;

DROP VIEW IF EXISTS public.v_club_card_members;
DROP FUNCTION IF EXISTS public.cc_phone_digits(text);
DROP FUNCTION IF EXISTS public.cc_postcode(text);
DROP TABLE IF EXISTS public.club_card_sync_runs;
DROP TABLE IF EXISTS public.club_card_pages;

COMMIT;
