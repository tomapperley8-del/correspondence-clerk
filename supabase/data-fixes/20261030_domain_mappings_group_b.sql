-- 30 Oct 2026: domain mappings group B (Tom: "do as you reccomend, but jack emsley should be seperate
-- to hounslow council"). Audit: shared note domain-mappings-audit.md.
--   hounslow.gov.uk     Jack Emsley -> Hounslow Council; the 9 emails from other council staff and
--                       Jonathan Sim's contact go there too. Jack keeps his record and his own email.
--   pla.co.uk           MY PLACE -> new Unreviewed "Port of London Authority" (it's the PLA), with its
--                       2 event forms and a contact for Joey Innes-Hopkins (name as in the forms).
--   brindisa.com        removed (no email from Brindisa; only mentioned inside our own messages).
--   cowandco-london.com MUMADOO -> COW & CO LONDON (James Cooley's Mumadoo emails stay on Mumadoo).
--   JAMIE BETTS renamed St John Ambulance (all 6 of its emails are SJA press releases).
-- Not touched: the British Podcast Awards emails and Louise Bottom's contact on Jack Emsley.
-- Before-images: cc_phase0_backup reason 'group b 2026-10-30'. Undo: 20261030_domain_mappings_group_b_undo.sql.
BEGIN;
CREATE TEMP TABLE gb_council AS
SELECT c.id FROM correspondence c
WHERE c.business_id = '36ed4931-6464-473f-a504-dddca92efd9a'
  AND substring(c.raw_text_original from 'From: [^\n]*') ILIKE '%@hounslow.gov.uk%'
  AND substring(c.raw_text_original from 'From: [^\n]*') NOT ILIKE '%jack.emsley%';
CREATE TEMP TABLE gb_pla AS
SELECT c.id FROM correspondence c
WHERE c.business_id = 'b43f9e86-ef2c-4ad6-bdc3-3b5b16ee8c0a' AND c.raw_text_original ILIKE '%From: joey.innes-hopkins <joey.innes-hopkins@pla.co.uk>%';
DO $$ BEGIN
  IF (SELECT count(*) FROM gb_council) <> 9 OR (SELECT count(*) FROM gb_pla) <> 2 THEN
    RAISE EXCEPTION 'expected 9 council and 2 PLA emails, found % and %', (SELECT count(*) FROM gb_council), (SELECT count(*) FROM gb_pla);
  END IF;
  IF (SELECT count(*) FROM domain_mappings WHERE (id, business_id) IN (
        ('ec1d9a19-fa03-404f-b847-a741a3066726'::uuid, '36ed4931-6464-473f-a504-dddca92efd9a'::uuid),
        ('90d6ba66-038b-4baa-9ecd-a4c731d9e836'::uuid, 'b43f9e86-ef2c-4ad6-bdc3-3b5b16ee8c0a'::uuid),
        ('7e1f18fe-f504-46da-bb16-a98e46bc1a93'::uuid, '308a995d-3c26-4d5d-b3ad-2a74b094f93b'::uuid),
        ('0149489f-78c6-4442-b94a-b2237775e604'::uuid, '9621b61d-845c-454f-99ac-991203465763'::uuid))) <> 4 THEN
    RAISE EXCEPTION 'a mapping has changed since the audit; re-check before running';
  END IF;
END $$;

-- Before-images
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'domain_mappings', id, to_jsonb(dm), 'group b 2026-10-30' FROM domain_mappings dm
WHERE id IN ('ec1d9a19-fa03-404f-b847-a741a3066726', '90d6ba66-038b-4baa-9ecd-a4c731d9e836',
             '7e1f18fe-f504-46da-bb16-a98e46bc1a93', '0149489f-78c6-4442-b94a-b2237775e604');
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'businesses', id, to_jsonb(b), 'group b 2026-10-30' FROM businesses b WHERE id = 'e43043d2-61ac-4d09-84a8-6390b6528a05';
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'contacts', id, to_jsonb(k), 'group b 2026-10-30' FROM contacts k
WHERE business_id = '36ed4931-6464-473f-a504-dddca92efd9a' AND emails ? 'jonathan.sim@hounslow.gov.uk';
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'correspondence', c.id, to_jsonb(c) - 'search_vector', 'group b 2026-10-30'
FROM correspondence c WHERE c.id IN (SELECT id FROM gb_council UNION ALL SELECT id FROM gb_pla);

-- Port of London Authority and Joey
CREATE TEMP TABLE gb_new AS
WITH b AS (
  INSERT INTO businesses (organization_id, name, normalized_name, status, notes)
  SELECT organization_id, 'Port of London Authority', 'port of london authority', 'Unreviewed',
         'Added on 30/10/2026: its event forms had been filed under MY PLACE by a wrong domain match (pla.co.uk). Check the details.'
  FROM businesses WHERE id = 'b43f9e86-ef2c-4ad6-bdc3-3b5b16ee8c0a'
  RETURNING id, organization_id
)
SELECT id AS business_id, organization_id FROM b;
CREATE TEMP TABLE gb_joey AS
WITH k AS (
  INSERT INTO contacts (organization_id, business_id, name, emails, normalized_email)
  SELECT organization_id, business_id, 'Joey Innes-Hopkins', '["joey.innes-hopkins@pla.co.uk"]'::jsonb, 'joey.innes-hopkins@pla.co.uk'
  FROM gb_new RETURNING id
)
SELECT id FROM k;
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'businesses_created', business_id, '{}'::jsonb, 'group b 2026-10-30' FROM gb_new;
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'contacts_created', id, '{}'::jsonb, 'group b 2026-10-30' FROM gb_joey;

-- Mappings
UPDATE domain_mappings SET business_id = '2604bba3-386c-419e-ab81-239074894a2b' WHERE id = 'ec1d9a19-fa03-404f-b847-a741a3066726';
UPDATE domain_mappings SET business_id = (SELECT business_id FROM gb_new) WHERE id = '90d6ba66-038b-4baa-9ecd-a4c731d9e836';
UPDATE domain_mappings SET business_id = '19f2607e-9352-46f7-9c76-1f427fa81306' WHERE id = '0149489f-78c6-4442-b94a-b2237775e604';
DELETE FROM domain_mappings WHERE id = '7e1f18fe-f504-46da-bb16-a98e46bc1a93';

-- Rename
UPDATE businesses SET name = 'St John Ambulance', normalized_name = 'st john ambulance'
WHERE id = 'e43043d2-61ac-4d09-84a8-6390b6528a05';

-- Hounslow Council staff: contact and emails
UPDATE contacts SET business_id = '2604bba3-386c-419e-ab81-239074894a2b'
WHERE business_id = '36ed4931-6464-473f-a504-dddca92efd9a' AND emails ? 'jonathan.sim@hounslow.gov.uk';
UPDATE correspondence c SET business_id = '2604bba3-386c-419e-ab81-239074894a2b',
       contact_id = CASE WHEN c.raw_text_original ILIKE '%From: Jonathan Sim <jonathan.sim@hounslow.gov.uk>%'
                         THEN (SELECT id FROM contacts WHERE business_id = '2604bba3-386c-419e-ab81-239074894a2b'
                               AND emails ? 'jonathan.sim@hounslow.gov.uk' LIMIT 1)
                         ELSE c.contact_id END
WHERE c.id IN (SELECT id FROM gb_council);

-- PLA's two forms
UPDATE correspondence SET business_id = (SELECT business_id FROM gb_new), contact_id = (SELECT id FROM gb_joey)
WHERE id IN (SELECT id FROM gb_pla);

SELECT (SELECT count(*) FROM correspondence WHERE business_id = '36ed4931-6464-473f-a504-dddca92efd9a') AS jack_emails,
       (SELECT count(*) FROM correspondence WHERE business_id = '2604bba3-386c-419e-ab81-239074894a2b') AS council_emails,
       (SELECT count(*) FROM correspondence c WHERE c.id IN (SELECT id FROM gb_council) AND c.contact_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM contacts k WHERE k.id = c.contact_id AND k.business_id = c.business_id)) AS council_contact_mismatch,
       (SELECT count(*) FROM correspondence WHERE business_id = (SELECT business_id FROM gb_new) AND contact_id = (SELECT id FROM gb_joey)) AS pla_emails,
       (SELECT string_agg(domain || ' -> ' || b.name, ', ' ORDER BY domain) FROM domain_mappings dm JOIN businesses b ON b.id = dm.business_id
         WHERE domain IN ('hounslow.gov.uk', 'pla.co.uk', 'brindisa.com', 'cowandco-london.com', 'sja.org.uk')) AS mappings;
COMMIT;
