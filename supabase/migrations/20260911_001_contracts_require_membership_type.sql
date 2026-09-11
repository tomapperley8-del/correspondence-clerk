-- 20260911_001_contracts_require_membership_type.sql
--
-- Phase 1 of the data audit. Applied 2026-09-11.
--
-- BACKGROUND
--
-- The March 2026 Mastersheet import wrote 193 prospect records into the
-- `contracts` table. They were not contracts: no start date, no end date, no
-- amount, and a `deal_terms` field holding prospect research notes such as
-- "Category: Dental | Website: whitedentalrooms.com" or outreach log entries
-- like "21/08/25 - Follow up email sent, after no reply to previous".
--
-- All 193 were marked is_current = true with membership_type = NULL.
--
-- CONSEQUENCES
--
--   * sync_business_flags_from_contracts sets a flag only for 'club_card' or
--     'advertiser', so a NULL type set neither flag. The trigger was never
--     broken. It behaved correctly on bad input.
--   * The renewal board therefore saw 111 businesses rather than 302.
--   * derive_business_stages() excluded all 193 as 'graduated_to_renewal',
--     because "has ever held a contract" means renewal-side. They had never
--     held a contract, so 193 real prospects were silently dropped out of
--     outreach entirely.
--
-- WHAT WAS DONE (as data changes, recorded here for the history)
--
--   1. Verified every one of the 193 contract `deal_terms` values was
--      byte-identical to the `deal_terms` already on the parent business.
--      The import had written the same text to both places, so deleting the
--      contract rows lost no information at all.
--   2. Backed all 193 up to cc_phase0_backup, reason
--      'march_import_fake_contracts', then deleted them.
--   3. HEN CORNER had two genuine contracts (2025-26 and 2026-27, GBP 150 each)
--      that were missing a membership_type while the business record already
--      said club_card. Set the type on both; the flag trigger then fired and
--      put Hen Corner back on the renewal board.
--   4. Re-ran the derivation. 22 businesses had stages corrected, backed up
--      under reason 'rederive_after_fake_contract_cleanup'.
--
-- RESULT: current contracts 303 -> 110, businesses evaluated for outreach
-- 494 -> 671, skipped as graduated_to_renewal 201 -> 7.
--
-- The problem was historic, not ongoing: 226 untyped contracts were created in
-- March 2026 and essentially none since. The constraint below makes sure of it.

ALTER TABLE contracts
  ADD CONSTRAINT contracts_current_requires_membership_type
  CHECK (NOT is_current OR membership_type IS NOT NULL);

COMMENT ON CONSTRAINT contracts_current_requires_membership_type ON contracts IS
  'A current contract must have a membership_type, otherwise sync_business_flags_from_contracts sets no flag and the business disappears from the renewal board.';

-- Historic rows (is_current = false) keep their null types. 33 such rows exist
-- and carry no meaning beyond history, so the constraint deliberately allows them.
