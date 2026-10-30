-- 30 Oct 2026: S&V LONDON's 37 emails belong to 11 other organisations (Tom: "Yes, as proposed").
-- All were press releases filed there by the old fuzzy domain match ("london"). Creates the 11 as
-- Unreviewed, moves each email, its contact and its domain mapping there, adds contacts for senders
-- with none, and splits the mixed "Press Alex Challoner - London Unleashed" contact. S&V keeps
-- info@svlondon.com only. Before-images: cc_phase0_backup reason 'sv london 2026-10-30'.
-- Undo: 20261030_sv_london_emails_undo.sql.
BEGIN;
CREATE TEMP TABLE sv_org (domain text PRIMARY KEY, name text, business_id uuid) ON COMMIT DROP;
INSERT INTO sv_org (domain, name) VALUES
  ('londoncouncils.gov.uk', 'London Councils'),
  ('actionwestlondon.org.uk', 'Action West London'),
  ('firstraillondon.co.uk', 'First Rail London'),
  ('annalouoflondon.com', 'Anna Lou of London'),
  ('distriktlondon.com', 'Distrikt Communications'),
  ('londonmasons.org.uk', 'London Freemasons'),
  ('londonhearts.org', 'London Hearts'),
  ('londonindependentpictures.com', 'London Independent Pictures'),
  ('londonunleashed.org.uk', 'London Unleashed'),
  ('sportspasslondon.com', 'SportsPass London'),
  ('london-fire.gov.uk', 'London Fire Brigade');

-- S&V and its organisation, checked: stop if S&V has changed since the audit (37 emails)
CREATE TEMP TABLE sv AS SELECT id, organization_id FROM businesses WHERE id = '5acd7aa3-1755-4cf9-8ba3-600e4db075a7';
DO $$ BEGIN
  IF (SELECT count(*) FROM correspondence WHERE business_id = '5acd7aa3-1755-4cf9-8ba3-600e4db075a7') <> 37 THEN
    RAISE EXCEPTION 'S&V LONDON no longer has 37 emails; re-check before running';
  END IF;
END $$;

-- 1. The 11 records
WITH made AS (
  INSERT INTO businesses (organization_id, name, normalized_name, status, notes)
  SELECT sv.organization_id, o.name, lower(o.name), 'Unreviewed',
         'Added on 30/10/2026: its emails had been filed under S&V LONDON by a wrong domain match. Check the details.'
  FROM sv_org o, sv
  RETURNING id, name
)
UPDATE sv_org o SET business_id = made.id FROM made WHERE made.name = o.name;
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'businesses_created', business_id, jsonb_build_object('name', name), 'sv london 2026-10-30' FROM sv_org;

-- 2. Contacts: before-images, then move each single-organisation contact by its email's domain
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'contacts', k.id, to_jsonb(k), 'sv london 2026-10-30'
FROM contacts k WHERE k.business_id = (SELECT id FROM sv) AND k.id <> 'b3a9762d-d25f-4e52-8f08-fe648754573b';

UPDATE contacts k SET business_id = o.business_id
FROM sv_org o
WHERE k.business_id = (SELECT id FROM sv) AND k.id <> 'b3a9762d-d25f-4e52-8f08-fe648754573b'
  AND k.id <> '2f67e798-ffa0-4207-8f88-602aaa3edb0c'
  AND lower(split_part(k.emails->>0, '@', 2)) = o.domain;

-- The mixed contact keeps London Unleashed's address; the other two get their own contacts below
UPDATE contacts SET business_id = (SELECT business_id FROM sv_org WHERE domain = 'londonunleashed.org.uk'),
       emails = '["press@londonunleashed.org.uk"]'::jsonb, normalized_email = 'press@londonunleashed.org.uk'
WHERE id = '2f67e798-ffa0-4207-8f88-602aaa3edb0c' AND business_id = (SELECT id FROM sv);

-- 3. Senders with no contact (names as they sign; the press team isn't a person)
WITH made AS (
  INSERT INTO contacts (organization_id, business_id, name, role, emails, normalized_email, name_is_placeholder)
  SELECT sv.organization_id, o.business_id, n.name, n.role, jsonb_build_array(n.email), n.email, n.placeholder
  FROM (VALUES
    ('gemma.kappala-ramsamy@londoncouncils.gov.uk', 'Gemma Kappala-Ramsamy', NULL, false),
    ('lcpress@londoncouncils.gov.uk', 'London Council Press Team', NULL, true),
    ('zahra.shah@actionwestlondon.org.uk', 'Zahra Shah', NULL, false),
    ('dana.raer@firstraillondon.co.uk', 'Dana Raer', NULL, false),
    ('tia@londonhearts.org', 'Tia Marshall', NULL, false),
    ('info@sportspasslondon.com', 'Chris', 'Founder', false)
  ) n(email, name, role, placeholder)
  JOIN sv_org o ON o.domain = split_part(n.email, '@', 2), sv
  RETURNING id
)
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'contacts_created', id, '{}'::jsonb, 'sv london 2026-10-30' FROM made;

-- 4. Emails: to the sender's organisation, with the contact that has the sender's address
CREATE TEMP TABLE sv_move AS
SELECT c.id, lower(substring(c.raw_text_original from 'From: [^<\n]*<([^>]+)>')) AS sender
FROM correspondence c WHERE c.business_id = (SELECT id FROM sv);
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'correspondence', c.id, to_jsonb(c) - 'search_vector', 'sv london 2026-10-30'
FROM correspondence c JOIN sv_move m USING (id);
UPDATE correspondence c SET business_id = o.business_id,
       contact_id = (SELECT k.id FROM contacts k WHERE k.business_id = o.business_id
                     AND k.emails ? m.sender LIMIT 1)
FROM sv_move m JOIN sv_org o ON o.domain = split_part(m.sender, '@', 2)
WHERE c.id = m.id;

-- 5. Domain mappings for the new records (group A removed the S&V ones earlier today)
WITH made AS (
  INSERT INTO domain_mappings (org_id, domain, business_id)
  SELECT sv.organization_id, o.domain, o.business_id FROM sv_org o, sv
  ON CONFLICT (org_id, domain) DO NOTHING
  RETURNING id
)
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'domain_mappings_created', id, '{}'::jsonb, 'sv london 2026-10-30' FROM made;

-- Checks: S&V keeps 0 emails and 1 contact; every moved email has a contact on its new record
SELECT (SELECT count(*) FROM correspondence WHERE business_id = (SELECT id FROM sv)) AS sv_emails,
       (SELECT count(*) FROM contacts WHERE business_id = (SELECT id FROM sv)) AS sv_contacts,
       (SELECT count(*) FROM correspondence c JOIN sv_move m USING (id)
         JOIN contacts k ON k.id = c.contact_id AND k.business_id = c.business_id) AS moved_with_contact,
       (SELECT string_agg(o.name || ' ' || (SELECT count(*) FROM correspondence WHERE business_id = o.business_id), ', ' ORDER BY o.name) FROM sv_org o) AS per_record;
COMMIT;
