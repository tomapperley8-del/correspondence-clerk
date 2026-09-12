-- 20260912_002_contact_hygiene_and_expired_contracts.sql
--
-- Phase 4 of the data audit, plus the expired-contract close-out. Applied 2026-09-12.
--
-- ============================================================================
-- PART A: expired contracts, closed out only where there is evidence
-- ============================================================================
--
-- 21 contracts were marked is_current with an end date already in the past.
-- An expired date on its own is NOT evidence a contract has ended: most of
-- these are mid-renewal, and the renewal board is driven by is_current via the
-- membership flags, so closing them out would hide live renewal conversations.
-- LITTLE BIRD is 502 days past its end date and still in_discussion.
--
-- So the test is corroboration, not the calendar. Closed out only where a human
-- had already recorded the outcome: renewal_stage = 'not_renewing' OR
-- renewal_declined_at set. Four qualified:
--
--   ANNIE'S RESTAURANT                       ended 2025-04-28, not_renewing
--   Second Nature Chiswick (formerly room2)  ended 2026-03-11, not_renewing
--   SHINE WITH TREVOR BANARJEE               ended 2026-06-10, not_renewing + declined
--   MARE MUSE HAIR STUDIO                    ended 2026-06-24, not_renewing + declined
--
-- Setting is_current = false fired sync_business_flags_from_contracts, which
-- dropped their membership flags and took them off the renewal board. That is
-- the intended result. Backed up under reason 'expired_contract_closed_out'.
--
-- STILL OPEN, deliberately: those four are now status 'Active' with no current
-- contract, which is inconsistent. Marking them 'Former' is a churn judgement
-- and it changes what the cc-live-export Edge Function sends to the Mastersheet,
-- so it needs a human decision rather than a rule.
--
-- ALSO NOTED: LEVENT BOREK and Archie's London both sit at renewal_stage
-- 'invoice_paid' with an expired contract and no successor row. Either the new
-- term was never recorded, or the paid invoice belonged to the term that just
-- ended. Worth a look.
--
-- ============================================================================
-- PART B: contact book hygiene
-- ============================================================================
--
-- 803 of 1,273 contacts were literally named "Contact", plus a handful called
-- "Info", "Team", "at the" and "<>". All from the March 2026 import. The email
-- addresses attached are often real, so deleting them would throw away good
-- data, and contacts.name is NOT NULL so blanking is not an option. They are
-- flagged instead.
--
-- Three further fixes, all backed up under reason 'phase4_contact_hygiene':
--
--   1. Five contacts had a 'mailto:' prefix scraped into their emails array.
--   2. Maya Feeney at Panta Rei carried 'mailto:info@thechiswickcalendar.co.uk'
--      as a second address. That is the own-domain contamination the April 2026
--      guard exists to prevent, and it is exactly how the Calendar's own address
--      ends up looking like a client contact. Own-domain addresses are stripped.
--   3. Bridget Osborne was recorded as the contact for five client businesses
--      (DECOREXI, EXCEL SPORTS, SPRINKLEDMAGIC, THE STABLE PIZZA RESTAURANT,
--      TOP HAT CLEANERS). This is what nearly caused the outreach routine to
--      cold-pitch the Calendar's own editor three times. Those five are
--      deactivated rather than deleted, so their correspondence history stays
--      intact. Her own business record, which carries 276 real correspondence
--      rows, is untouched.
--
-- RESULT: 461 real names, of which 416 are usable (real name, has an email,
-- still active). That is the true size of the addressable contact book.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS name_is_placeholder boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN contacts.name_is_placeholder IS
  'True when the name is import filler ("Contact", "Info", "<>") rather than a real person. Outreach must never address a placeholder by name.';

UPDATE contacts
SET name_is_placeholder = true
WHERE lower(btrim(name)) IN
        ('contact','info','manager','owner','enquiries','reception','team','at the','<>','n/a','none','tbc')
   OR length(btrim(name)) < 3
   OR btrim(name) ~ '^[^[:alpha:]]+$';

CREATE INDEX IF NOT EXISTS idx_contacts_real_names
  ON contacts (business_id) WHERE NOT name_is_placeholder;

-- Strip mailto: prefixes and drop own-domain addresses.
UPDATE contacts ct
SET emails = coalesce((
      SELECT jsonb_agg(cleaned)
      FROM (
        SELECT replace(e::text, 'mailto:', '')::jsonb AS cleaned
        FROM jsonb_array_elements(ct.emails) e
        WHERE replace(trim(both '"' from e::text), 'mailto:', '')
              NOT ILIKE '%@thechiswickcalendar.co.uk'
          AND replace(trim(both '"' from e::text), 'mailto:', '')
              NOT ILIKE '%@chiswickcalendar.co.uk'
      ) s
    ), '[]'::jsonb)
WHERE ct.emails::text ILIKE '%mailto:%'
   OR ct.emails::text ILIKE '%@thechiswickcalendar.co.uk%'
   OR ct.emails::text ILIKE '%@chiswickcalendar.co.uk%';

-- Deactivate internal staff wrongly recorded as a client's contact.
UPDATE contacts ct
SET is_active = false,
    notes = concat_ws(E'\n', nullif(ct.notes,''),
            'Deactivated 2026-09-12: internal Calendar staff wrongly recorded as this business''s contact.')
FROM businesses b
WHERE b.id = ct.business_id
  AND ct.emails::text ILIKE '%bridget.osborne@gmail.com%'
  AND b.name <> 'Bridget Osborne';
