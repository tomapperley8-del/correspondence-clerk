-- UI overhaul, Stage 1: done sticks, snoozes stick, honest dates.
-- See docs/ui-overhaul-plan.md (F1, F2) for the evidence.
--
-- Before this, ticking an automatic task closed the task but left its source
-- untouched, so the task engine opened the same item again a few days later
-- (24 of 31 "You said you'd" items came back, one of them 7 times). A snooze
-- moved due_date, which the engine reset the next night. Reply tasks had their
-- due date reset to today every night, so a reply from August said "due today".
--
-- This migration:
--   1. tasks_write_back_to_source(): when Tom ticks an automatic task, the
--      ticked state is written to the email it came from, so the signal clears
--      for good. Un-ticking puts it back. A snooze is remembered in
--      signal_meta.snooze_until, which the engine already honours.
--   2. refresh_system_tasks() marks its own updates so they are not mistaken
--      for a snooze.
--   3. v_inbound_tails exposes reply_dismissed_at and counts a sent email on a
--      linked business as an answer. v_task_signals skips dismissed emails and
--      dates a reply task by the day the email arrived.
--   4. Items that have a source of their own never reopen once ticked. Money
--      (invoice_overdue) still comes back after 7 days, by design.
--
-- Rollback: supabase/migrations/rollback/20261021_001_done_sticks_rollback.sql

-- 0. Back up everything this changes ----------------------------------------

-- Exact definitions as they stand, so the rollback restores them verbatim.
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
VALUES
  ('_definition', md5('v_task_signals')::uuid,
   jsonb_build_object('kind', 'view', 'name', 'v_task_signals',
                      'def', pg_get_viewdef('public.v_task_signals'::regclass)),
   'stage1_done_sticks_2026_10_21'),
  ('_definition', md5('v_inbound_tails')::uuid,
   jsonb_build_object('kind', 'view', 'name', 'v_inbound_tails',
                      'def', pg_get_viewdef('public.v_inbound_tails'::regclass)),
   'stage1_done_sticks_2026_10_21'),
  ('_definition', md5('refresh_system_tasks')::uuid,
   jsonb_build_object('kind', 'function', 'name', 'refresh_system_tasks',
                      'def', pg_get_functiondef('public.refresh_system_tasks(boolean)'::regprocedure)),
   'stage1_done_sticks_2026_10_21');

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'task_rules', md5(r.id)::uuid, to_jsonb(r), 'stage1_done_sticks_2026_10_21'
FROM task_rules r
WHERE r.id IN ('reply_needed','commitment_due','editorial_inbox','correspondence_flagged',
               'renewal_due','renewal_lapsed','unrecorded_renewal','club_card_checkin');

-- 1. Write ticks back to their source ---------------------------------------

CREATE OR REPLACE FUNCTION public.tasks_write_back_to_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kind text := split_part(NEW.signal_key, ':', 1);
  v_cid  uuid;
  v_prev jsonb;
