-- Rollback of 20261102_003_sent_mail. Rows filed by file_sent_mail stay (they are real correspondence,
-- ai_metadata source 'sent_mail_sweep'); delete them first if they must go:
--   DELETE FROM correspondence WHERE ai_metadata->>'source' = 'sent_mail_sweep';
--   DELETE FROM mail_scan WHERE disposition = 'unmatched' OR note IN ('filed from Data health');  -- only if wanted
DROP VIEW IF EXISTS public.v_data_health_counts;
DROP VIEW IF EXISTS public.v_data_health;
CREATE VIEW public.v_data_health WITH (security_invoker = true) AS
 WITH live AS (
         SELECT v.id,
            v.name,
            v.normalized_name,
            v.category,
            v.status,
            v.is_club_card,
            v.is_advertiser,
            v.last_contacted_at,
            v.mastersheet_source_ids,
            v.created_at,
            v.updated_at,
            v.contract_start,
            v.contract_end,
            v.deal_terms,
            v.payment_structure,
            v.contract_amount,
            v.address,
            v.email,
            v.phone,
            v.organization_id,
            v.contract_currency,
            v.notes,
            v.membership_type,
            v.relationship_memory,
            v.relationship_memory_updated_at,
            v.contract_renewal_type,
            v.business_type,
            v.disposition,
            v.follow_up_after,
            v.mute_replies,
            v.renewal_stage,
            v.renewal_contacted_at,
            v.outreach_stage,
            v.outreach_contacted_at,
            v.outreach_followed_up_at,
            v.outreach_declined_at,
            v.renewal_declined_at,
            v.outreach_identified_at,
            v.outreach_in_discussion_at,
            v.outreach_won_at,
            v.outreach_invoice_paid_at,
            v.renewal_not_started_at,
            v.renewal_in_discussion_at,
            v.renewal_agreed_at,
            v.renewal_invoice_paid_at,
            v.invoice_number,
            v.merged_into,
            v.attention_snoozed_until,
            v.status_stored,
            v.last_contacted_at_stored,
            v.is_commercial,
            v.current_contract_id,
            v.deal_state,
            v.main_contact_id,
            v.main_contact_is_manual,
            v.website
           FROM v_businesses v
          WHERE ((v.merged_into IS NULL) AND (COALESCE(v.status, ''::text) <> 'Not a business'::text))
        )
 SELECT b.organization_id,
    'club_card_no_card'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    b.current_contract_id AS contract_id,
    ( SELECT max(c.contract_end) AS max
           FROM contracts c
          WHERE ((c.business_id = b.id) AND (c.membership_type = 'club_card'::text))) AS ref_date,
    m.card_state AS detail
   FROM (live b
     LEFT JOIN v_club_card_members m ON ((m.business_id = b.id)))
  WHERE (b.is_club_card AND (COALESCE(m.card_state, 'none'::text) <> ALL (ARRAY['member'::text, 'grace'::text])))
UNION ALL
 SELECT b.organization_id,
    'deal_no_quickbooks'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    c.id AS contract_id,
    c.contract_end AS ref_date,
    c.membership_type AS detail
   FROM (contracts c
     JOIN live b ON ((b.id = c.business_id)))
  WHERE (c.is_current AND (NOT COALESCE(c.invoice_paid, false)) AND (COALESCE(c.contract_amount, (0)::numeric) > (0)::numeric) AND ((c.contract_end IS NULL) OR (c.contract_end >= (cc_today() - 60))) AND (c.qbo_invoice_id IS NULL) AND (NOT (EXISTS ( SELECT 1
           FROM qbo_links l
          WHERE (l.business_id = c.business_id)))))
UNION ALL
 SELECT b.organization_id,
    'active_no_named_contact'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    b.current_contract_id AS contract_id,
    NULL::date AS ref_date,
    b.deal_state AS detail
   FROM live b
  WHERE ((b.status = 'Active'::text) AND COALESCE(b.is_commercial, true) AND (NOT (EXISTS ( SELECT 1
           FROM contacts ct
          WHERE ((ct.business_id = b.id) AND COALESCE(ct.is_active, true) AND (NOT COALESCE(ct.name_is_placeholder, false)))))))
UNION ALL
 SELECT b.organization_id,
    'stored_out_of_step'::text AS check_key,
    b.id AS business_id,
    b.name AS business_name,
    NULL::uuid AS contract_id,
    (b.last_contacted_at_stored)::date AS ref_date,
    concat_ws(', '::text,
        CASE
            WHEN (b.status IS DISTINCT FROM b.status_stored) THEN 'status'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored) THEN 'last_in_touch'::text
            ELSE NULL::text
        END) AS detail
   FROM live b
  WHERE ((b.status IS DISTINCT FROM b.status_stored) OR (b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored))
