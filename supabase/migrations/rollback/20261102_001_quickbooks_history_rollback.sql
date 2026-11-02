-- Rollback of 20261102_001_quickbooks_history.sql: every function and view back to its definition
-- before Stage 17b (taken from the live-matching copy on 2 Nov 2026), then the new view and table dropped.
-- Run the past contracts undo and the history load undo first (contract_invoices holds their links).

CREATE OR REPLACE FUNCTION public.record_qbo_one_offs()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count integer;
BEGIN
  INSERT INTO one_off_sales (business_id, qbo_invoice_id, doc_number, sold_on, amount, is_paid, description)
  SELECT l.business_id, i.qbo_invoice_id, i.doc_number, i.txn_date, i.total_amount, i.is_paid,
         nullif(btrim(i.line_description), '')
  FROM qbo_invoices i
  JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
  WHERE coalesce(i.private_memo, '') <> 'Voided'
    AND i.total_amount > 0
    AND coalesce(i.line_description, '') !~* '(12 months?|1 year|one year|annual|club card|membership)'
    AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.qbo_invoice_id = i.qbo_invoice_id)
    AND NOT EXISTS (SELECT 1 FROM one_off_sales s WHERE s.qbo_invoice_id = i.qbo_invoice_id)
  ON CONFLICT (qbo_invoice_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE one_off_sales s SET is_paid = i.is_paid
  FROM qbo_invoices i
  WHERE i.qbo_invoice_id = s.qbo_invoice_id AND s.is_paid IS DISTINCT FROM i.is_paid;

  RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.derive_business_stages(p_business_id uuid)
 RETURNS TABLE(outreach_stage text, outreach_identified_at date, outreach_contacted_at date, outreach_followed_up_at date, outreach_in_discussion_at date, outreach_invoice_paid_at date, renewal_stage text, renewal_not_started_at date, renewal_contacted_at date, renewal_in_discussion_at date, outreach_skip_reason text, renewal_skip_reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH b AS (
  SELECT * FROM v_businesses WHERE id = p_business_id
),
corr AS (
  SELECT
    c.entry_date,
    CASE
      WHEN c.direction = 'received'            THEN 'in'
      WHEN c.direction IN ('sent', 'outbound') THEN 'out'
      ELSE 'unknown'
    END AS dir
  FROM correspondence c
  WHERE c.type IN ('Email', 'Email Thread', 'Call', 'Meeting')
    AND c.entry_date IS NOT NULL
    AND (c.business_id = p_business_id OR p_business_id = ANY (c.linked_business_ids))
),
lifetime AS (
  SELECT
    count(*) FILTER (WHERE dir = 'in')                 AS n_in,
    count(*) FILTER (WHERE dir = 'out')                AS n_out,
    count(*)                                           AS n_total,
    min(entry_date) FILTER (WHERE dir = 'in')::date    AS first_in,
    min(entry_date) FILTER (WHERE dir = 'out')::date   AS first_out,
    max(entry_date) FILTER (WHERE dir = 'out')::date   AS last_out
  FROM corr
),
contract_facts AS (
  SELECT
    EXISTS (SELECT 1 FROM contracts c WHERE c.business_id = p_business_id) AS has_any_contract,
    (SELECT min(c.contract_end)
       FROM contracts c
      WHERE c.business_id = p_business_id
        AND c.is_current
        AND c.contract_end IS NOT NULL) AS cur_end
),
paid_invoice AS (
  SELECT max(i.txn_date) AS last_paid_date
  FROM qbo_links l
  JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
  WHERE l.business_id = p_business_id
    AND i.is_paid
    AND coalesce(i.private_memo, '') <> 'Voided'
),
renewal_window AS (
  SELECT
    count(*) FILTER (WHERE c.dir = 'in')                 AS n_in,
    count(*) FILTER (WHERE c.dir = 'out')                AS n_out,
    min(c.entry_date) FILTER (WHERE c.dir = 'in')::date  AS first_in,
    min(c.entry_date) FILTER (WHERE c.dir = 'out')::date AS first_out
  FROM corr c
  CROSS JOIN contract_facts cf
  WHERE cf.cur_end IS NOT NULL
    AND c.entry_date > (cf.cur_end - INTERVAL '90 days')
),
raw AS (
  SELECT
    b.*,
    l.n_in, l.n_out, l.n_total, l.first_in, l.first_out, l.last_out,
    cf.has_any_contract, cf.cur_end,
    pi.last_paid_date,
    rw.n_in AS r_in, rw.n_out AS r_out,
    rw.first_in AS r_first_in, rw.first_out AS r_first_out,
    CASE
      WHEN b.outreach_stage IS NULL                       THEN 'not_on_outreach_board'
      WHEN b.mute_replies                                 THEN 'mute_replies'
      WHEN b.outreach_declined_at IS NOT NULL             THEN 'declined_by_human'
      WHEN b.outreach_stage IN ('not_interested', 'won')  THEN 'manual_only_stage'
      WHEN b.status IN ('Former', 'Inactive', 'Closed')   THEN 'closed_or_former_business'
      WHEN cf.has_any_contract                            THEN 'graduated_to_renewal'
      WHEN b.is_club_card OR b.is_advertiser              THEN 'graduated_to_renewal'
      ELSE NULL
    END AS o_skip,
    CASE
      WHEN NOT (b.is_club_card OR b.is_advertiser)        THEN 'not_on_renewal_board'
      WHEN b.mute_replies                                 THEN 'mute_replies'
      WHEN b.renewal_declined_at IS NOT NULL              THEN 'declined_by_human'
      WHEN b.renewal_stage IN ('not_renewing','agreed','invoice_paid','in_progress')
                                                          THEN 'manual_only_stage'
      WHEN b.status IN ('Former', 'Inactive', 'Closed')   THEN 'closed_or_former_business'
      WHEN cf.cur_end IS NULL                             THEN 'no_current_contract_end'
      ELSE NULL
    END AS r_skip
  FROM b
  CROSS JOIN lifetime l
  CROSS JOIN contract_facts cf
  CROSS JOIN paid_invoice pi
  CROSS JOIN renewal_window rw
),
candidate AS (
  SELECT
    raw.*,
    CASE
      WHEN raw.o_skip IS NOT NULL         THEN NULL
      WHEN raw.last_paid_date IS NOT NULL THEN 'invoice_paid'
      WHEN raw.n_in >= 1                  THEN 'in_discussion'
      WHEN raw.n_out >= 2                 THEN 'followed_up'
      WHEN raw.n_out >= 1                 THEN 'contacted'
      WHEN raw.n_total = 0                THEN 'identified'
      ELSE NULL
    END AS o_candidate,
    CASE
      WHEN raw.r_skip IS NOT NULL         THEN NULL
      WHEN raw.r_in >= 1                  THEN 'in_discussion'
      WHEN raw.r_out >= 1                 THEN 'contacted'
      ELSE 'not_started'
    END AS r_candidate
  FROM raw
),
ranked AS (
  SELECT
    candidate.*,
    CASE candidate.outreach_stage
      WHEN 'identified' THEN 0 WHEN 'contacted' THEN 1 WHEN 'followed_up' THEN 2
      WHEN 'in_discussion' THEN 3 WHEN 'won' THEN 4 WHEN 'invoice_paid' THEN 5
    END AS o_cur_rank,
    CASE candidate.o_candidate
      WHEN 'identified' THEN 0 WHEN 'contacted' THEN 1 WHEN 'followed_up' THEN 2
      WHEN 'in_discussion' THEN 3 WHEN 'won' THEN 4 WHEN 'invoice_paid' THEN 5
    END AS o_new_rank,
    CASE candidate.renewal_stage
      WHEN 'not_started' THEN 0 WHEN 'contacted' THEN 1 WHEN 'in_discussion' THEN 2
    END AS r_cur_rank,
    CASE candidate.r_candidate
      WHEN 'not_started' THEN 0 WHEN 'contacted' THEN 1 WHEN 'in_discussion' THEN 2
    END AS r_new_rank
  FROM candidate
),
final AS (
  SELECT
    ranked.*,
    (ranked.o_candidate IS NOT NULL AND ranked.o_cur_rank IS NOT NULL
       AND ranked.o_new_rank < ranked.o_cur_rank) AS o_would_regress,
    (ranked.r_candidate IS NOT NULL AND ranked.r_cur_rank IS NOT NULL
       AND ranked.r_new_rank < ranked.r_cur_rank) AS r_would_regress,
    (ranked.o_candidate IS DISTINCT FROM ranked.outreach_stage) AS o_stage_moving,
    (ranked.r_candidate IS DISTINCT FROM ranked.renewal_stage)  AS r_stage_moving
  FROM ranked
)
SELECT
  CASE WHEN f.o_would_regress THEN NULL ELSE f.o_candidate END,

  -- Dates are only (re)stamped when the card actually moves, or when the slot
  -- is empty. Re-dating a card that is already in the right stage would jog the
  -- "days in stage" badge backwards for no visible gain.
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'identified' THEN NULL
       ELSE coalesce(f.outreach_identified_at, f.created_at::date) END,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'contacted' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_contacted_at IS NOT NULL THEN NULL
       ELSE f.first_out END,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'followed_up' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_followed_up_at IS NOT NULL THEN NULL
       ELSE f.last_out END,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'in_discussion' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_in_discussion_at IS NOT NULL THEN NULL
       ELSE f.first_in END,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'invoice_paid' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_invoice_paid_at IS NOT NULL THEN NULL
       ELSE f.last_paid_date END,

  CASE WHEN f.r_would_regress THEN NULL ELSE f.r_candidate END,

  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'not_started' THEN NULL
       ELSE coalesce(f.renewal_not_started_at, f.created_at::date) END,
  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'contacted' THEN NULL
       WHEN NOT f.r_stage_moving AND f.renewal_contacted_at IS NOT NULL THEN NULL
       ELSE f.r_first_out END,
  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'in_discussion' THEN NULL
       WHEN NOT f.r_stage_moving AND f.renewal_in_discussion_at IS NOT NULL THEN NULL
       ELSE f.r_first_in END,

  coalesce(f.o_skip, CASE WHEN f.o_would_regress THEN 'would_regress' END),
  coalesce(f.r_skip, CASE WHEN f.r_would_regress THEN 'would_regress' END)
FROM final f;
$function$;

CREATE OR REPLACE VIEW public.v_data_health WITH (security_invoker = true) AS
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
  WHERE ((b.status IS DISTINCT FROM b.status_stored) OR (b.last_contacted_at IS DISTINCT FROM b.last_contacted_at_stored));

CREATE OR REPLACE VIEW public.v_data_health_counts WITH (security_invoker = true) AS
 WITH checks(sort, check_key, title, fixed_on) AS (
         VALUES (1,'club_card_no_card'::text,'Club Card shown, no card in force'::text,'/data-health'::text), (2,'deal_no_quickbooks'::text,'Deal with no QuickBooks link'::text,'/data-health'::text), (3,'active_no_named_contact'::text,'Active business with no named contact'::text,'/data-health'::text), (4,'stored_out_of_step'::text,'Stored status or last in touch out of step'::text,'/data-health'::text), (5,'club_card_website'::text,'Club Card members with a website problem'::text,'/club-card?show=problems'::text), (6,'club_card_pages_to_match'::text,'Club Card website pages waiting to be matched'::text,'/club-card'::text), (7,'newsletter_unclear'::text,'Unclear newsletter mentions'::text,'/newsletter?view=check'::text)
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

CREATE OR REPLACE VIEW public.v_system_health WITH (security_invoker = true) AS
 SELECT ( SELECT v_receivables.receivables_total
           FROM v_receivables) AS receivables_total,
    ( SELECT v_receivables.invoices_outstanding
           FROM v_receivables) AS invoices_outstanding,
    ( SELECT v_receivables.adjustments
           FROM v_receivables) AS ar_adjustments,
    ( SELECT max(qbo_invoices.synced_at) AS max
           FROM qbo_invoices) AS quickbooks_synced_at,
    (round((EXTRACT(epoch FROM (now() - ( SELECT max(qbo_invoices.synced_at) AS max
           FROM qbo_invoices))) / (3600)::numeric)))::integer AS quickbooks_hours_old,
    ( SELECT max(mail_scan.scanned_at) AS max
           FROM mail_scan) AS mail_swept_at,
    ( SELECT count(*) AS count
           FROM mail_scan
          WHERE (mail_scan.scanned_at > (now() - '24:00:00'::interval))) AS mail_seen_24h,
    ( SELECT count(*) AS count
           FROM mail_scan
          WHERE ((mail_scan.disposition = 'backfilled'::text) AND (mail_scan.scanned_at > (now() - '24:00:00'::interval)))) AS mail_backfilled_24h,
    ( SELECT max(system_task_runs.ran_at) AS max
           FROM system_task_runs) AS engine_ran_at,
    ( SELECT system_task_runs.opened
           FROM system_task_runs
          ORDER BY system_task_runs.ran_at DESC
         LIMIT 1) AS engine_last_opened,
    ( SELECT system_task_runs.closed
           FROM system_task_runs
          ORDER BY system_task_runs.ran_at DESC
         LIMIT 1) AS engine_last_closed,
    ( SELECT count(*) AS count
           FROM task_evidence
          WHERE (task_evidence.observed_at > (now() - '24:00:00'::interval))) AS evidence_24h,
    ( SELECT max(scraper_logs.run_at) AS max
           FROM scraper_logs
          WHERE (scraper_logs.scraper_type = 'news'::text)) AS news_scan_at,
    ( SELECT max(scraper_logs.run_at) AS max
           FROM scraper_logs
          WHERE (scraper_logs.scraper_type = 'prospecting'::text)) AS prospecting_at,
    ( SELECT count(*) AS count
           FROM news_leads
          WHERE (news_leads.status = 'new'::text)) AS news_leads_new,
    ( SELECT count(*) AS count
           FROM prospect_leads
          WHERE ((prospect_leads.status = 'new'::text) AND (prospect_leads.matched_business_id IS NULL))) AS prospects_new,
    ( SELECT count(*) AS count
           FROM legacy_task_inserts_blocked
          WHERE (legacy_task_inserts_blocked.blocked_at > (now() - '24:00:00'::interval))) AS legacy_blocked_24h,
    ( SELECT count(*) AS count
           FROM qbo_customers c
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM qbo_links l
                  WHERE (l.qbo_customer_id = c.qbo_customer_id))))) AS quickbooks_unlinked,
    ( SELECT count(*) AS count
           FROM tasks
          WHERE (tasks.status = 'open'::text)) AS open_tasks,
    ( SELECT count(*) AS count
           FROM tasks
          WHERE ((tasks.status = 'open'::text) AND (tasks.signal_key IS NULL))) AS open_hand_written;

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
  ORDER BY f.is_missed DESC, f.kind, f.label;