BEGIN
  -- A snooze by Tom (not the engine's own nightly refresh) is remembered, so
  -- the next refresh keeps the later date.
  IF coalesce(current_setting('cc.task_engine', true), '') <> 'on'
     AND NEW.status = 'open' AND OLD.status = 'open'
     AND NEW.due_date IS DISTINCT FROM OLD.due_date
     AND NEW.due_date > CURRENT_DATE THEN
    NEW.signal_meta := coalesce(NEW.signal_meta, '{}'::jsonb)
                       || jsonb_build_object('snooze_until', NEW.due_date);
  END IF;

  IF v_kind NOT IN ('reply', 'editorial', 'commitment', 'corr_flagged') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_cid := split_part(NEW.signal_key, ':', 2)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NEW;
  END;

  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    IF v_kind IN ('reply', 'editorial') THEN
      UPDATE correspondence SET reply_dismissed_at = now()
      WHERE id = v_cid AND reply_dismissed_at IS NULL;
    ELSIF v_kind = 'commitment' THEN
      UPDATE correspondence
      SET intent_meta = coalesce(intent_meta, '{}'::jsonb)
                        || jsonb_build_object('done', true, 'done_at', now(), 'done_via', 'task')
      WHERE id = v_cid;
    ELSIF v_kind = 'corr_flagged' THEN
      SELECT jsonb_build_object('action_needed', action_needed, 'due_at', due_at)
      INTO v_prev FROM correspondence WHERE id = v_cid;
      UPDATE correspondence SET action_needed = 'none', due_at = NULL
      WHERE id = v_cid AND action_needed <> 'none';
    END IF;
    NEW.signal_meta := coalesce(NEW.signal_meta, '{}'::jsonb)
                       || jsonb_build_object('written_back_at', now())
                       || CASE WHEN v_prev IS NULL THEN '{}'::jsonb
                               ELSE jsonb_build_object('previous_flag', v_prev) END;

  ELSIF NEW.status = 'open' AND OLD.status = 'done'
        AND coalesce(NEW.signal_meta, '{}'::jsonb) ? 'written_back_at' THEN
    -- Tom un-ticked it: put the source back the way it was.
    IF v_kind IN ('reply', 'editorial') THEN
      UPDATE correspondence SET reply_dismissed_at = NULL WHERE id = v_cid;
    ELSIF v_kind = 'commitment' THEN
      UPDATE correspondence
      SET intent_meta = intent_meta - 'done' - 'done_at' - 'done_via'
      WHERE id = v_cid;
    ELSIF v_kind = 'corr_flagged' AND NEW.signal_meta ? 'previous_flag' THEN
      UPDATE correspondence
      SET action_needed = (NEW.signal_meta->'previous_flag'->>'action_needed')::action_needed_type,
          due_at        = (NEW.signal_meta->'previous_flag'->>'due_at')::timestamptz
      WHERE id = v_cid;
    END IF;
    NEW.signal_meta := NEW.signal_meta - 'written_back_at' - 'previous_flag';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS tasks_write_back_to_source ON public.tasks;
CREATE TRIGGER tasks_write_back_to_source
  BEFORE UPDATE OF status, due_date ON public.tasks
  FOR EACH ROW
  WHEN (NEW.signal_key IS NOT NULL)
  EXECUTE FUNCTION public.tasks_write_back_to_source();

-- 2. The engine marks its own updates ----------------------------------------
-- Same as the live definition (21 Oct 2026) apart from the two set_config lines.

CREATE OR REPLACE FUNCTION public.refresh_system_tasks(p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t0 timestamptz := clock_timestamp(); v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_cat_id uuid; v_opened int := 0; v_closed int := 0; v_updated int := 0; v_by_rule jsonb := '{}'::jsonb; rec record;
BEGIN
  PERFORM set_config('cc.task_engine', 'on', true);
  SELECT id INTO v_cat_id FROM task_categories WHERE name='CC/Advertising' LIMIT 1;
  CREATE TEMP TABLE _desired ON COMMIT DROP AS SELECT * FROM v_task_signals;

  WITH gone AS (
    SELECT t.id FROM tasks t
    WHERE t.signal_key IS NOT NULL AND t.status<>'done'
      AND NOT EXISTS (SELECT 1 FROM _desired d WHERE d.signal_key=t.signal_key)
      AND EXISTS (SELECT 1 FROM task_rules r WHERE r.enabled AND t.signal_meta->>'rule_id'=r.id)
  ), upd AS (
    UPDATE tasks t SET status='done', completed_at=now(), updated_at=now(),
      notes=coalesce(t.notes,'')||E'\n\n[closed automatically: the condition cleared on '||to_char(CURRENT_DATE,'DD Mon YYYY')||']',
      signal_meta=coalesce(t.signal_meta,'{}'::jsonb)||jsonb_build_object('auto_closed_at',now())
    FROM gone WHERE t.id=gone.id AND NOT p_dry_run RETURNING 1
  ) SELECT (SELECT count(*) FROM gone) INTO v_closed;

  IF NOT p_dry_run THEN
    UPDATE tasks t
    SET title=d.title, notes=d.notes,
        due_date=greatest(d.due_date, nullif(t.signal_meta->>'snooze_until','')::date),
        is_priority=d.is_priority, signal_meta=t.signal_meta||d.meta, updated_at=now()
    FROM _desired d
    WHERE t.signal_key=d.signal_key AND t.status<>'done'
      AND (t.title IS DISTINCT FROM d.title OR t.notes IS DISTINCT FROM d.notes
        OR t.due_date IS DISTINCT FROM greatest(d.due_date, nullif(t.signal_meta->>'snooze_until','')::date)
        OR t.is_priority IS DISTINCT FROM d.is_priority);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  FOR rec IN
    SELECT r.id AS rule_id, coalesce((r.params->>'max_new_per_run')::int,1000) AS cap,
           coalesce((r.params->>'reopen_after_days')::int,0) AS reopen_after,
           coalesce(r.params->'suppress_if_open_like','[]'::jsonb) AS suppress
    FROM task_rules r WHERE r.enabled
  LOOP
    WITH candidates AS (
      SELECT d.* FROM _desired d
      WHERE d.rule_id=rec.rule_id
        AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.signal_key=d.signal_key AND t.status<>'done')
        AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.signal_key=d.signal_key AND t.status='done' AND t.completed_at > now()-(rec.reopen_after||' days')::interval)
        AND NOT EXISTS (SELECT 1 FROM tasks t2 JOIN jsonb_array_elements_text(rec.suppress) AS pat ON t2.title LIKE pat
                        WHERE t2.business_id=d.business_id AND t2.status<>'done' AND t2.signal_key IS NULL)
      ORDER BY d.is_priority DESC, d.due_date ASC LIMIT rec.cap
    ), ins AS (
      INSERT INTO tasks (organization_id,title,notes,due_date,status,is_priority,category,source,business_id,type,task_category_id,signal_key,signal_meta)
      SELECT v_org,c.title,c.notes,c.due_date,'open',c.is_priority,'work','signal',c.business_id,'task',v_cat_id,c.signal_key,
             c.meta||jsonb_build_object('rule_id',c.rule_id,'opened_on',CURRENT_DATE)
      FROM candidates c WHERE NOT p_dry_run RETURNING 1
    ) SELECT count(*) INTO v_opened FROM candidates;
    v_by_rule := v_by_rule||jsonb_build_object(rec.rule_id,v_opened);
    IF NOT p_dry_run THEN UPDATE task_rules SET last_run_at=now(), last_opened=v_opened WHERE id=rec.rule_id; END IF;
  END LOOP;

  SELECT coalesce(sum(value::int),0) INTO v_opened FROM jsonb_each_text(v_by_rule);
  INSERT INTO system_task_runs (dry_run,opened,closed,by_rule,duration_ms)
  VALUES (p_dry_run,v_opened,v_closed,v_by_rule||jsonb_build_object('_updated',v_updated),(extract(epoch FROM clock_timestamp()-t0)*1000)::int);
  PERFORM set_config('cc.task_engine', 'off', true);
  RETURN jsonb_build_object('dry_run',p_dry_run,'opened',v_opened,'closed',v_closed,'refreshed',v_updated,'by_rule',v_by_rule,'signals_live',(SELECT count(*) FROM _desired));