UNION ALL
 SELECT m.organization_id,
    'qbo_customer_to_match'::text AS check_key,
    m.suggested_business_id AS business_id,
    m.customer_name AS business_name,
    NULL::uuid AS contract_id,
    m.last_invoice_date AS ref_date,
    m.qbo_customer_id AS detail
   FROM v_qbo_customers_to_match m;
CREATE VIEW public.v_data_health_counts WITH (security_invoker = true) AS
 WITH checks(sort, check_key, title, fixed_on) AS (
         VALUES (1,'club_card_no_card'::text,'Club Card shown, no card in force'::text,'/data-health'::text), (2,'deal_no_quickbooks'::text,'Deal with no QuickBooks link'::text,'/data-health'::text), (3,'active_no_named_contact'::text,'Active business with no named contact'::text,'/data-health'::text), (4,'stored_out_of_step'::text,'Stored status or last in touch out of step'::text,'/data-health'::text), (5,'club_card_website'::text,'Club Card members with a website problem'::text,'/club-card?show=problems'::text), (6,'club_card_pages_to_match'::text,'Club Card website pages waiting to be matched'::text,'/club-card'::text), (7,'newsletter_unclear'::text,'Unclear newsletter mentions'::text,'/newsletter?view=check'::text), (8,'qbo_customer_to_match'::text,'QuickBooks customers to match'::text,'/data-health'::text)
        ), n AS (
         SELECT v_data_health.organization_id,
            v_data_health.check_key,
            count(*) AS n
           FROM v_data_health
          GROUP BY v_data_health.organization_id, v_data_health.check_key
        UNION ALL
         SELECT v_club_card_members.organization_id,
            'club_card_website'::text AS text,
            count(*) AS count
           FROM v_club_card_members
          WHERE (cardinality(COALESCE(v_club_card_members.issues, '{}'::text[])) > 0)
          GROUP BY v_club_card_members.organization_id
        UNION ALL
         SELECT club_card_pages.organization_id,
            'club_card_pages_to_match'::text AS text,
            count(*) AS count
           FROM club_card_pages
          WHERE ((club_card_pages.gone_at IS NULL) AND (club_card_pages.match_status = ANY (ARRAY['unmatched'::text, 'suggested'::text])))
          GROUP BY club_card_pages.organization_id
        UNION ALL
         SELECT newsletter_mentions.organization_id,
            'newsletter_unclear'::text AS text,
            count(*) AS count
           FROM newsletter_mentions
          WHERE (newsletter_mentions.status = 'unclear'::text)
          GROUP BY newsletter_mentions.organization_id
        )
 SELECT o.id AS organization_id,
    k.sort,
    k.check_key,
    k.title,
    k.fixed_on,
    (COALESCE(n.n, (0)::bigint))::integer AS n
   FROM ((organizations o
     CROSS JOIN checks k)
     LEFT JOIN n ON (((n.organization_id = o.id) AND (n.check_key = k.check_key))));
