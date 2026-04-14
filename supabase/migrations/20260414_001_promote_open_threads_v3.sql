-- promote_open_threads_to_actions v3
-- Drops v2 (8-param) and replaces with improved version that adds:
--
-- 1. Auto-reply / OOO guard (Signals 2, 4)
--    Received entries that are auto-replies, out-of-office notices, or automated
--    notifications are excluded from commitment and interest signals. At scale,
--    these would otherwise cause false-positive promotions.
--
-- 2. Per-signal deduplication (all signals)
--    Only the MOST RECENT qualifying entry per business per signal is promoted.
--    Prevents 3 "I'll get back to you" emails in one thread all becoming separate
--    action items on the Actions page.
--    Uses a lateral join approach: for each signal, a subquery finds the latest
--    qualifying entry_date, and the UPDATE filters to only that row.
--
-- 3. Subject-line augmentation for Signal 1
--    Invoices sent as attachments with generic bodies ("please find attached")
--    now also match via subject line, catching attachment-only invoice emails.
--
-- 4. Snoozed-entry protection (all signals)
--    Entries with due_at IS NOT NULL are user-set reminders — they must not be
--    overwritten by the promotion function. Added AND c.due_at IS NULL to all signals.
--
-- 5. Signal 4 minimum length guard
--    Short "yes, interested" replies could falsely fire the interest signal.
--    Minimum 150 characters required for Signal 4 to reduce noise.
--
-- Keyword arrays are still passed as parameters from JS (keyword-detection.ts),
-- which remains the single source of truth. No keyword lists are hardcoded here.

DROP FUNCTION IF EXISTS promote_open_threads_to_actions(UUID, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[]);