END; $function$;

-- 3. Views: dismissed emails stay dismissed, replies keep their real date -----

-- New column added at the end, as CREATE OR REPLACE VIEW requires.
CREATE OR REPLACE VIEW public.v_inbound_tails AS
 SELECT c.id,
    c.business_id,
    b.name AS business_name,
    c.thread_key,
    c.subject,
    c.entry_date,
    c.intent,
    c.intent_meta,
    (EXISTS ( SELECT 1
           FROM correspondence o
          WHERE ((o.business_id = c.business_id) OR (c.business_id = ANY (o.linked_business_ids)))
            AND (o.direction = 'sent'::text)
            AND (o.entry_date > c.entry_date)
            AND ((o.thread_key = c.thread_key) OR (o.entry_date < (c.entry_date + '4 days'::interval))))) AS answered,
    c.reply_dismissed_at
   FROM (( SELECT DISTINCT ON (correspondence.business_id, correspondence.thread_key) correspondence.id,
            correspondence.business_id,
            correspondence.subject,
            correspondence.entry_date,
            correspondence.intent,
            correspondence.intent_meta,
            correspondence.thread_key,
            correspondence.reply_dismissed_at
           FROM correspondence
          WHERE (correspondence.direction = 'received'::text)
          ORDER BY correspondence.business_id, correspondence.thread_key, correspondence.entry_date DESC) c
     JOIN businesses b ON ((b.id = c.business_id)))
  WHERE (NOT COALESCE(b.mute_replies, false));

