-- 20260912_001_contract_insert_drives_pipeline.sql
--
-- Phase 3 of the data audit. Applied 2026-09-12.
--
-- Adding a real contract now moves the business through the pipeline by itself,
-- instead of waiting for someone to press "promote to contracts" in the UI.
--
-- This mirrors promoteOutreachToContracts() in app/actions/businesses.ts
-- exactly: clear the whole outreach block, then open a fresh renewal cycle.
-- A business should never sit on both boards at once. Five did, which is simply
-- what happens when a manual button is occasionally forgotten.
--
-- WHY THE membership_type GUARD IS ON THE TRIGGER
--
-- Without it, the March 2026 import would have tripped this 193 times and
-- wiped the outreach block off 193 real prospects. The CHECK constraint in
-- 20260911_001 makes that impossible now, but the guard stays as belt and
-- braces: a trigger this destructive should not rely on a constraint added
-- the day before it.
--
-- mute_replies is deliberately NOT checked. That flag governs whether we
-- contact a business, not whether we keep its record straight, and the existing
-- sync_business_flags_from_contracts trigger does not check it either.
--
-- renewal_not_started_at is set from contract_start rather than today, so the
-- "days in stage" badge on the card counts from the start of the term, which is
-- what that number is supposed to mean.
--
-- A signed contract clears an earlier renewal_declined_at, but only when the
-- decline predates the contract start. Otherwise a stale "not renewing" would
-- permanently block derive_business_stages() from ever touching the business
-- again. Declines remain manual in every other respect.
--
-- ACCOMPANYING DATA FIXES (applied 2026-09-12, backed up to cc_phase0_backup
-- under reason 'phase3_flag_resync_and_graduation', 8 rows)
--
--   * Recomputed is_club_card / is_advertiser from contracts for every business.
--     Four flags were stale: set true with no matching current typed contract.
--     They drifted because the sync trigger only recomputes when a contract row
--     changes, so a flag set by any other route never gets corrected.
--     None were missing in the other direction.
--   * Graduated the four businesses that held a real current contract while
--     still carrying an outreach_stage: Connor Foxall Interiors, Doctor Dough
--     Pizza, Hen Corner, Second Nature Chiswick.
--
-- Former businesses that carry an outreach_stage are left alone on purpose.
-- OutreachView has a "Ready to re-engage" section that depends on them being
-- there.
--
-- VERIFIED by inserting a real contract against AIRIVO: outreach_stage went
-- 'contacted' -> NULL, the whole outreach date block cleared, renewal_stage
-- became 'not_started' dated from contract_start, is_club_card became true and
-- status went Prospect -> Active. Test contract deleted and AIRIVO restored.

CREATE OR REPLACE FUNCTION public.contract_insert_drives_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  UPDATE businesses b
  SET
    -- graduate off the outreach board, exactly as the manual button does
    outreach_stage            = NULL,
    outreach_identified_at    = NULL,
    outreach_contacted_at     = NULL,
    outreach_followed_up_at   = NULL,
    outreach_in_discussion_at = NULL,
    outreach_won_at           = NULL,
    outreach_invoice_paid_at  = NULL,
    outreach_declined_at      = NULL,

    -- open a fresh renewal cycle for the new term
    renewal_stage             = 'not_started',
    renewal_not_started_at    = coalesce(NEW.contract_start, current_date),
    renewal_contacted_at      = NULL,
    renewal_in_discussion_at  = NULL,
    renewal_agreed_at         = NULL,
    renewal_invoice_paid_at   = NULL,

    renewal_declined_at = CASE
      WHEN b.renewal_declined_at IS NOT NULL
       AND NEW.contract_start IS NOT NULL
       AND b.renewal_declined_at::date <= NEW.contract_start
      THEN NULL
      ELSE b.renewal_declined_at
    END,

    status = CASE WHEN coalesce(b.status,'') IN ('', 'Prospect') THEN 'Active' ELSE b.status END
  WHERE b.id = NEW.business_id;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.contract_insert_drives_pipeline() IS
  'On a new current contract: clear the outreach block and open a fresh renewal cycle. Mirrors promoteOutreachToContracts() so the button is no longer needed.';

DROP TRIGGER IF EXISTS contract_insert_drives_pipeline_trigger ON contracts;

CREATE TRIGGER contract_insert_drives_pipeline_trigger
AFTER INSERT ON contracts
FOR EACH ROW
WHEN (NEW.is_current AND NEW.membership_type IS NOT NULL)
EXECUTE FUNCTION contract_insert_drives_pipeline();