CREATE OR REPLACE FUNCTION promote_open_threads_to_actions(
  p_org_id              UUID,
  p_business_id         UUID,
  p_tier1_financial     TEXT[],
  p_payment_resolution  TEXT[],
  p_tier2_commitments   TEXT[],
  p_tier2_interest      TEXT[],
  p_commitment_patterns TEXT[],
  p_interest_patterns   TEXT[]
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
  -- Sent invoice or payment chase. No payment confirmation received since.
  -- Window: 14 days → 180 days.
  -- Deduplication: only the most recent qualifying sent entry per business.
  -- Subject augmentation: also matches invoice/payment keywords in subject line.
  -- Snoozed protection: skips entries with user-set due_at.
  UPDATE correspondence c
  SET    action_needed = 'waiting_on_them',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id   = p_org_id
    AND  c.business_id        = p_business_id
    AND  c.action_needed      = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.due_at             IS NULL
    AND  c.direction          = 'sent'
    AND  c.entry_date         >= NOW() - INTERVAL '180 days'
    AND  c.entry_date         <= NOW() - INTERVAL '14 days'
    -- Deduplication: only the latest qualifying sent entry
    AND  c.entry_date = (
           SELECT MAX(c_inner.entry_date)
           FROM   correspondence c_inner
           WHERE  c_inner.organization_id   = p_org_id
             AND  c_inner.business_id        = p_business_id
             AND  c_inner.action_needed      = 'none'
             AND  c_inner.reply_dismissed_at IS NULL
             AND  c_inner.due_at             IS NULL
             AND  c_inner.direction          = 'sent'
             AND  c_inner.entry_date         >= NOW() - INTERVAL '180 days'
             AND  c_inner.entry_date         <= NOW() - INTERVAL '14 days'
             AND  (
                    EXISTS (
                      SELECT 1 FROM unnest(p_tier1_financial) AS kw
                      WHERE  LOWER(c_inner.formatted_text_current) LIKE '%' || kw || '%'
                    )
                    OR EXISTS (
                      SELECT 1 FROM unnest(p_tier1_financial) AS kw
                      WHERE  LOWER(c_inner.subject) LIKE '%' || kw || '%'
                    )
                  )
         )
    AND  (
           -- Body match
           EXISTS (
             SELECT 1 FROM unnest(p_tier1_financial) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
           OR
           -- Subject match (catches attachment-only invoice emails)
           EXISTS (
             SELECT 1 FROM unnest(p_tier1_financial) AS kw
             WHERE  LOWER(c.subject) LIKE '%' || kw || '%'
           )
         )
    AND  NOT EXISTS (
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
  -- Received commitment to follow up. No sent reply since.
  -- Window: 7 days → 60 days.
  -- Auto-reply guard: excludes automated/OOO responses.
  -- Deduplication: only the most recent qualifying received entry per business.
  -- Snoozed protection: skips entries with user-set due_at.
  UPDATE correspondence c
  SET    action_needed = 'waiting_on_them',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id   = p_org_id
    AND  c.business_id        = p_business_id
    AND  c.action_needed      = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.due_at             IS NULL
    AND  c.direction          = 'received'
    AND  c.entry_date         >= NOW() - INTERVAL '60 days'
    AND  c.entry_date         <= NOW() - INTERVAL '7 days'
    -- Auto-reply / OOO guard
    AND  LOWER(c.formatted_text_current) NOT LIKE '%out of office%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%automatic reply%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%auto-reply%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%automated response%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%this is an automated%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%do not reply to this%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%noreply%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%no-reply%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%delivery failure%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%mail delivery%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%undeliverable%'
    -- Deduplication: only the latest qualifying received entry
    AND  c.entry_date = (
           SELECT MAX(c_inner.entry_date)
           FROM   correspondence c_inner
           WHERE  c_inner.organization_id   = p_org_id
             AND  c_inner.business_id        = p_business_id
             AND  c_inner.action_needed      = 'none'
             AND  c_inner.reply_dismissed_at IS NULL
             AND  c_inner.due_at             IS NULL
             AND  c_inner.direction          = 'received'
             AND  c_inner.entry_date         >= NOW() - INTERVAL '60 days'
             AND  c_inner.entry_date         <= NOW() - INTERVAL '7 days'
             AND  (
                    EXISTS (
                      SELECT 1 FROM unnest(p_tier2_commitments) AS kw
                      WHERE  LOWER(c_inner.formatted_text_current) LIKE '%' || kw || '%'
                    )
                    OR EXISTS (
                      SELECT 1 FROM unnest(p_commitment_patterns) AS pat
                      WHERE  c_inner.formatted_text_current ~* pat
                    )
                  )
         )
    AND  (
           EXISTS (
             SELECT 1 FROM unnest(p_tier2_commitments) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
           OR EXISTS (
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
  -- Meeting or Call note with financial or commitment language. No follow-up since.
  -- Window: 3 days → 90 days.
  -- Deduplication: only the most recent qualifying Meeting/Call entry per business.
  -- Snoozed protection: skips entries with user-set due_at.
  UPDATE correspondence c
  SET    action_needed = 'invoice',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id   = p_org_id
    AND  c.business_id        = p_business_id
    AND  c.action_needed      = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.due_at             IS NULL
    AND  c.type               IN ('Meeting', 'Call')
    AND  c.entry_date         >= NOW() - INTERVAL '90 days'
    AND  c.entry_date         <= NOW() - INTERVAL '3 days'
    -- Deduplication: only the latest qualifying Meeting/Call entry
    AND  c.entry_date = (
           SELECT MAX(c_inner.entry_date)
           FROM   correspondence c_inner
           WHERE  c_inner.organization_id   = p_org_id
             AND  c_inner.business_id        = p_business_id
             AND  c_inner.action_needed      = 'none'
             AND  c_inner.reply_dismissed_at IS NULL
             AND  c_inner.due_at             IS NULL
             AND  c_inner.type               IN ('Meeting', 'Call')
             AND  c_inner.entry_date         >= NOW() - INTERVAL '90 days'
             AND  c_inner.entry_date         <= NOW() - INTERVAL '3 days'
             AND  (
                    EXISTS (
                      SELECT 1 FROM unnest(p_tier1_financial) AS kw
                      WHERE  LOWER(c_inner.formatted_text_current) LIKE '%' || kw || '%'
                    )
                    OR EXISTS (
                      SELECT 1 FROM unnest(p_tier2_commitments) AS kw
                      WHERE  LOWER(c_inner.formatted_text_current) LIKE '%' || kw || '%'
                    )
                  )
         )
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
  -- Inbound interest or enquiry. Tom hasn't replied.
  -- Window: 7 days → 60 days.
  -- Auto-reply guard: excludes automated/OOO responses.
  -- Minimum length: 150 chars — filters thin "yes, interested" acknowledgements.
  -- Deduplication: only the most recent qualifying received entry per business.
  -- Snoozed protection: skips entries with user-set due_at.
  UPDATE correspondence c
  SET    action_needed = 'prospect',
         due_at        = v_due_at,
         updated_at    = NOW()
  WHERE  c.organization_id   = p_org_id
    AND  c.business_id        = p_business_id
    AND  c.action_needed      = 'none'
    AND  c.reply_dismissed_at IS NULL
    AND  c.due_at             IS NULL
    AND  c.direction          = 'received'
    AND  c.entry_date         >= NOW() - INTERVAL '60 days'
    AND  c.entry_date         <= NOW() - INTERVAL '7 days'
    AND  LENGTH(c.formatted_text_current) > 150
    -- Auto-reply / OOO guard
    AND  LOWER(c.formatted_text_current) NOT LIKE '%out of office%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%automatic reply%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%auto-reply%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%automated response%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%this is an automated%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%do not reply to this%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%noreply%'
    AND  LOWER(c.formatted_text_current) NOT LIKE '%no-reply%'
    -- Deduplication: only the latest qualifying received entry
    AND  c.entry_date = (
           SELECT MAX(c_inner.entry_date)
           FROM   correspondence c_inner
           WHERE  c_inner.organization_id   = p_org_id
             AND  c_inner.business_id        = p_business_id
             AND  c_inner.action_needed      = 'none'
             AND  c_inner.reply_dismissed_at IS NULL
             AND  c_inner.due_at             IS NULL
             AND  c_inner.direction          = 'received'
             AND  c_inner.entry_date         >= NOW() - INTERVAL '60 days'
             AND  c_inner.entry_date         <= NOW() - INTERVAL '7 days'
             AND  LENGTH(c_inner.formatted_text_current) > 150
             AND  (
                    EXISTS (
                      SELECT 1 FROM unnest(p_tier2_interest) AS kw
                      WHERE  LOWER(c_inner.formatted_text_current) LIKE '%' || kw || '%'
                    )
                    OR EXISTS (
                      SELECT 1 FROM unnest(p_interest_patterns) AS pat
                      WHERE  c_inner.formatted_text_current ~* pat
                    )
                  )
         )
    AND  (
           EXISTS (
             SELECT 1 FROM unnest(p_tier2_interest) AS kw
             WHERE  LOWER(c.formatted_text_current) LIKE '%' || kw || '%'
           )
           OR EXISTS (
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