-- Same as the live definition (21 Oct 2026) apart from the reply_needed and
-- editorial_inbox branches, which are marked.
CREATE OR REPLACE VIEW public.v_task_signals AS
 WITH r AS (
         SELECT task_rules.id, task_rules.params, task_rules.task_category
           FROM task_rules
          WHERE task_rules.enabled
        )
 SELECT 'invoice_overdue'::text AS rule_id,
    ('invoice_overdue:'::text || i.qbo_invoice_id) AS signal_key,
    b.id AS business_id,
    ((('Chase £'::text || to_char(i.balance, 'FM999999990.00'::text)) || ' from '::text) || b.name) AS title,
    ((((((('Invoice '::text || i.doc_number) || ' was due '::text) || to_char((i.due_date)::timestamp with time zone, 'DD Mon YYYY'::text)) || ' ('::text) || (CURRENT_DATE - i.due_date)) || ' days ago). '::text) || COALESCE("left"(i.line_description, 160), ''::text)) AS notes,
    CURRENT_DATE AS due_date,
    ((CURRENT_DATE - i.due_date) > ((r.params ->> 'priority_after_days'::text))::integer) AS is_priority,
    r.task_category,
    jsonb_build_object('invoice', i.doc_number, 'balance', i.balance, 'due', i.due_date, 'days_overdue', (CURRENT_DATE - i.due_date)) AS meta
   FROM (((r
     JOIN qbo_invoices i ON ((r.id = 'invoice_overdue'::text)))
     JOIN qbo_links l ON ((l.qbo_customer_id = i.qbo_customer_id)))
     JOIN businesses b ON ((b.id = l.business_id)))
  WHERE ((i.balance > (0)::numeric) AND (COALESCE(i.private_memo, ''::text) <> 'Voided'::text) AND (i.due_date < (CURRENT_DATE - ((r.params ->> 'grace_days'::text))::integer)))
UNION ALL
 SELECT 'invoice_due_soon'::text AS rule_id,
    ('invoice_due_soon:'::text || i.qbo_invoice_id) AS signal_key,
    b.id AS business_id,
    ((('Payment due from '::text || b.name) || ' on '::text) || to_char((i.due_date)::timestamp with time zone, 'DD Mon'::text)) AS title,
    ((((('Invoice '::text || i.doc_number) || ' for £'::text) || to_char(i.balance, 'FM999999990.00'::text)) || '. '::text) || COALESCE("left"(i.line_description, 160), ''::text)) AS notes,
    (i.due_date - 3) AS due_date,
    false AS is_priority,
    r.task_category,
    jsonb_build_object('invoice', i.doc_number, 'balance', i.balance, 'due', i.due_date) AS meta
   FROM (((r
     JOIN qbo_invoices i ON ((r.id = 'invoice_due_soon'::text)))
     JOIN qbo_links l ON ((l.qbo_customer_id = i.qbo_customer_id)))
     JOIN businesses b ON ((b.id = l.business_id)))
  WHERE ((i.balance > (0)::numeric) AND (COALESCE(i.private_memo, ''::text) <> 'Voided'::text) AND (i.due_date >= CURRENT_DATE) AND (i.due_date <= (CURRENT_DATE + ((r.params ->> 'days_ahead'::text))::integer)))
