-- get_open_threads
--
-- Read-only companion to promote_open_threads_to_actions.
-- Returns qualifying open-thread entries for display on business pages and
-- the Insights page, without modifying any rows.
--
-- Same 4 signals, same time windows, same guards as the promotion function.
-- Keyword arrays are passed from JS (keyword-detection.ts) — no hardcoding here.
--
-- Differences from the promotion function:
--   • RETURNS TABLE instead of updating rows
--   • Accepts optional p_business_id (NULL = all businesses in org)
--   • No per-business deduplication — shows ALL qualifying entries so the
--     business page can surface multiple open items in the same relationship
--   • Returns snippet: first 300 chars of formatted text (JS trims to display length)

CREATE OR REPLACE FUNCTION get_open_threads(
  p_org_id              UUID,
  p_business_id         UUID,        -- pass NULL to scan all businesses in org
  p_tier1_financial     TEXT[],
  p_payment_resolution  TEXT[],
  p_tier2_commitments   TEXT[],
  p_tier2_interest      TEXT[],
  p_commitment_patterns TEXT[],
  p_interest_patterns   TEXT[]
)
RETURNS TABLE (
  entry_id      UUID,
  business_id   UUID,
  business_name TEXT,
  entry_date    TIMESTAMPTZ,
  subject       TEXT,
  days_since    INTEGER,
  snippet       TEXT,
  thread_type   TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN

  -- ── Signal 1 ────────────────────────────────────────────────────────────────
  -- Sent invoice/payment terms, no payment confirmation received since (14–180d).
  RETURN QUERY
  SELECT
    c.id,
    c.business_id,
    b.name::TEXT,
    c.entry_date,
    c.subject,
    EXTRACT(DAY FROM (NOW() - c.entry_date))::INTEGER,
    LEFT(COALESCE(c.formatted_text_current, c.raw_text_original, ''), 300),
    'sent_invoice'::TEXT
  FROM correspondence c
  JOIN businesses b ON b.id = c.business_id
  WHERE c.organization_id = p_org_id
    AND (p_business_id IS NULL OR c.business_id = p_business_id)
    AND c.action_needed      = 'none'
    AND c.reply_dismissed_at IS NULL
    AND c.direction          = 'sent'
    AND c.entry_date         >= NOW() - INTERVAL '180 days'
    AND c.entry_date         <= NOW() - INTERVAL '14 days'
    AND (
      EXISTS (
        SELECT 1 FROM unnest(p_tier1_financial) AS kw
        WHERE LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
      )
      OR EXISTS (
        SELECT 1 FROM unnest(p_tier1_financial) AS kw
        WHERE LOWER(c.subject) LIKE '%' || kw || '%'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM correspondence c2
      WHERE c2.organization_id = p_org_id
        AND c2.business_id     = c.business_id
        AND c2.direction       = 'received'
        AND c2.entry_date      > c.entry_date
        AND EXISTS (
          SELECT 1 FROM unnest(p_payment_resolution) AS kw
          WHERE LOWER(c2.formatted_text_current) LIKE '%' || kw || '%'
        )
    );

  -- ── Signal 2 ────────────────────────────────────────────────────────────────
  -- They committed to follow up, no sent reply from Tom since (7–60d).
  -- Auto-reply / OOO guard applied.
  RETURN QUERY
  SELECT
    c.id,
    c.business_id,
    b.name::TEXT,
    c.entry_date,
    c.subject,
    EXTRACT(DAY FROM (NOW() - c.entry_date))::INTEGER,
    LEFT(COALESCE(c.formatted_text_current, c.raw_text_original, ''), 300),
    'received_commitment'::TEXT
  FROM correspondence c
  JOIN businesses b ON b.id = c.business_id
  WHERE c.organization_id = p_org_id
    AND (p_business_id IS NULL OR c.business_id = p_business_id)
    AND c.action_needed      = 'none'
    AND c.reply_dismissed_at IS NULL
    AND c.direction          = 'received'
    AND c.entry_date         >= NOW() - INTERVAL '60 days'
    AND c.entry_date         <= NOW() - INTERVAL '7 days'
    AND LOWER(c.formatted_text_current) NOT LIKE '%out of office%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%automatic reply%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%auto-reply%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%automated response%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%this is an automated%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%do not reply to this%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%noreply%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%no-reply%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%delivery failure%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%mail delivery%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%undeliverable%'
    AND (
      EXISTS (
        SELECT 1 FROM unnest(p_tier2_commitments) AS kw
        WHERE LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
      )
      OR EXISTS (
        SELECT 1 FROM unnest(p_commitment_patterns) AS pat
        WHERE c.formatted_text_current ~* pat
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM correspondence c2
      WHERE c2.organization_id = p_org_id
        AND c2.business_id     = c.business_id
        AND c2.direction       = 'sent'
        AND c2.entry_date      > c.entry_date
    );

  -- ── Signal 3 ────────────────────────────────────────────────────────────────
  -- Meeting or Call with financial/commitment language, no follow-up since (3–90d).
  RETURN QUERY
  SELECT
    c.id,
    c.business_id,
    b.name::TEXT,
    c.entry_date,
    c.subject,
    EXTRACT(DAY FROM (NOW() - c.entry_date))::INTEGER,
    LEFT(COALESCE(c.formatted_text_current, c.raw_text_original, ''), 300),
    'meeting_call_followup'::TEXT
  FROM correspondence c
  JOIN businesses b ON b.id = c.business_id
  WHERE c.organization_id = p_org_id
    AND (p_business_id IS NULL OR c.business_id = p_business_id)
    AND c.action_needed      = 'none'
    AND c.reply_dismissed_at IS NULL
    AND c.type               IN ('Meeting', 'Call')
    AND c.entry_date         >= NOW() - INTERVAL '90 days'
    AND c.entry_date         <= NOW() - INTERVAL '3 days'
    AND (
      EXISTS (
        SELECT 1 FROM unnest(p_tier1_financial) AS kw
        WHERE LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
      )
      OR EXISTS (
        SELECT 1 FROM unnest(p_tier2_commitments) AS kw
        WHERE LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM correspondence c2
      WHERE c2.organization_id = p_org_id
        AND c2.business_id     = c.business_id
        AND c2.entry_date      > c.entry_date
        AND (c2.direction = 'sent' OR c2.type IN ('Meeting', 'Call'))
    );

  -- ── Signal 4 ────────────────────────────────────────────────────────────────
  -- Inbound interest/enquiry, no reply sent (7–60d).
  -- Auto-reply guard applied. Minimum 150 chars.
  RETURN QUERY
  SELECT
    c.id,
    c.business_id,
    b.name::TEXT,
    c.entry_date,
    c.subject,
    EXTRACT(DAY FROM (NOW() - c.entry_date))::INTEGER,
    LEFT(COALESCE(c.formatted_text_current, c.raw_text_original, ''), 300),
    'interest_signal'::TEXT
  FROM correspondence c
  JOIN businesses b ON b.id = c.business_id
  WHERE c.organization_id = p_org_id
    AND (p_business_id IS NULL OR c.business_id = p_business_id)
    AND c.action_needed      = 'none'
    AND c.reply_dismissed_at IS NULL
    AND c.direction          = 'received'
    AND c.entry_date         >= NOW() - INTERVAL '60 days'
    AND c.entry_date         <= NOW() - INTERVAL '7 days'
    AND LENGTH(c.formatted_text_current) > 150
    AND LOWER(c.formatted_text_current) NOT LIKE '%out of office%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%automatic reply%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%auto-reply%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%automated response%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%this is an automated%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%do not reply to this%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%noreply%'
    AND LOWER(c.formatted_text_current) NOT LIKE '%no-reply%'
    AND (
      EXISTS (
        SELECT 1 FROM unnest(p_tier2_interest) AS kw
        WHERE LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
      )
      OR EXISTS (
        SELECT 1 FROM unnest(p_interest_patterns) AS pat
        WHERE c.formatted_text_current ~* pat
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM correspondence c2
      WHERE c2.organization_id = p_org_id
        AND c2.business_id     = c.business_id
        AND c2.direction       = 'sent'
        AND c2.entry_date      > c.entry_date
    );

END;
$$;
