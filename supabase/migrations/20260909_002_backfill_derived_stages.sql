-- 20260909_002_backfill_derived_stages.sql
--
-- One-off backfill of outreach_stage / renewal_stage and their paired date
-- columns from derive_business_stages(). Applied 2026-09-09: 61 businesses
-- changed, all backed up first.
--
-- Written as a single statement so the backup CTE and the UPDATE both see the
-- same snapshot: a data-modifying CTE always runs, and the UPDATE cannot see
-- the rows the CTE inserted.
--
-- The write policy is deliberately conservative:
--   * A NULL stage back from the function means "leave this business alone"
--     (not on the board, muted, declined, Former/Inactive/Closed, graduated to
--     renewal, a manual-only stage, or the derivation would have dragged the
--     card backwards). coalesce() therefore preserves the stored value.
--   * Date columns for stages the business is not currently in are preserved,
--     so the pipeline history on each card survives.
--   * Rows are only touched when something actually differs, which makes the
--     migration idempotent and stops updated_at churning on a re-run.
--     Verified: a second run backed up 0 rows and updated 0 rows.

WITH targets AS (
  SELECT
    b.id,
    d.outreach_stage, d.outreach_identified_at, d.outreach_contacted_at,
    d.outreach_followed_up_at, d.outreach_in_discussion_at, d.outreach_invoice_paid_at,
    d.renewal_stage, d.renewal_not_started_at, d.renewal_contacted_at, d.renewal_in_discussion_at
  FROM businesses b
  CROSS JOIN LATERAL derive_business_stages(b.id) d
  WHERE
       (d.outreach_stage            IS NOT NULL AND d.outreach_stage            IS DISTINCT FROM b.outreach_stage)
    OR (d.outreach_identified_at    IS NOT NULL AND d.outreach_identified_at    IS DISTINCT FROM b.outreach_identified_at)
    OR (d.outreach_contacted_at     IS NOT NULL AND d.outreach_contacted_at     IS DISTINCT FROM b.outreach_contacted_at)
    OR (d.outreach_followed_up_at   IS NOT NULL AND d.outreach_followed_up_at   IS DISTINCT FROM b.outreach_followed_up_at)
    OR (d.outreach_in_discussion_at IS NOT NULL AND d.outreach_in_discussion_at IS DISTINCT FROM b.outreach_in_discussion_at)
    OR (d.outreach_invoice_paid_at  IS NOT NULL AND d.outreach_invoice_paid_at  IS DISTINCT FROM b.outreach_invoice_paid_at)
    OR (d.renewal_stage             IS NOT NULL AND d.renewal_stage             IS DISTINCT FROM b.renewal_stage)
    OR (d.renewal_not_started_at    IS NOT NULL AND d.renewal_not_started_at    IS DISTINCT FROM b.renewal_not_started_at)
    OR (d.renewal_contacted_at      IS NOT NULL AND d.renewal_contacted_at      IS DISTINCT FROM b.renewal_contacted_at)
    OR (d.renewal_in_discussion_at  IS NOT NULL AND d.renewal_in_discussion_at  IS DISTINCT FROM b.renewal_in_discussion_at)
),
backup AS (
  INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason, taken_at)
  SELECT 'businesses', b.id, to_jsonb(b), 'kanban_derivation_backfill', now()
  FROM businesses b
  JOIN targets t ON t.id = b.id
  RETURNING row_id
)
UPDATE businesses b
SET
  outreach_stage            = coalesce(t.outreach_stage,            b.outreach_stage),
  outreach_identified_at    = coalesce(t.outreach_identified_at,    b.outreach_identified_at),
  outreach_contacted_at     = coalesce(t.outreach_contacted_at,     b.outreach_contacted_at),
  outreach_followed_up_at   = coalesce(t.outreach_followed_up_at,   b.outreach_followed_up_at),
  outreach_in_discussion_at = coalesce(t.outreach_in_discussion_at, b.outreach_in_discussion_at),
  outreach_invoice_paid_at  = coalesce(t.outreach_invoice_paid_at,  b.outreach_invoice_paid_at),
  renewal_stage             = coalesce(t.renewal_stage,             b.renewal_stage),
  renewal_not_started_at    = coalesce(t.renewal_not_started_at,    b.renewal_not_started_at),
  renewal_contacted_at      = coalesce(t.renewal_contacted_at,      b.renewal_contacted_at),
  renewal_in_discussion_at  = coalesce(t.renewal_in_discussion_at,  b.renewal_in_discussion_at)
FROM targets t
WHERE b.id = t.id;

-- To reverse:
--   UPDATE businesses b SET
--     outreach_stage            = (k.before_row->>'outreach_stage'),
--     outreach_identified_at    = (k.before_row->>'outreach_identified_at')::date,
--     outreach_contacted_at     = (k.before_row->>'outreach_contacted_at')::date,
--     outreach_followed_up_at   = (k.before_row->>'outreach_followed_up_at')::date,
--     outreach_in_discussion_at = (k.before_row->>'outreach_in_discussion_at')::date,
--     outreach_invoice_paid_at  = (k.before_row->>'outreach_invoice_paid_at')::date,
--     renewal_stage             = (k.before_row->>'renewal_stage'),
--     renewal_not_started_at    = (k.before_row->>'renewal_not_started_at')::date,
--     renewal_contacted_at      = (k.before_row->>'renewal_contacted_at')::date,
--     renewal_in_discussion_at  = (k.before_row->>'renewal_in_discussion_at')::date
--   FROM cc_phase0_backup k
--   WHERE k.table_name = 'businesses'
--     AND k.reason = 'kanban_derivation_backfill'
--     AND b.id = k.row_id;