UNION ALL
 SELECT 'renewal_due'::text AS rule_id,
    ('renewal_due:'::text || (c.contract_id)::text) AS signal_key,
    c.business_id,
    (((('Renew '::text || c.business_name) || ' ('::text) || COALESCE(c.membership_type, 'membership'::text)) || ')'::text) AS title,
    (((((('Ends '::text || to_char((c.contract_end)::timestamp with time zone, 'DD Mon YYYY'::text)) || ', '::text) || c.days_to_renewal) || ' days away'::text) || COALESCE((' at £'::text || to_char(c.contract_amount, 'FM999999990.00'::text)), ''::text)) || COALESCE(('. '::text || "left"(c.deal_terms, 160)), ''::text)) AS notes,
    GREATEST(CURRENT_DATE, (c.contract_end - ((r.params ->> 'lead_days'::text))::integer)) AS due_date,
    false AS is_priority,
    r.task_category,
    jsonb_build_object('contract', c.contract_id, 'ends', c.contract_end, 'amount', c.contract_amount) AS meta
   FROM (r
     JOIN v_contract_status c ON ((r.id = 'renewal_due'::text)))
  WHERE (c.in_force AND ((c.days_to_renewal >= 0) AND (c.days_to_renewal <= ((r.params ->> 'days_before'::text))::integer)))
UNION ALL
 SELECT 'renewal_lapsed'::text AS rule_id,
    ('renewal_lapsed:'::text || (c.contract_id)::text) AS signal_key,
    c.business_id,
    ((('Lapsed: '::text || c.business_name) || ' ended '::text) || to_char((c.contract_end)::timestamp with time zone, 'DD Mon'::text)) AS title,
    (((COALESCE(c.membership_type, 'Membership'::text) || ' ended '::text) || to_char((c.contract_end)::timestamp with time zone, 'DD Mon YYYY'::text)) || ' with nothing recorded since. Renew, or mark the relationship closed.'::text) AS notes,
    CURRENT_DATE AS due_date,
    ((CURRENT_DATE - c.contract_end) > 30) AS is_priority,
    r.task_category,
    jsonb_build_object('contract', c.contract_id, 'ended', c.contract_end) AS meta
   FROM (r
     JOIN v_contract_status c ON ((r.id = 'renewal_lapsed'::text)))
  WHERE (c.lapsed AND (c.contract_end >= (CURRENT_DATE - ((r.params ->> 'within_days'::text))::integer)) AND (NOT (EXISTS ( SELECT 1
           FROM v_unrecorded_renewals u
          WHERE (u.expiring_contract_id = c.contract_id)))))
UNION ALL
 SELECT 'unrecorded_renewal'::text AS rule_id,
    ('unrecorded_renewal:'::text || u.qbo_invoice_id) AS signal_key,
    u.business_id,
    ('Record the renewal for '::text || u.business_name) AS title,
    ((((((((('Invoice '::text || u.doc_number) || ' raised '::text) || to_char((u.invoiced_on)::timestamp with time zone, 'DD Mon YYYY'::text)) || ' for £'::text) || to_char(u.total_amount, 'FM999999990.00'::text)) || ', but the contract here still ends '::text) || to_char((u.cc_thinks_ends)::timestamp with time zone, 'DD Mon YYYY'::text)) || '. Invoice says: '::text) || "left"(u.line_description, 160)) AS notes,
    CURRENT_DATE AS due_date,
    true AS is_priority,
    r.task_category,
    jsonb_build_object('invoice', u.doc_number, 'amount', u.total_amount, 'balance', u.balance) AS meta
   FROM (r
     JOIN v_unrecorded_renewals u ON ((r.id = 'unrecorded_renewal'::text)))
UNION ALL
 SELECT 'correspondence_flagged'::text AS rule_id,
    ('corr_flagged:'::text || (co.id)::text) AS signal_key,
    co.business_id,
    ((initcap(replace((co.action_needed)::text, '_'::text, ' '::text)) || ': '::text) || b.name) AS title,
    (((((COALESCE(co.subject, '(no subject)'::text) || ' — logged '::text) || to_char(co.entry_date, 'DD Mon YYYY'::text)) || ', flagged as '::text) || replace((co.action_needed)::text, '_'::text, ' '::text)) || '.'::text) AS notes,
    COALESCE((co.due_at)::date, CURRENT_DATE) AS due_date,
    false AS is_priority,
    r.task_category,
    jsonb_build_object('correspondence', co.id, 'flag', (co.action_needed)::text, 'due_at', co.due_at) AS meta
   FROM ((r
     JOIN correspondence co ON ((r.id = 'correspondence_flagged'::text)))
     JOIN businesses b ON ((b.id = co.business_id)))
  WHERE (((co.action_needed)::text <> 'none'::text) AND (co.due_at IS NOT NULL) AND (NOT COALESCE(b.mute_replies, false)) AND (co.due_at <= (now() + (((r.params ->> 'days_ahead'::text) || ' days'::text))::interval)) AND (NOT (EXISTS ( SELECT 1
           FROM correspondence c2
          WHERE ((c2.business_id = co.business_id) AND (c2.direction = 'sent'::text) AND (c2.entry_date > co.entry_date))))))
