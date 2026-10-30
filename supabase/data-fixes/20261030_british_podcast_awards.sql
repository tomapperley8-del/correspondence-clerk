-- 30 Oct 2026: British Podcast Awards' marketing emails off Jack Emsley (Tom: "Yes, move them").
-- A new Unreviewed "British Podcast Awards" record takes the 9 emails from em.britishpodcastawards.com
-- and the "Louise Bottom" contact (awards@). No domain mapping: it's a mailing subdomain, and its
-- mapping to Jack was removed in group A. Before-images: cc_phase0_backup reason
-- 'podcast awards 2026-10-30'. Undo: 20261030_british_podcast_awards_undo.sql.
BEGIN;
CREATE TEMP TABLE bpa_move AS
SELECT c.id FROM correspondence c
WHERE c.business_id = '36ed4931-6464-473f-a504-dddca92efd9a'
  AND substring(c.raw_text_original from 'From: [^\n]*') ILIKE '%@em.britishpodcastawards.com%';
DO $$ BEGIN
  IF (SELECT count(*) FROM bpa_move) <> 9 THEN
    RAISE EXCEPTION 'expected 9 British Podcast Awards emails on Jack Emsley, found %', (SELECT count(*) FROM bpa_move);
  END IF;
END $$;
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'correspondence', c.id, to_jsonb(c) - 'search_vector', 'podcast awards 2026-10-30'
FROM correspondence c WHERE c.id IN (SELECT id FROM bpa_move);
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'contacts', id, to_jsonb(k), 'podcast awards 2026-10-30' FROM contacts k
WHERE business_id = '36ed4931-6464-473f-a504-dddca92efd9a' AND emails ? 'awards@em.britishpodcastawards.com';

CREATE TEMP TABLE bpa_new AS
WITH b AS (
  INSERT INTO businesses (organization_id, name, normalized_name, status, notes)
  SELECT organization_id, 'British Podcast Awards', 'british podcast awards', 'Unreviewed',
         'Added on 30/10/2026: its marketing emails had been filed under Jack Emsley by a wrong domain match. Check the details.'
  FROM businesses WHERE id = '36ed4931-6464-473f-a504-dddca92efd9a'
  RETURNING id
)
SELECT id AS business_id FROM b;
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'businesses_created', business_id, '{}'::jsonb, 'podcast awards 2026-10-30' FROM bpa_new;

UPDATE contacts SET business_id = (SELECT business_id FROM bpa_new)
WHERE business_id = '36ed4931-6464-473f-a504-dddca92efd9a' AND emails ? 'awards@em.britishpodcastawards.com';
UPDATE correspondence SET business_id = (SELECT business_id FROM bpa_new)
WHERE id IN (SELECT id FROM bpa_move);

SELECT (SELECT count(*) FROM correspondence WHERE business_id = '36ed4931-6464-473f-a504-dddca92efd9a') AS jack_emails,
       (SELECT string_agg(name, ', ') FROM contacts WHERE business_id = '36ed4931-6464-473f-a504-dddca92efd9a') AS jack_contacts,
       (SELECT count(*) FROM correspondence WHERE business_id = (SELECT business_id FROM bpa_new)) AS bpa_emails,
       (SELECT count(*) FROM correspondence c WHERE c.id IN (SELECT id FROM bpa_move) AND c.contact_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM contacts k WHERE k.id = c.contact_id AND k.business_id = c.business_id)) AS contact_mismatch;
COMMIT;
