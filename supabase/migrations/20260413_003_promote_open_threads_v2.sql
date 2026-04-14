-- promote_open_threads_to_actions v2
-- Drops the 6-parameter version (v1) and replaces with 8-parameter version
-- that additionally accepts commitment and interest regex pattern arrays.
--
-- Keyword arrays are passed from JS (lib/ai/keyword-detection.ts) so that
-- file remains the single source of truth — no keyword lists are hardcoded here.
-- Regex patterns use PostgreSQL POSIX extended syntax (~* operator).
--
-- Signal execution order matters: each UPDATE filters action_needed = 'none',
-- so once Signal 1 promotes a row to 'waiting_on_them', Signals 2–4 cannot
-- match it. Earlier signals take precedence.

-- Drop v1 (6-param) if it exists
DROP FUNCTION IF EXISTS promote_open_threads_to_actions(UUID, UUID, TEXT[], TEXT[], TEXT[], TEXT[]);

CREATE OR REPLACE FUNCTION promote_open_threads_to_actions(
  p_org_id              UUID,
  p_business_id         UUID,
  p_tier1_financial     TEXT[],
  p_payment_resolution  TEXT[],
  p_tier2_commitments   TEXT[],
  p_tier2_interest      TEXT[],
  p_commitment_patterns TEXT[],   -- PostgreSQL POSIX regex for commitment detection
  p_interest_patterns   TEXT[]    -- PostgreSQL POSIX regex for interest detection
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
  -- Tom sent an invoice or payment chase. No payment confirmation received since.
  -- Window: 14 days (give them time to pay) → 180 days (still relevant).
  -- Uses keyword arrays only — financial terms are precise, regex not needed.
  UPDATE correspondence c
  SET    action_needed = 'waiting_on_them',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id   = p_org_id
    AND  c.business_id        = p_business_id
    AND  c.action_needed      = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.direction          = 'sent'
    AND  c.entry_date         >= NOW() - INTERVAL '180 days'
    AND  c.entry_date         <= NOW() - INTERVAL '14 days'
    AND  EXISTS (
           SELECT 1 FROM unnest(p_tier1_financial) AS kw
           WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
         )
    AND  NOT EXISTS (
           -- Check ALL received entries for this business ever, no date cap.
           -- This is more accurate than JS which only checked the filtered window.
           SELECT 1 FROM correspondence c2
           WHERE  c2.organization_id = p_org_id
             AND  c2.business_id     = p_business_id
             AND  c2.direction       = 'received'
             AND  c2.entry_date      > c.entry_date
             AND  EXISTS (
                    SELECT 1 FROM unnest(p_payment_resolution) AS kw
                    WHERE  LOWER(c2.formatted_text_current) LIKE '%' || kw || '%'
                  )
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- ── Signal 2 ────────────────────────────────────────────────────────────────
  -- They committed to follow up but Tom hasn't heard back. No sent reply since.
  -- Window: 7 days (give them time) → 60 days (still actionable).
  -- Uses both keyword array AND regex patterns for maximum coverage.
  UPDATE correspondence c
  SET    action_needed = 'waiting_on_them',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id   = p_org_id
    AND  c.business_id        = p_business_id
    AND  c.action_needed      = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.direction          = 'received'
    AND  c.entry_date         >= NOW() - INTERVAL '60 days'
    AND  c.entry_date         <= NOW() - INTERVAL '7 days'
    AND  (
           -- Layer 1: explicit keyword match
           EXISTS (
             SELECT 1 FROM unnest(p_tier2_commitments) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
           OR
           -- Layer 2: regex pattern match (catches conjugated / grammatical forms)
           EXISTS (
             SELECT 1 FROM unnest(p_commitment_patterns) AS pat
             WHERE  c.formatted_text_current ~* pat
           )
         )
    AND  NOT EXISTS (
           SELECT 1 FROM correspondence c2
           WHERE  c2.organization_id = p_org_id
             AND  c2.business_id     = p_business_id
             AND  c2.direction       = 'sent'
             AND  c2.entry_date      > c.entry_date
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- ── Signal 3 ────────────────────────────────────────────────────────────────
  -- Meeting or Call note with financial or commitment language.
  -- No sent email, meeting, or call has followed up since.
  -- Window: 3 days (allow same-day notes) → 90 days.
  -- Keywords only (financial terms + commitment phrases are precise enough).
  UPDATE correspondence c
  SET    action_needed = 'invoice',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id   = p_org_id
    AND  c.business_id        = p_business_id
    AND  c.action_needed      = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.type               IN ('Meeting', 'Call')
    AND  c.entry_date         >= NOW() - INTERVAL '90 days'
    AND  c.entry_date         <= NOW() - INTERVAL '3 days'
    AND  (
           EXISTS (
             SELECT 1 FROM unnest(p_tier1_financial) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
           OR EXISTS (
             SELECT 1 FROM unnest(p_tier2_commitments) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
         )
    AND  NOT EXISTS (
           SELECT 1 FROM correspondence c2
           WHERE  c2.organization_id = p_org_id
             AND  c2.business_id     = p_business_id
             AND  c2.entry_date      > c.entry_date
             AND  (c2.direction = 'sent' OR c2.type IN ('Meeting', 'Call'))
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- ── Signal 4 ────────────────────────────────────────────────────────────────
  -- Inbound interest or enquiry received. Tom hasn't replied.
  -- Window: 7 days → 60 days.
  -- Uses both keyword array AND regex patterns for maximum coverage.
  UPDATE correspondence c
  SET    action_needed = 'prospect',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id   = p_org_id
    AND  c.business_id        = p_business_id
    AND  c.action_needed      = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.direction          = 'received'
    AND  c.entry_date         >= NOW() - INTERVAL '60 days'
    AND  c.entry_date         <= NOW() - INTERVAL '7 days'
    AND  (
           -- Layer 1: explicit keyword match
           EXISTS (
             SELECT 1 FROM unnest(p_tier2_interest) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
           OR
           -- Layer 2: regex pattern match
           EXISTS (
             SELECT 1 FROM unnest(p_interest_patterns) AS pat
             WHERE  c.formatted_text_current ~* pat
           )
         )
    AND  NOT EXISTS (
           SELECT 1 FROM correspondence c2
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