UNION ALL
 -- CHANGED: due date is the day the email arrived (was CURRENT_DATE, reset
 -- nightly); a dismissed email no longer raises a task.
 SELECT 'reply_needed'::text AS rule_id,
    ('reply:'::text || (t.id)::text) AS signal_key,
    t.business_id,
    ((
        CASE t.intent
            WHEN 'money'::text THEN 'Money: '::text
            WHEN 'lead'::text THEN 'Lead: '::text
            ELSE 'Reply to '::text
        END || t.business_name) || COALESCE((' — '::text || "left"(t.subject, 60)), ''::text)) AS title,
    ((((('They wrote on '::text || to_char(t.entry_date, 'DD Mon'::text)) || ' ('::text) || (CURRENT_DATE - (t.entry_date)::date)) || ' days ago) and nothing has gone back. '::text) || COALESCE((t.intent_meta ->> 'summary'::text), ''::text)) AS notes,
    (t.entry_date)::date AS due_date,
    (t.intent = ANY (ARRAY['money'::text, 'lead'::text])) AS is_priority,
    r.task_category,
    jsonb_build_object('correspondence', t.id, 'intent', t.intent, 'received', (t.entry_date)::date, 'subject', t.subject) AS meta
   FROM (r
     JOIN v_inbound_tails t ON ((r.id = 'reply_needed'::text)))
  WHERE ((t.intent = ANY (ARRAY['reply_needed'::text, 'money'::text, 'lead'::text])) AND (NOT t.answered) AND (t.reply_dismissed_at IS NULL) AND (t.entry_date > (now() - (((r.params ->> 'stale_after_days'::text) || ' days'::text))::interval)) AND (t.entry_date < (now() - ((
        CASE
            WHEN (t.intent = ANY (ARRAY['money'::text, 'lead'::text])) THEN (r.params ->> 'money_after_days'::text)
            ELSE (r.params ->> 'reply_after_days'::text)
        END || ' days'::text))::interval)))
UNION ALL
 -- CHANGED: a dismissed email no longer raises a task.
 SELECT 'editorial_inbox'::text AS rule_id,
    ('editorial:'::text || (t.id)::text) AS signal_key,
    t.business_id,
    (('Editorial: '::text || t.business_name) || COALESCE((' — '::text || "left"(t.subject, 60)), ''::text)) AS title,
    ((('Arrived '::text || to_char(t.entry_date, 'DD Mon'::text)) || '. '::text) || COALESCE((t.intent_meta ->> 'summary'::text), 'Press release, event or copy for the newsletter.'::text)) AS notes,
    (t.entry_date)::date AS due_date,
    false AS is_priority,
    r.task_category,
    jsonb_build_object('correspondence', t.id, 'intent', 'editorial', 'received', (t.entry_date)::date) AS meta
   FROM (r
     JOIN v_inbound_tails t ON ((r.id = 'editorial_inbox'::text)))
  WHERE ((t.intent = 'editorial'::text) AND (NOT t.answered) AND (t.reply_dismissed_at IS NULL) AND (t.entry_date > (now() - (((r.params ->> 'fresh_days'::text) || ' days'::text))::interval)))