END;
$function$;

CREATE OR REPLACE FUNCTION public.business_dossier(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  bid uuid;
  cands jsonb;
  top_score numeric;
  second_score numeric;
  n_exact int;
  today date := cc_today();
  b record;
  doc jsonb;
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN
    RETURN jsonb_build_object('found', false, 'message', 'Give a business name or id');
  END IF;

  IF trim(p_query) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    bid := cc_business_survivor(trim(p_query)::uuid);
  ELSE
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.score DESC, c.name),
           max(c.score),
           count(*) FILTER (WHERE c.score >= 1.0)
      INTO cands, top_score, n_exact
      FROM cc_business_candidates(p_query, 10) c;
    IF cands IS NULL THEN
      RETURN jsonb_build_object('found', false, 'query', p_query,
        'message', 'No business matches. Try part of the name, or find_businesses(''{"q": "..."}'').');
    END IF;
    SELECT (e->>'score')::numeric INTO second_score FROM jsonb_array_elements(cands) WITH ORDINALITY x(e, i) WHERE i = 2;
    IF n_exact = 1
       OR (top_score >= 0.5 AND (second_score IS NULL OR second_score <= top_score - 0.15)) THEN
      bid := (cands->0->>'business_id')::uuid;
    ELSE
      RETURN jsonb_build_object('found', false, 'ambiguous', true, 'query', p_query,
        'message', 'Several businesses match; call again with the id of the one meant.',
        'candidates', cands);
    END IF;
  END IF;

  SELECT * INTO b FROM v_businesses WHERE id = bid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'query', p_query, 'message', 'No business with that id');
  END IF;

  doc := jsonb_build_object(
    'found', true,
    'generated_at', now(),
    'today', today,
    'app_url', 'https://correspondenceclerk.com/businesses/' || b.id,

    'business', jsonb_build_object(
      'id', b.id, 'name', b.name, 'status', b.status, 'category', b.category,
      'business_type', b.business_type, 'is_commercial', b.is_commercial,
      'website', b.website, 'address', b.address, 'email', b.email, 'phone', b.phone,
      'notes', left(b.notes, 800), 'relationship_memory', b.relationship_memory,
      'created_at', b.created_at::date, 'last_in_touch', b.last_contacted_at::date,
      'deal_state', b.deal_state, 'renewal_stage', b.renewal_stage,
      'outreach_stage', b.outreach_stage, 'attention_snoozed_until', b.attention_snoozed_until,
      'merged_from', (SELECT jsonb_agg(m.name ORDER BY m.name) FROM businesses m
                      WHERE m.merged_into IS NOT NULL AND cc_business_survivor(m.id) = b.id)),

    'deal', jsonb_build_object(
      'note', 'From contracts. Ignore businesses.is_club_card / contract_* / deal_terms (emptied 23 Oct 2026).',
      'current', (SELECT to_jsonb(x) FROM (
          SELECT c.id, c.membership_type, c.contract_start, c.contract_end, c.contract_amount, c.contract_currency,
                 c.billing_frequency, c.deal_terms, c.invoice_paid, c.qbo_invoice_id,
                 (c.contract_end - today) AS days_to_end
          FROM contracts c WHERE c.id = b.current_contract_id) x),
      'history', (SELECT jsonb_agg(to_jsonb(x)) FROM (
          SELECT c.membership_type, c.contract_start, c.contract_end, c.contract_amount, c.billing_frequency,
                 c.deal_terms, c.invoice_paid, c.is_current
          FROM contracts c WHERE c.business_id = b.id
          ORDER BY c.contract_end DESC NULLS LAST, c.contract_start DESC NULLS LAST LIMIT 15) x),
      'contracts_total', (SELECT count(*) FROM contracts c WHERE c.business_id = b.id)),

    'money', (WITH inv AS (
        SELECT i.*, (i.voided_at IS NOT NULL OR coalesce(i.private_memo, '') = 'Voided') AS voided
        FROM qbo_invoices i JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
        WHERE l.business_id = b.id)
      SELECT jsonb_build_object(
        'note', 'QuickBooks copy in the app is partial (not every invoice since 2019 yet).',
        'quickbooks_customers', (SELECT jsonb_agg(jsonb_build_object('qbo_customer_id', q.qbo_customer_id,
                 'name', q.display_name, 'confirmed', l.confirmed, 'total_invoiced', q.total_invoiced,
                 'open_balance', q.open_balance, 'last_invoice_date', q.last_invoice_date))
               FROM qbo_links l LEFT JOIN qbo_customers q ON q.qbo_customer_id = l.qbo_customer_id
               WHERE l.business_id = b.id),
        'owed_total', (SELECT coalesce(sum(balance), 0) FROM inv WHERE balance > 0 AND NOT voided),
        'overdue_total', (SELECT coalesce(sum(balance), 0) FROM inv WHERE balance > 0 AND NOT voided AND due_date < today),
        'open_invoices', (SELECT jsonb_agg(jsonb_build_object('doc', coalesce(doc_number, qbo_invoice_id), 'date', txn_date,
                 'due', due_date, 'total', total_amount, 'balance', balance, 'what', left(line_description, 200))
                 ORDER BY due_date) FROM inv WHERE balance > 0 AND NOT voided),
        'recent_invoices', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('doc', coalesce(doc_number, qbo_invoice_id),
                 'date', txn_date, 'due', due_date, 'total', total_amount, 'balance', balance, 'paid', is_paid,
                 'voided', voided, 'what', left(line_description, 200)) x
                 FROM inv ORDER BY txn_date DESC NULLS LAST LIMIT 10) s),
        'do_not_chase', (SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'reason', e.reason, 'decided_by', e.decided_by,
                 'since', e.created_at::date)) FROM care_exclusions e WHERE e.business_id = b.id))),

    'contacts', jsonb_build_object(
      'main_contact_id', b.main_contact_id,
      'main_contact_chosen_by', CASE WHEN b.main_contact_is_manual THEN 'Tom' WHEN b.main_contact_id IS NOT NULL THEN 'automatic (most correspondence)' END,
      'list', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'role', c.role,
                 'emails', c.emails, 'phones', c.phones, 'is_main', c.id = b.main_contact_id,
                 'is_active', c.is_active, 'name_is_placeholder', c.name_is_placeholder, 'notes', left(c.notes, 300)) x
               FROM contacts c WHERE c.business_id = b.id
               ORDER BY (c.id = b.main_contact_id) DESC, c.is_active DESC NULLS LAST, c.name LIMIT 25) s),
      'total', (SELECT count(*) FROM contacts c WHERE c.business_id = b.id)),

    'attention', (SELECT jsonb_build_object('reason', a.reason, 'detail', a.detail, 'since', a.since,
                   'is_overdue', a.is_overdue, 'all_reasons', a.reasons, 'amount_owed', a.amount_owed,
                   'emails_waiting', a.emails_waiting, 'todos_due', a.todos_due, 'is_snoozed', a.is_snoozed,
                   'club_card_issues', a.club_card_issues)
                  FROM v_business_attention a WHERE a.business_id = b.id LIMIT 1),

    'correspondence', (WITH c AS (
        SELECT c.* FROM correspondence c
        WHERE c.business_id = b.id OR b.id = ANY (coalesce(c.linked_business_ids, '{}'::uuid[])))
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM c),
        'first_date', (SELECT min(entry_date)::date FROM c),
        'last_received', (SELECT max(entry_date)::date FROM c WHERE direction = 'received'),
        'last_sent', (SELECT max(entry_date)::date FROM c WHERE direction = 'sent'),
        'note', 'Newest first; text is the cleaned version, cut to 700 characters. Use search_correspondence for older or specific items.',
        'recent', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('id', c.id, 'date', c.entry_date::date,
                     'type', c.type, 'direction', c.direction, 'subject', c.subject,
                     'contact', (SELECT k.name FROM contacts k WHERE k.id = c.contact_id),
                     'from_internal', c.internal_sender, 'action', NULLIF(c.action_needed::text, 'none'),
                     'due', c.due_at::date, 'intent', c.intent, 'linked_from_other_business', c.business_id <> b.id,
                     'text', left(coalesce(c.formatted_text_current, c.formatted_text_original, c.raw_text_original), 700)) x
                   FROM c WHERE c.type::text NOT IN ('Note') ORDER BY c.entry_date DESC NULLS LAST LIMIT 20) s),
        'notes', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('date', c.entry_date::date, 'subject', c.subject,
                     'text', left(coalesce(c.formatted_text_current, c.formatted_text_original, c.raw_text_original), 700)) x
                   FROM c WHERE c.type::text = 'Note' ORDER BY c.entry_date DESC NULLS LAST LIMIT 10) s))),

    'todos', jsonb_build_object(
      'note', 'Hand-written to-dos (source manual) show in the app; system tasks feed the desk email and routines.',
      'open', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('title', t.title, 'due', t.due_date, 'time', t.due_time,
                 'source', t.source, 'type', t.type, 'notes', left(t.notes, 300), 'overdue', t.due_date < today) x
               FROM tasks t WHERE t.business_id = b.id AND t.status = 'open'
               ORDER BY (t.source = 'manual') DESC, t.due_date NULLS LAST LIMIT 15) s),
      'recently_done', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('title', t.title, 'done', t.completed_at::date,
                 'source', t.source) x
               FROM tasks t WHERE t.business_id = b.id AND t.status <> 'open' AND t.completed_at IS NOT NULL
               ORDER BY t.completed_at DESC LIMIT 5) s)),

    'calendar', (SELECT jsonb_agg(x ORDER BY x->>'date') FROM (
        SELECT jsonb_build_object('date', t.due_date, 'kind', 'to-do', 'what', t.title) x
          FROM tasks t WHERE t.business_id = b.id AND t.status = 'open' AND t.source = 'manual'
           AND t.due_date BETWEEN today - 7 AND today + 90
        UNION ALL
        SELECT jsonb_build_object('date', c.contract_end, 'kind', 'deal ends', 'what', c.membership_type)
          FROM contracts c WHERE c.business_id = b.id AND c.contract_end BETWEEN today - 7 AND today + 90
        UNION ALL
        SELECT jsonb_build_object('date', i.due_date, 'kind', 'invoice due', 'what', coalesce(i.doc_number, i.qbo_invoice_id) || ' £' || i.balance)
          FROM qbo_invoices i JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
          WHERE l.business_id = b.id AND i.balance > 0 AND i.voided_at IS NULL AND coalesce(i.private_memo, '') <> 'Voided'
           AND i.due_date BETWEEN today - 7 AND today + 90
        LIMIT 20) s),

    'club_card', jsonb_build_object(
      'member', (SELECT jsonb_build_object('card_state', m.card_state, 'contract_start', m.contract_start,
                   'contract_end', m.contract_end, 'page', m.page_link, 'page_title', m.page_title,
                   'offer', left(m.offer_text, 400), 'offer_ends', m.offer_ends, 'offer_confirmed_at', m.offer_confirmed_at::date,
                   'page_updated', m.wp_modified::date, 'in_a_to_z', m.in_az_count, 'on_map', m.map_count,
                   'in_latest_offers', m.in_latest_offers, 'categories_on_website', m.categories,
                   'category_differs', m.category_differs, 'contact_mismatch', m.contact_mismatch, 'checks', m.issues)
                 FROM v_club_card_members m WHERE m.business_id = b.id LIMIT 1),
      'pages', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('link', p.link, 'title', p.title,
                   'offer', left(p.offer_text, 300), 'offer_ends', coalesce(p.offer_ends_set, p.offer_ends_on),
                   'updated', p.wp_modified::date, 'gone_at', p.gone_at::date, 'match_status', p.match_status) x
                 FROM club_card_pages p WHERE p.business_id = b.id ORDER BY p.gone_at NULLS FIRST, p.wp_modified DESC LIMIT 5) s)),

    'newsletter', jsonb_build_object(
      'summary', (SELECT jsonb_build_object('last_featured', n.last_in_newsletter, 'last_issue_url', n.last_issue_url,
                    'mentions_total', n.mentions_total, 'mentions_last_12_months', n.mentions_last_12_months)
                  FROM v_business_newsletter n WHERE n.business_id = b.id),
      'recent_mentions', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('sent', i.sent_at::date, 'issue', i.subject,
                    'url', i.browser_url, 'status', m.status, 'context', left(m.context, 300)) x
                  FROM newsletter_mentions m JOIN newsletter_issues i ON i.id = m.issue_id
                  WHERE m.business_id = b.id AND coalesce(m.status, '') <> 'rejected'
                  ORDER BY i.sent_at DESC LIMIT 10) s),
      -- Stage 19: every Freebie the newsletter ran for them (issue date, closing date)
      'freebies', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('issue_date', n.issue_date, 'closes_on', n.closes_on,
                    'headline', n.headline, 'link', n.link_url, 'issue_url', n.issue_url) x
                  FROM v_newsletter_items n
                  WHERE n.business_id = b.id AND n.kind = 'freebie'
                  ORDER BY n.issue_date DESC) s)),

    -- Stage 20: What's On listing requests (forms and listing emails), with Cleo and the website
    'whats_on_listings', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('title', l.title, 'status', l.status,
                    'asked', l.asked_at::date, 'sent_to_cleo', l.sent_to_cleo_at::date, 'cleo_replied', l.cleo_replied_at::date,
                    'cleo_said', left(l.cleo_note, 300), 'on_website', l.website_url, 'website_title', l.website_title,
                    'published', l.website_published_at::date, 'page_removed', l.website_gone_at::date, 'event_date', l.event_starts_at::date, 'when', l.event_when,
                    'requester', l.requester_email) x
                  FROM v_listing_requests l
                  WHERE l.business_id = b.id AND l.status <> 'hidden'
                  ORDER BY l.asked_at DESC NULLS LAST LIMIT 15) s),

    'news_articles', jsonb_build_object(
      'total', (SELECT count(*) FROM business_articles a WHERE a.business_id = b.id AND coalesce(a.status, '') <> 'rejected'),
      'recent', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('date', a.published_date, 'title', a.title,
                   'url', a.url, 'status', a.status) x
                 FROM business_articles a WHERE a.business_id = b.id AND coalesce(a.status, '') <> 'rejected'
                 ORDER BY a.published_date DESC NULLS LAST LIMIT 10) s)),

    'outreach', jsonb_build_object(
      'stage', b.outreach_stage,
      'work_on_next', (SELECT jsonb_build_object('bucket', o.bucket, 'fit_score', o.fit_score, 'days_quiet', o.days_quiet,
                         'last_direction', o.last_direction, 'last_email_on', o.last_email_on, 'draft_ready', o.draft_ready,
                         'snoozed_until', o.snoozed_until)
                       FROM v_outreach_next o WHERE o.business_id = b.id LIMIT 1),
      'routine_drafts', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('created', d.created_at::date, 'routine', d.routine,
                         'kind', d.kind, 'subject', d.subject, 'to', d.recipient, 'outcome', d.outcome, 'reason', left(d.reason, 200),
                         'sent', d.sent_at::date, 'replied', d.replied_at::date) x
                       FROM routine_drafts d WHERE d.business_id = b.id ORDER BY d.created_at DESC LIMIT 10) s),
      'prospect_leads', (SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('found', l.found_at::date, 'source', l.source_name,
                         'url', l.source_url, 'match_type', l.match_type, 'status', l.status,
                         'notes', left(l.opportunity_notes, 300)) x
                       FROM prospect_leads l WHERE l.matched_business_id = b.id ORDER BY l.found_at DESC LIMIT 5) s)),

    'data_health', (SELECT jsonb_agg(jsonb_build_object('check', h.check_key, 'detail', h.detail, 'date', h.ref_date))
                    FROM v_data_health h WHERE h.business_id = b.id)
  );
  RETURN jsonb_strip_nulls(doc);