GRANT SELECT ON public.v_data_health, public.v_data_health_counts TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.system_alarm(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(job_key text, label text, kind text, schedule text, due_at timestamp with time zone, last_ok_at timestamp with time zone, last_run_at timestamp with time zone, last_error text, missed boolean, missed_days date[], line text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  WITH jobs AS (
    -- pg_cron jobs
    SELECT 'cron:' || j.jobname AS job_key,
           initcap(replace(j.jobname, '-', ' ')) || ' (database, ' || to_char(make_time(split_part(j.schedule, ' ', 2)::int, split_part(j.schedule, ' ', 1)::int, 0), 'HH24:MI') || ' UTC)' AS label,
           'database' AS kind, j.schedule,
           CASE WHEN split_part(j.schedule, ' ', 5) = '*' THEN ARRAY[1,2,3,4,5,6,7]
                ELSE (SELECT array_agg(CASE WHEN x::int = 0 THEN 7 ELSE x::int END) FROM unnest(string_to_array(split_part(j.schedule, ' ', 5), ',')) x) END AS days,
           make_time(split_part(j.schedule, ' ', 2)::int, split_part(j.schedule, ' ', 1)::int, 0) + interval '30 minutes' AS due_time,
           (SELECT max(d.end_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.status = 'succeeded' AND d.start_time <= p_now) AS last_ok,
           (SELECT max(d.start_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.start_time <= p_now) AS last_run,
           (SELECT d.return_message FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.start_time <= p_now
              ORDER BY d.start_time DESC LIMIT 1) AS last_msg,
           (SELECT d.status FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.start_time <= p_now
              ORDER BY d.start_time DESC LIMIT 1) AS last_status,
           ARRAY(SELECT DISTINCT (d.start_time AT TIME ZONE 'UTC')::date FROM cron.job_run_details d
                 WHERE d.jobid = j.jobid AND d.status = 'succeeded' AND d.start_time <= p_now AND d.start_time > p_now - interval '16 days') AS ok_days
    FROM cron.job j
    WHERE j.active AND j.schedule ~ '^\d+ \d+ \* \* [\d,*]+$'
    UNION ALL
    SELECT 'vercel:club_card_read', 'Club Card read (nightly)', 'app', '30 2 * * *', ARRAY[1,2,3,4,5,6,7], time '03:30',
           (SELECT max(r.ran_at) FROM club_card_sync_runs r WHERE r.ok AND r.ran_at <= p_now),
           (SELECT max(r.ran_at) FROM club_card_sync_runs r WHERE r.ran_at <= p_now),
           (SELECT r.error FROM club_card_sync_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           (SELECT CASE WHEN r.ok THEN 'succeeded' ELSE 'failed' END FROM club_card_sync_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           ARRAY(SELECT DISTINCT (r.ran_at AT TIME ZONE 'UTC')::date FROM club_card_sync_runs r WHERE r.ok AND r.ran_at <= p_now AND r.ran_at > p_now - interval '16 days')
    UNION ALL
    SELECT 'vercel:newsletter_read', 'Newsletter read (Wednesdays)', 'app', '0 12 * * 3', ARRAY[3], time '13:00',
           (SELECT max(r.ran_at) FROM newsletter_read_runs r WHERE r.ok AND r.ran_at <= p_now),
           (SELECT max(r.ran_at) FROM newsletter_read_runs r WHERE r.ran_at <= p_now),
           (SELECT r.error FROM newsletter_read_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           (SELECT CASE WHEN r.ok THEN 'succeeded' ELSE 'failed' END FROM newsletter_read_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           ARRAY(SELECT DISTINCT (r.ran_at AT TIME ZONE 'UTC')::date FROM newsletter_read_runs r WHERE r.ok AND r.ran_at <= p_now AND r.ran_at > p_now - interval '16 days')
    UNION ALL
    SELECT 'vercel:listings_read', 'What''s On listings read (nightly)', 'app', '40 2 * * *', ARRAY[1,2,3,4,5,6,7], time '03:40',
           (SELECT max(r.ran_at) FROM listing_sync_runs r WHERE r.ok AND r.ran_at <= p_now),
           (SELECT max(r.ran_at) FROM listing_sync_runs r WHERE r.ran_at <= p_now),
           (SELECT r.error FROM listing_sync_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           (SELECT CASE WHEN r.ok THEN 'succeeded' ELSE 'failed' END FROM listing_sync_runs r WHERE r.ran_at <= p_now ORDER BY r.ran_at DESC LIMIT 1),
           ARRAY(SELECT DISTINCT (r.ran_at AT TIME ZONE 'UTC')::date FROM listing_sync_runs r WHERE r.ok AND r.ran_at <= p_now AND r.ran_at > p_now - interval '16 days')
    UNION ALL
    SELECT 'vercel:companies_house_read', 'Companies House read (Mondays)', 'app', '30 5 * * 1', ARRAY[1], time '06:30',
           (SELECT max(s.run_at) FROM scraper_logs s WHERE 'Companies House' = ANY (s.sources_checked)
              AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(s.errors) = 'array' THEN s.errors END), 0) = 0 AND s.run_at <= p_now),
           (SELECT max(s.run_at) FROM scraper_logs s WHERE 'Companies House' = ANY (s.sources_checked) AND s.run_at <= p_now),
           (SELECT s.errors::text FROM scraper_logs s WHERE 'Companies House' = ANY (s.sources_checked) AND s.run_at <= p_now ORDER BY s.run_at DESC LIMIT 1),
           NULL,
           ARRAY(SELECT DISTINCT (s.run_at AT TIME ZONE 'UTC')::date FROM scraper_logs s WHERE 'Companies House' = ANY (s.sources_checked)
                 AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(s.errors) = 'array' THEN s.errors END), 0) = 0
                 AND s.run_at <= p_now AND s.run_at > p_now - interval '16 days')
    UNION ALL
    SELECT 'routine:' || s.routine,
           CASE s.routine WHEN 'desk_email' THEN 'Morning desk email' WHEN 'daily_desk' THEN 'Daily desk routine'
                WHEN 'member_care' THEN 'Member care routine' WHEN 'outreach' THEN 'Outreach routine' ELSE s.label END,
           CASE WHEN s.routine = 'desk_email' THEN 'app' ELSE 'routine' END,
           CASE WHEN s.iso_days = ARRAY[1,2,3,4,5] THEN 'weekdays' WHEN cardinality(s.iso_days) = 7 THEN 'daily' ELSE s.iso_days::text END,
           s.iso_days,
           CASE WHEN s.routine = 'desk_email' THEN time '09:00' ELSE time '10:30' END,
           (SELECT max(h.finished_at) FROM routine_heartbeat h WHERE h.routine = s.routine AND h.finished_at <= p_now),
           (SELECT max(h.finished_at) FROM routine_heartbeat h WHERE h.routine = s.routine AND h.finished_at <= p_now),
           NULL, NULL,
           ARRAY(SELECT DISTINCT h.ran_on FROM routine_heartbeat h WHERE h.routine = s.routine AND h.finished_at <= p_now AND h.finished_at > p_now - interval '16 days')
    FROM routine_schedule s
    WHERE s.enabled
  ),
  -- Each time a job was due in the last 14 days. One is good if a good run happened on its UTC
  -- day or later, before the next time it was due (so a weekly read caught up a day late counts).
  due_times AS (
    SELECT j.job_key, (((p_now AT TIME ZONE 'UTC')::date - g) + j.due_time) AT TIME ZONE 'UTC' AS due,
           ((p_now AT TIME ZONE 'UTC')::date - g) AS day
    FROM jobs j, generate_series(0, 13) g
    WHERE extract(isodow FROM ((p_now AT TIME ZONE 'UTC')::date - g))::int = ANY (j.days)
      AND ((((p_now AT TIME ZONE 'UTC')::date - g) + j.due_time) AT TIME ZONE 'UTC') <= p_now
  ),
  judged_times AS (
    -- next_day: the next scheduled day, whether or not it has come yet
    SELECT t.*, (SELECT min(t.day + k) FROM jobs j, generate_series(1, 7) k
                 WHERE j.job_key = t.job_key AND extract(isodow FROM t.day + k)::int = ANY (j.days)) AS next_day,
           row_number() OVER (PARTITION BY t.job_key ORDER BY t.day DESC) AS nth
    FROM due_times t
  ),
  misses AS (
    SELECT t.job_key, t.day, t.due, t.nth,
           NOT EXISTS (SELECT 1 FROM jobs j, unnest(j.ok_days) x
                       WHERE j.job_key = t.job_key AND x >= t.day AND x < t.next_day) AS missed
    FROM judged_times t
  ),
  -- Shown: every miss in the last 30 hours (so the morning after hears of it even if the job has
  -- since run), and, while the latest due time is still unmet, the whole run of misses back to
  -- the last good run.
  shown AS (
    SELECT m.job_key, m.day FROM misses m
    WHERE m.missed AND (m.due > p_now - interval '30 hours'
      OR NOT EXISTS (SELECT 1 FROM misses n WHERE n.job_key = m.job_key AND n.day > m.day AND NOT n.missed)
         AND EXISTS (SELECT 1 FROM misses n WHERE n.job_key = m.job_key AND n.nth = 1 AND n.missed))
  ),
  flagged AS (
    SELECT j.*, (SELECT max(t.due) FROM due_times t WHERE t.job_key = j.job_key) AS due,
           ARRAY(SELECT s.day FROM shown s WHERE s.job_key = j.job_key ORDER BY s.day) AS miss_days
    FROM jobs j
  ),
  flagged2 AS (
    SELECT f.*, cardinality(f.miss_days) > 0 AS is_missed FROM flagged f
  )
  SELECT * FROM (
  SELECT f.job_key, f.label, f.kind, f.schedule, f.due, f.last_ok, f.last_run,
         CASE WHEN f.last_status = 'failed' THEN left(f.last_msg, 300) END,
         f.is_missed,
         CASE WHEN f.is_missed THEN f.miss_days ELSE ARRAY[]::date[] END,
         CASE WHEN NOT f.is_missed THEN NULL ELSE
           f.label || ' did not run on ' ||
           (SELECT string_agg(to_char(x, 'Dy FMDD Mon'), ', ' ORDER BY x) FROM unnest(f.miss_days[1:4]) x) ||
           CASE WHEN cardinality(f.miss_days) > 4 THEN ' and ' || (cardinality(f.miss_days) - 4) || ' more days' ELSE '' END ||
           CASE WHEN f.last_ok IS NULL THEN ' (no good run on record)'
                WHEN (f.last_ok AT TIME ZONE 'UTC')::date > f.miss_days[cardinality(f.miss_days)] THEN ' (it has run since, ' || to_char(f.last_ok AT TIME ZONE 'Europe/London', 'Dy FMDD Mon HH24:MI') || ')'
                ELSE ' (last good run ' || to_char(f.last_ok AT TIME ZONE 'Europe/London', 'Dy FMDD Mon HH24:MI') || ')' END ||
           CASE WHEN f.last_status = 'failed' THEN '; its last try failed' ELSE '' END
         END
  FROM flagged2 f
  UNION ALL
  -- QuickBooks copy: the daily desk routine rewrites every invoice row's synced_at on each weekday run, so
  -- the newest synced_at is the last good run. Missed when it is over 2 days old and a weekday run
  -- (due 10:30 London) has gone by since.
  SELECT 'routine:quickbooks_copy', 'QuickBooks copy (daily desk routine)', 'routine', 'weekdays', q.due, q.last_sync, q.last_sync,
         NULL::text, q.is_missed,
         CASE WHEN q.is_missed THEN ARRAY[q.expected_day] ELSE ARRAY[]::date[] END,
         CASE WHEN q.is_missed THEN
           'QuickBooks copy in the app is out of date: last updated ' || coalesce(to_char(q.last_sync AT TIME ZONE 'Europe/London', 'Dy FMDD Mon HH24:MI'), 'never') ||
           '; the daily desk routine should have refreshed it on ' || to_char(q.expected_day, 'Dy FMDD Mon')
         END
  FROM (
    SELECT s.last_sync, s.expected_day,
           (s.expected_day::timestamp + time '10:30') AT TIME ZONE 'Europe/London' AS due,
           (s.last_sync IS NULL OR (p_now - s.last_sync > interval '2 days' AND (s.last_sync AT TIME ZONE 'Europe/London')::date < s.expected_day)) AS is_missed
    FROM (
      SELECT (SELECT max(i.synced_at) FROM qbo_invoices i WHERE i.synced_at <= p_now) AS last_sync,
             (SELECT d::date FROM generate_series(((p_now AT TIME ZONE 'Europe/London')::date - 7)::timestamp, (p_now AT TIME ZONE 'Europe/London')::date::timestamp, interval '1 day') d
               WHERE extract(isodow FROM d)::int <= 5
                 AND (d + time '10:30') AT TIME ZONE 'Europe/London' <= p_now
               ORDER BY d DESC LIMIT 1) AS expected_day
    ) s
  ) q
  ) alarm
  ORDER BY alarm.is_missed DESC, alarm.kind, alarm.label;
END;
$function$;
DROP VIEW IF EXISTS public.v_sent_mail_to_review;
DROP FUNCTION IF EXISTS public.undo_sent_mail_batch(uuid, text);
DROP FUNCTION IF EXISTS public.ignore_sent_mail(uuid, text[], text);
DROP FUNCTION IF EXISTS public.resolve_sent_mail(uuid, text[], uuid, text);
DROP FUNCTION IF EXISTS public.cc_sent_mail_caller_ok(uuid);
DROP FUNCTION IF EXISTS public.file_sent_mail(uuid, jsonb, text);
DROP TABLE IF EXISTS public.sent_mail_runs;
DROP FUNCTION IF EXISTS public.cc_insert_sent_mail(bigint, uuid, uuid, uuid[], uuid[]);
DROP FUNCTION IF EXISTS public.cc_sent_mail_duplicate(uuid, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.cc_norm_subject(text);
DROP FUNCTION IF EXISTS public.cc_sha256(text);
DROP FUNCTION IF EXISTS public.cc_business_for_domain_readonly(uuid, text);
DROP FUNCTION IF EXISTS public.cc_is_personal_domain(text);
DROP FUNCTION IF EXISTS public.cc_is_own_address(text);
DROP INDEX IF EXISTS public.mail_scan_held_idx;
ALTER TABLE public.mail_scan DROP COLUMN IF EXISTS cc_emails, DROP COLUMN IF EXISTS body, DROP COLUMN IF EXISTS web_link,
  DROP COLUMN IF EXISTS held_key, DROP COLUMN IF EXISTS held_name, DROP COLUMN IF EXISTS resolved_at;
