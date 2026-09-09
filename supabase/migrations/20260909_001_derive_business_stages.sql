-- 20260909_001_derive_business_stages.sql
--
-- Pure, side-effect-free derivation of the outreach and renewal kanban stages
-- from the correspondence log, contracts and QuickBooks invoices.
--
-- Nothing in this migration writes to `businesses`. The function is consumed by
-- the backfill (20260909_002) and by the correspondence trigger (20260909_003).
--
-- Board membership rules (taken from the app, not invented here):
--   * Outreach board  = `outreach_stage IS NOT NULL`
--     (app/actions/businesses.ts getOutreachBusinesses filters
--      `.not('outreach_stage','is',null)`; removeBusinessFromOutreach sets it
--      back to NULL). NULL therefore means "deliberately not on the board" and
--      this function never promotes NULL into a stage.
--   * Renewal board   = `is_club_card OR is_advertiser`
--     (getContractBusinesses filters `.or('is_club_card.eq.true,is_advertiser.eq.true')`).
--
-- Graduation rule: a business that has ever held a contract is renewal-side and
-- is excluded from outreach derivation. This mirrors the app's own
-- promoteOutreachToContracts(), which nulls the whole outreach block and sets
-- renewal_stage = 'not_started'.
--
-- Never derived (manual only): 'won', 'not_interested', 'not_renewing',
-- 'agreed', 'invoice_paid' (renewal side), 'in_progress' (legacy value),
-- and both *_declined_at columns.

CREATE OR REPLACE FUNCTION public.derive_business_stages(p_business_id uuid)
RETURNS TABLE (
  outreach_stage            text,
  outreach_identified_at    date,
  outreach_contacted_at     date,
  outreach_followed_up_at   date,
  outreach_in_discussion_at date,
  outreach_invoice_paid_at  date,
  renewal_stage             text,
  renewal_not_started_at    date,
  renewal_contacted_at      date,
  renewal_in_discussion_at  date,
  outreach_skip_reason      text,
  renewal_skip_reason       text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH b AS (
  SELECT *
  FROM businesses
  WHERE id = p_business_id
),
-- Qualifying contact with the business. Notes are internal memos, not contact,
-- and Drafts have not been sent, so both are excluded. linked_business_ids is
-- honoured so a shared thread counts for every business it touches.
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
-- Direction-unknown rows are ignored entirely rather than guessed at. They are
-- 49 backfilled team-authored log entries; counting them as inbound would
-- promote cold prospects on the strength of our own notes.
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
    -- The renewal board shows the earliest-ending current contract, matching
    -- getContractBusinesses() in app/actions/businesses.ts.
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
-- Renewal only counts correspondence inside the renewal window, so an old
-- thread cannot make a fresh renewal look as though it is already in progress.
renewal_window AS (
  SELECT
    count(*) FILTER (WHERE c.dir = 'in')               AS n_in,
    count(*) FILTER (WHERE c.dir = 'out')              AS n_out,
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
    rw.n_in      AS r_in,
    rw.n_out     AS r_out,
    rw.first_in  AS r_first_in,
    rw.first_out AS r_first_out,

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
      WHEN b.renewal_stage IN
           ('not_renewing', 'agreed', 'invoice_paid', 'in_progress')
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
      WHEN raw.o_skip IS NOT NULL           THEN NULL
      WHEN raw.last_paid_date IS NOT NULL   THEN 'invoice_paid'
      -- A reply outranks repeated chasing: in_discussion beats followed_up.
      WHEN raw.n_in >= 1                    THEN 'in_discussion'
      WHEN raw.n_out >= 2                   THEN 'followed_up'
      WHEN raw.n_out >= 1                   THEN 'contacted'
      WHEN raw.n_total = 0                  THEN 'identified'
      ELSE NULL
    END AS o_candidate,
    CASE
      WHEN raw.r_skip IS NOT NULL           THEN NULL
      WHEN raw.r_in >= 1                    THEN 'in_discussion'
      WHEN raw.r_out >= 1                   THEN 'contacted'
      ELSE 'not_started'
    END AS r_candidate
  FROM raw
),
-- A derived stage never drags a card backwards. Where the human has put a
-- business further along than the log supports, the human wins.
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
    (ranked.o_candidate IS NOT NULL
     AND ranked.o_cur_rank IS NOT NULL
     AND ranked.o_new_rank < ranked.o_cur_rank) AS o_would_regress,
    (ranked.r_candidate IS NOT NULL
     AND ranked.r_cur_rank IS NOT NULL
     AND ranked.r_new_rank < ranked.r_cur_rank) AS r_would_regress,
    (ranked.o_candidate IS DISTINCT FROM ranked.outreach_stage) AS o_stage_moving,
    (ranked.r_candidate IS DISTINCT FROM ranked.renewal_stage)  AS r_stage_moving
  FROM ranked
)
SELECT
  CASE WHEN f.o_would_regress THEN NULL ELSE f.o_candidate END AS outreach_stage,

  -- Dates are only (re)stamped when the card actually moves, or when the slot
  -- is empty. Re-dating a card that is already in the right stage would jog the
  -- "days in stage" badge backwards for no visible gain.
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'identified' THEN NULL
       ELSE coalesce(f.outreach_identified_at, f.created_at::date) END       AS outreach_identified_at,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'contacted' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_contacted_at IS NOT NULL THEN NULL
       ELSE f.first_out END                                                  AS outreach_contacted_at,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'followed_up' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_followed_up_at IS NOT NULL THEN NULL
       ELSE f.last_out END                                                   AS outreach_followed_up_at,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'in_discussion' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_in_discussion_at IS NOT NULL THEN NULL
       ELSE f.first_in END                                                   AS outreach_in_discussion_at,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'invoice_paid' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_invoice_paid_at IS NOT NULL THEN NULL
       ELSE f.last_paid_date END                                             AS outreach_invoice_paid_at,

  CASE WHEN f.r_would_regress THEN NULL ELSE f.r_candidate END AS renewal_stage,

  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'not_started' THEN NULL
       ELSE coalesce(f.renewal_not_started_at, f.created_at::date) END       AS renewal_not_started_at,
  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'contacted' THEN NULL
       WHEN NOT f.r_stage_moving AND f.renewal_contacted_at IS NOT NULL THEN NULL
       ELSE f.r_first_out END                                                AS renewal_contacted_at,
  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'in_discussion' THEN NULL
       WHEN NOT f.r_stage_moving AND f.renewal_in_discussion_at IS NOT NULL THEN NULL
       ELSE f.r_first_in END                                                 AS renewal_in_discussion_at,

  coalesce(f.o_skip, CASE WHEN f.o_would_regress THEN 'would_regress' END) AS outreach_skip_reason,
  coalesce(f.r_skip, CASE WHEN f.r_would_regress THEN 'would_regress' END) AS renewal_skip_reason
FROM final f;
$$;

COMMENT ON FUNCTION public.derive_business_stages(uuid) IS
  'Pure derivation of outreach/renewal kanban stages from correspondence, contracts and QBO invoices. No side effects. A NULL returned stage means "leave the stored value alone"; the accompanying skip_reason says why.';

GRANT EXECUTE ON FUNCTION public.derive_business_stages(uuid) TO authenticated, service_role;