END $function$;

CREATE OR REPLACE FUNCTION public.search_everything(p_text text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH q AS (SELECT websearch_to_tsquery('english', coalesce(p_text, '')) AS tsq),
  hits AS (
    SELECT CASE WHEN c.type::text = 'Note' THEN 'note' ELSE lower(c.type::text) END AS kind, c.id::text AS ref,
           c.business_id, c.entry_date::date AS d, c.direction, c.contact_id, c.subject AS title,
           coalesce(c.formatted_text_current, c.formatted_text_original, c.raw_text_original, '') AS body
    FROM correspondence c, q WHERE c.search_vector @@ q.tsq
    UNION ALL
    SELECT 'business_note', b.id::text, b.id, b.updated_at::date, NULL, NULL, b.name, b.notes
    FROM businesses b, q WHERE b.merged_into IS NULL AND coalesce(b.notes, '') <> ''
      AND to_tsvector('english', b.notes) @@ q.tsq
    UNION ALL
    SELECT 'contact_note', k.id::text, k.business_id, k.updated_at::date, NULL, k.id, k.name, k.notes
    FROM contacts k, q WHERE coalesce(k.notes, '') <> '' AND to_tsvector('english', k.notes) @@ q.tsq
    UNION ALL
    SELECT 'todo', t.id::text, t.business_id, coalesce(t.due_date, t.created_at::date), t.status, NULL, t.title, coalesce(t.notes, '')
    FROM tasks t, q WHERE to_tsvector('english', t.title || ' ' || coalesce(t.notes, '')) @@ q.tsq
    UNION ALL
    SELECT 'newsletter_item', n.id::text, n.business_id, i.sent_at::date, NULL, NULL, n.headline, coalesce(n.blurb, '')
    FROM newsletter_items n JOIN newsletter_issues i ON i.id = n.issue_id, q
    WHERE to_tsvector('english', coalesce(n.headline, '') || ' ' || coalesce(n.blurb, '')) @@ q.tsq
    UNION ALL
    SELECT 'routine_draft', r.id::text, r.business_id, r.created_at::date, r.outcome, NULL, r.subject, coalesce(r.reason, '')
    FROM routine_drafts r, q WHERE to_tsvector('english', coalesce(r.subject, '') || ' ' || coalesce(r.reason, '')) @@ q.tsq
  ),
  inrange AS (
    SELECT * FROM hits WHERE (p_from IS NULL OR d >= p_from) AND (p_to IS NULL OR d <= p_to)
  ),
  top AS (
    SELECT * FROM inrange ORDER BY d DESC NULLS LAST LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
  )
  SELECT jsonb_build_object(
    'query', p_text, 'from', p_from, 'to', p_to,
    'total', (SELECT count(*) FROM inrange),
    'by_kind', (SELECT jsonb_object_agg(kind, n) FROM (SELECT kind, count(*) n FROM inrange GROUP BY kind) k),
    'businesses_matched', (SELECT count(DISTINCT business_id) FROM inrange),
    'note', 'Not searched (not in the database yet): Freebie and Eventbrite entries, sent email nobody BCCd, Drive documents, ad stats, full QuickBooks history.',
    'results', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'kind', t.kind, 'id', t.ref, 'date', t.d, 'business', b.name, 'business_id', t.business_id,
        'direction_or_status', t.direction, 'contact', k.name, 'title', t.title,
        'snippet', ts_headline('english', left(t.body, 20000), q.tsq,
                     'MaxWords=40, MinWords=15, MaxFragments=2, FragmentDelimiter=" ... ", StartSel=**, StopSel=**')))
        ORDER BY t.d DESC NULLS LAST)
      FROM top t CROSS JOIN q
      LEFT JOIN businesses b ON b.id = t.business_id
      LEFT JOIN contacts k ON k.id = t.contact_id), '[]'::jsonb));
$function$;

DROP VIEW IF EXISTS public.v_qbo_customers_to_match;
DROP TABLE IF EXISTS public.contract_invoices;
