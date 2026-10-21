-- Rollback for 20261021_002_unreviewed_status.sql: the two functions exactly as
-- they were on live on 21 Oct 2026 (from supabase db dump). Run by hand only.

BEGIN;

CREATE OR REPLACE FUNCTION "public"."contract_insert_drives_pipeline"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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

    -- A signed contract supersedes an earlier "not renewing", but only if the
    -- decline came first. Otherwise a stale decline would block the derivation
    -- from ever touching this business again.
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
$$;



CREATE OR REPLACE FUNCTION "public"."sync_business_flags_from_contracts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_id uuid; has_club_card boolean; has_advertiser boolean; in_force boolean; cur record; has_cur boolean;
BEGIN
  target_id := COALESCE(NEW.business_id, OLD.business_id);
  SELECT
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current AND membership_type = 'club_card'),
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current AND membership_type = 'advertiser'),
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current
                                     AND coalesce(contract_end, current_date) >= current_date)
  INTO has_club_card, has_advertiser, in_force;

  SELECT contract_start, contract_end, contract_amount, contract_currency, deal_terms, membership_type
  INTO cur FROM contracts
  WHERE business_id = target_id AND is_current
  ORDER BY contract_start DESC NULLS LAST LIMIT 1;
  has_cur := FOUND;

  UPDATE businesses b
  SET
    is_club_card  = has_club_card,
    is_advertiser = has_advertiser,
    status = CASE
      WHEN in_force AND coalesce(b.status, '') IN ('', 'Prospect', 'Former', 'Inactive') THEN 'Active'
      ELSE b.status END,
    membership_type = CASE
      WHEN in_force AND (b.membership_type IS NULL OR b.membership_type LIKE 'former_%')
        THEN coalesce(cur.membership_type, b.membership_type)
      WHEN b.membership_type IS NULL AND has_club_card  THEN 'club_card'
      WHEN b.membership_type IS NULL AND has_advertiser THEN 'advertiser'
      ELSE b.membership_type END,
    contract_start    = CASE WHEN has_cur THEN cur.contract_start    ELSE b.contract_start END,
    contract_end      = CASE WHEN has_cur THEN cur.contract_end      ELSE b.contract_end END,
    contract_amount   = CASE WHEN has_cur THEN cur.contract_amount   ELSE b.contract_amount END,
    contract_currency = CASE WHEN has_cur THEN cur.contract_currency ELSE b.contract_currency END,
    deal_terms        = CASE WHEN has_cur THEN coalesce(cur.deal_terms, b.deal_terms) ELSE b.deal_terms END
  WHERE b.id = target_id;
  RETURN COALESCE(NEW, OLD);
END $$;



COMMIT;
