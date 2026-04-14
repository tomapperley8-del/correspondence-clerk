-- promote_open_threads_to_actions
-- Pure SQL promotion of unflagged correspondence entries → action flags.
-- Called at filing time, scoped to one business/org.
--
-- Receives keyword arrays as parameters (single source of truth stays in JS).
-- Runs 4 signals sequentially — once a row is promoted by an earlier signal
-- the later signals skip it (action_needed != 'none' fails the WHERE).
--
-- Signals:
--   1. Sent invoice keywords + no payment confirmation received since (14–180d) → waiting_on_them
--   2. Received commitment keywords + no sent reply since (7–60d)             → waiting_on_them
--   3. Meeting/Call with financial or commitment keywords + no follow-up (3–90d) → invoice
--   4. Received interest/enquiry + no reply sent (7–60d)                        → prospect
--
-- NOT EXISTS subqueries have no date cap — they check the full correspondence
-- history, not just the 180-day window. This makes resolution detection more
-- accurate than the equivalent JS fetch-then-filter approach.

CREATE OR REPLACE FUNCTION promote_open_threads_to_actions(
  p_org_id        UUID,
  p_business_id   UUID,
  p_tier1_financial     TEXT[],
  p_payment_resolution  TEXT[],
  p_tier2_commitments   TEXT[],
  p_tier2_interest      TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total  INTEGER := 0;
  v_n      INTEGER := 0;
  v_due_at DATE    := CURRENT_DATE + INTERVAL '7 days';
BEGIN

  -- ── Signal 1 ────────────────────────────────────────────────────────────────
  -- Tom sent an invoice or payment chase.
  -- No payment confirmation received from them at any point since.
  -- Window: 14 days (give them time to pay) → 180 days.
  UPDATE correspondence c
  SET    action_needed = 'waiting_on_them',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id  = p_org_id
    AND  c.business_id       = p_business_id
    AND  c.action_needed     = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.direction         = 'sent'
    AND  c.entry_date        >= NOW() - INTERVAL '180 days'
    AND  c.entry_date        <= NOW() - INTERVAL '14 days'
    AND  EXISTS (
           SELECT 1
           FROM   unnest(p_tier1_financial) AS kw
           WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
         )
    AND  NOT EXISTS (
           SELECT 1
           FROM   correspondence c2
           WHERE  c2.organization_id = p_org_id
             AND  c2.business_id     = p_business_id
             AND  c2.direction       = 'received'
             AND  c2.entry_date      > c.entry_date
             AND  EXISTS (
                    SELECT 1
                    FROM   unnest(p_payment_resolution) AS kw
                    WHERE  LOWER(c2.formatted_text_current) LIKE '%' || kw || '%'
                  )
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- ── Signal 2 ────────────────────────────────────────────────────────────────
  -- They committed to follow up / get back to us.
  -- Tom hasn't sent anything to them since.
  -- Window: 7 days (give them time) → 60 days.
  UPDATE correspondence c
  SET    action_needed = 'waiting_on_them',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id  = p_org_id
    AND  c.business_id       = p_business_id
    AND  c.action_needed     = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.direction         = 'received'
    AND  c.entry_date        >= NOW() - INTERVAL '60 days'
    AND  c.entry_date        <= NOW() - INTERVAL '7 days'
    AND  EXISTS (
           SELECT 1
           FROM   unnest(p_tier2_commitments) AS kw
           WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
         )
    AND  NOT EXISTS (
           SELECT 1
           FROM   correspondence c2
           WHERE  c2.organization_id = p_org_id
             AND  c2.business_id     = p_business_id
             AND  c2.direction       = 'sent'
             AND  c2.entry_date      > c.entry_date
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- ── Signal 3 ────────────────────────────────────────────────────────────────
  -- Meeting or Call note contains financial/commitment language.
  -- No sent email, meeting, or call has followed up since.
  -- Window: 3 days (allow same-day filing) → 90 days.
  UPDATE correspondence c
  SET    action_needed = 'invoice',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id  = p_org_id
    AND  c.business_id       = p_business_id
    AND  c.action_needed     = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.type              IN ('Meeting', 'Call')
    AND  c.entry_date        >= NOW() - INTERVAL '90 days'
    AND  c.entry_date        <= NOW() - INTERVAL '3 days'
    AND  (
           EXISTS (
             SELECT 1
             FROM   unnest(p_tier1_financial) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
           OR EXISTS (
             SELECT 1
             FROM   unnest(p_tier2_commitments) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
         )
    AND  NOT EXISTS (
           SELECT 1
           FROM   correspondence c2
           WHERE  c2.organization_id = p_org_id
             AND  c2.business_id     = p_business_id
             AND  c2.entry_date      > c.entry_date
             AND  (c2.direction = 'sent' OR c2.type IN ('Meeting', 'Call'))
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- ── Signal 4 ────────────────────────────────────────────────────────────────
  -- Inbound interest or enquiry received.
  -- Tom hasn't replied to them since.
  -- Window: 7 days → 60 days.
  UPDATE correspondence c
  SET    action_needed = 'prospect',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id  = p_org_id
    AND  c.business_id       = p_business_id
    AND  c.action_needed     = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.direction         = 'received'
    AND  c.entry_date        >= NOW() - INTERVAL '60 days'
    AND  c.entry_date        <= NOW() - INTERVAL '7 days'
    AND  EXISTS (
           SELECT 1
           FROM   unnest(p_tier2_interest) AS kw
           WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
         )
    AND  NOT EXISTS (
           SELECT 1
           FROM   correspondence c2
           WHERE  c2.organization_id = p_org_id
             AND  c2.business_id     = p_business_id
             AND  c2.direction       = 'sent'
             AND  c2.entry_date      > c.entry_date
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$$;