UNION ALL
 SELECT 'commitment_due'::text AS rule_id,
    ('commitment:'::text || (o.id)::text) AS signal_key,
    o.business_id,
    (((('You said you''d: '::text || COALESCE((o.intent_meta ->> 'what'::text), 'follow up'::text)) || ' ('::text) || b.name) || ')'::text) AS title,
    ((((('Promised on '::text || to_char(o.entry_date, 'DD Mon'::text)) || ' for '::text) || COALESCE((o.intent_meta ->> 'due'::text), 'no date'::text)) || '. '::text) || COALESCE("left"(o.subject, 80), ''::text)) AS notes,
    COALESCE(((o.intent_meta ->> 'due'::text))::date, CURRENT_DATE) AS due_date,
    (((o.intent_meta ->> 'due'::text))::date < CURRENT_DATE) AS is_priority,
    r.task_category,
    jsonb_build_object('correspondence', o.id, 'what', (o.intent_meta ->> 'what'::text), 'due', (o.intent_meta ->> 'due'::text)) AS meta
   FROM ((r
     JOIN correspondence o ON ((r.id = 'commitment_due'::text)))
     JOIN businesses b ON ((b.id = o.business_id)))
  WHERE ((o.direction = 'sent'::text) AND (o.intent = 'commitment'::text) AND (COALESCE(((o.intent_meta ->> 'done'::text))::boolean, false) = false) AND (((o.intent_meta ->> 'due'::text))::date <= (CURRENT_DATE + ((r.params ->> 'lead_days'::text))::integer)))
UNION ALL
 SELECT 'advertiser_stats'::text AS rule_id,
    ((('stats:'::text || (c.contract_id)::text) || ':'::text) || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYY-MM'::text)) AS signal_key,
    c.business_id,
    ((('Send '::text || to_char((CURRENT_DATE)::timestamp with time zone, 'Month'::text)) || ' stats to '::text) || c.business_name) AS title,
    (((('Advertising runs '::text || to_char((c.contract_start)::timestamp with time zone, 'DD Mon YY'::text)) || ' to '::text) || to_char((c.contract_end)::timestamp with time zone, 'DD Mon YY'::text)) || COALESCE(('. '::text || "left"(c.deal_terms, 140)), ''::text)) AS notes,
    make_date((EXTRACT(year FROM CURRENT_DATE))::integer, (EXTRACT(month FROM CURRENT_DATE))::integer, ((r.params ->> 'due_day'::text))::integer) AS due_date,
    false AS is_priority,
    r.task_category,
    jsonb_build_object('contract', c.contract_id, 'month', to_char((CURRENT_DATE)::timestamp with time zone, 'YYYY-MM'::text)) AS meta
   FROM (r
     JOIN v_contract_status c ON ((r.id = 'advertiser_stats'::text)))
  WHERE (c.in_force AND (c.membership_type = 'advertiser'::text))
UNION ALL
 SELECT 'club_card_checkin'::text AS rule_id,
    ('checkin:'::text || (c.contract_id)::text) AS signal_key,
    c.business_id,
    ('Check in with '::text || c.business_name) AS title,
    (('Halfway through their Club Card year (ends '::text || to_char((c.contract_end)::timestamp with time zone, 'DD Mon YYYY'::text)) || '). How is the offer working, anything to promote, any stats worth sharing.'::text) AS notes,
    (c.contract_start + ((c.contract_end - c.contract_start) / 2)) AS due_date,
    false AS is_priority,
    r.task_category,
    jsonb_build_object('contract', c.contract_id, 'midpoint', (c.contract_start + ((c.contract_end - c.contract_start) / 2))) AS meta
   FROM (r
     JOIN v_contract_status c ON ((r.id = 'club_card_checkin'::text)))
  WHERE (c.in_force AND (c.membership_type = 'club_card'::text) AND (c.contract_start IS NOT NULL) AND ((CURRENT_DATE >= (c.contract_start + ((c.contract_end - c.contract_start) / 2))) AND (CURRENT_DATE <= ((c.contract_start + ((c.contract_end - c.contract_start) / 2)) + ((r.params ->> 'open_for_days'::text))::integer))));

-- 4. Once ticked, items with their own source never reopen ------------------
-- 36500 days is "never" for the engine's reopen check. Money keeps its 7 days.

UPDATE task_rules
SET params = params || jsonb_build_object('reopen_after_days', 36500)
WHERE id IN ('reply_needed','commitment_due','editorial_inbox','correspondence_flagged',
             'renewal_due','renewal_lapsed','unrecorded_renewal','club_card_checkin');
