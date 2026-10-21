-- Stage 2 data cleanup: Tom's review of the 135 businesses created automatically
-- from email between 21 Sep and 21 Oct 2026 (review page version 2, choices
-- pasted in chat on 21 Oct 2026).
--
--   MOVE (6): the "business" is really a person at a business already on file.
--     Its correspondence, tasks, mailbox-scan rows and domain links go to that
--     business. Each contact moves too, or, where the target already has a
--     contact with the same name or email, its email addresses are added to that
--     contact and the duplicate is switched off. The emptied record is hidden.
--   HIDE (52): not a business. Status 'Not a business' keeps it out of every
--     list and the Mastersheet export; its domain links are removed so it stops
--     catching mail; its open tasks are closed. Correspondence and contacts stay.
--   KEEP (77): nothing changes; they stay Prospect.
--   FOLD (Tom, 21 Oct): at LIVING ROOM AT THE CHISWICK the placeholder contact
--     "Contact" (mazurmariana20@gmail.com) is Mariana Mazur; it is folded into
--     the Mariana Mazur contact that moves there.
--   Also: domain links for personal mail providers are removed wherever they
--     point (a gmail-style address is never a business identity).
--
-- Every row is copied to cc_phase0_backup (reason 'stage2_review_2026_10_21')
-- before it changes. Undo: supabase/data-fixes/20261021_stage2_review_cleanup_undo.sql
-- Run with psql -v ON_ERROR_STOP=1. It refuses to run twice.

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage2_review_2026_10_21') THEN
    RAISE EXCEPTION 'stage2_review_2026_10_21 has already been applied';
  END IF;
END $$;

CREATE TEMP TABLE _mv (src uuid PRIMARY KEY, dst uuid NOT NULL) ON COMMIT DROP;
INSERT INTO _mv VALUES
  ('61fe1387-efae-4733-8040-14197c1f91a2', '3d07c3be-7b76-4332-9d76-83c3cf14a74a'), -- Sabrina Shropshire -> BLO BAR
  ('c9c87a29-46cc-4aaf-89d6-bcf57a471938', 'f8904a89-4a36-418a-b053-1617e3879054'), -- Thehogarth -> HOGARTH CLUB
  ('60ee0c05-63ae-4eae-ba16-d005a4b57020', '360181c2-7fc9-41c2-bf4b-ac05066598a6'), -- Trafalgar -> CHISWICK CINEMA
  ('a07a79d8-a82e-4bad-93e5-e93b6e7804a0', '5e3bd58d-480b-4a03-b148-c892b67591f3'), -- Martin Shippen -> RIVERSIDE STUDIOS
  ('8d1721c6-689d-424d-9cbc-00f32195dfeb', 'd96021a3-c275-4733-bfa5-9cf9d0616a14'), -- Mariana Mazur -> LIVING ROOM AT THE CHISWICK
  ('8434f8f2-5540-4c26-8468-7e0c82364aee', '69c8b272-692d-4ff2-8a0c-182fedeab0eb'); -- Japaneseknifecompany -> JAPANESE KNIFE COMPANY

CREATE TEMP TABLE _hide (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _hide VALUES
  ('3e2d29a2-5d2b-4af8-978f-4abfeaae6470'), ('07450a1d-fea2-452e-b499-f4366ecf57db'), ('a2c263ae-3c0f-415e-adf6-a52e5b30db82'),
  ('7a4a8760-b030-4733-99d2-35e1d7b8a622'), ('61b55b92-8961-4f60-90c6-108c1c24c0bd'), ('b9fbe70e-3773-4333-b5af-31be9bf17de9'),
  ('5d480b37-aa90-4800-858f-c0ce1e0eb5a6'), ('d2fde64d-a3fb-4fa2-9cbb-153db6621a16'), ('cd28c08a-2bd1-456a-8a20-dd03df3ab090'),
  ('41fce45a-73f7-481a-9299-8d8e023b73b4'), ('9c06a60e-dac6-4a3f-b023-71dc12a1a861'), ('8d9ca429-3910-4d44-beae-576297337722'),
  ('4b314a3c-7043-44c7-bfd6-eacfb624c672'), ('fcafe46a-7129-4ec8-a850-390516382394'), ('7e23a69d-c861-47b5-9686-d978f68ff750'),
  ('fb528228-f26e-40a2-8bca-dfdc0c49d616'), ('8f2da1c3-9b94-4894-b6af-27a7ed203d95'), ('d3875db7-f222-42dc-bba0-57622b22b054'),
  ('d7f67cf2-ae67-4555-bf99-0f4c2e322b8a'), ('8188eb8c-d959-4a62-8c6d-6a6fa6f3c8eb'), ('b86cfb78-bd51-4dc2-a675-fc564653f074'),
  ('a08350b1-c9cb-4126-83e5-983afd4d26b0'), ('6217e129-3a90-45fe-aa3b-5d504e6f17ab'), ('f8a35b3f-209c-4fb9-b53c-17e43c8f1feb'),
  ('eba0c4aa-1621-4029-a96a-95d4cd040516'), ('30432c5c-a5c3-4947-8987-4c7dc7e7e4da'), ('ff670296-2ae5-4cb2-8900-41b405713c41'),
  ('a1ddfafc-88cb-4d04-bf32-ddf370ae41fd'), ('d443c8bc-8af5-4d2b-a9b7-0a8bc7bd1bf4'), ('1fb2a256-cfe1-4e0a-a73e-acdf736349d9'),
  ('4c513041-8067-42a4-92ac-e17c498a89f7'), ('e1ff0a4a-79d0-4026-bd6c-0c8e9007c817'), ('9a9de564-c8fd-4ad9-ac8a-d452e914f156'),
  ('9010fd74-b269-408c-a893-2534dffc047b'), ('00d629b0-117a-42f0-9b15-c9f6de835d82'), ('ba0dcc35-45e4-487d-b167-346f94e36d7d'),
  ('a12cb346-eb07-436c-9970-6474b1cdf463'), ('924367ed-3b74-4665-8948-fc5504d35aea'), ('9a7d46cb-9da2-479c-871b-32a649f1cf3a'),
  ('e5ae4b87-1e95-4f98-a4a4-6a043444f55b'), ('1c9dcc88-3563-4f46-bd2d-33b6fe769160'), ('56bb8b5e-e8d1-4486-82ce-af658f99f7a2'),
  ('b9d46a54-f271-4d16-8c17-7aa3834e579e'), ('ed0caf39-5658-4a9d-8e39-e7abf80de37b'), ('685b437a-1fa1-43fa-b651-4640c0f2ac68'),
  ('b246ac8b-bdb6-4e40-80fc-f5b6aac5d610'), ('8fc06ecb-8980-40f8-a19b-11d40608f3bf'), ('2e162121-ba4b-4322-a95d-182aa3a1ac0f'),
  ('07c8b329-d83f-433a-8700-98cfaf8888b1'), ('1522fbfb-40f7-4b39-a797-304e0c9df61e'), ('71d72cdd-a6d3-4887-85b2-64cb3fdfa1a8'),
  ('8af70dcd-8e55-4e4c-aa00-89cb9dcf2c26');

-- Guard: every id exists, nothing has a contract, and the lists don't overlap.
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM _mv m JOIN businesses s ON s.id = m.src JOIN businesses d ON d.id = m.dst;
  IF n <> 6 THEN RAISE EXCEPTION 'expected 6 move pairs on file, found %', n; END IF;
  SELECT count(*) INTO n FROM _hide h JOIN businesses b ON b.id = h.id;
  IF n <> 52 THEN RAISE EXCEPTION 'expected 52 businesses to hide, found %', n; END IF;
  IF EXISTS (SELECT 1 FROM _hide h JOIN _mv m ON m.src = h.id OR m.dst = h.id) THEN
    RAISE EXCEPTION 'a business is both hidden and moved';
  END IF;
  IF EXISTS (SELECT 1 FROM contracts c WHERE c.business_id IN (SELECT id FROM _hide UNION SELECT src FROM _mv)) THEN
    RAISE EXCEPTION 'a business to hide or move has a contract';
  END IF;
END $$;

-- Personal mail providers (mirrors isPersonalDomain in lib/inbound/utils.ts)
CREATE TEMP TABLE _personal_maps ON COMMIT DROP AS
SELECT id FROM domain_mappings
WHERE domain IN ('gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','yahoo.co.in','hotmail.com','hotmail.co.uk',
                 'outlook.com','live.com','live.co.uk','icloud.com','me.com','mac.com','msn.com','protonmail.com',
                 'proton.me','fastmail.com','aol.com','virgin.net','virginmedia.com','btinternet.com','btconnect.com',
                 'sky.com','talktalk.net','tiscali.co.uk','blueyonder.co.uk','ntlworld.com','gmx.net','gmx.com',
                 'zen.co.uk','plus.net','btopenworld.com','ymail.com','aol.co.uk','gmx.co.uk','cantab.net','nhs.net')
   OR domain ~ '^(yahoo|hotmail|outlook|live|gmx|aol)\.[a-z.]{2,6}$';

-- Contacts of moved businesses, and the contact each joins at the target (if any)
CREATE TEMP TABLE _cmap ON COMMIT DROP AS
SELECT c.id AS src_contact, m.dst,
       (SELECT o.id FROM contacts o
        WHERE o.business_id = m.dst AND o.id <> c.id
          AND (lower(trim(o.name)) = lower(trim(c.name))
               OR o.emails ?| ARRAY(SELECT jsonb_array_elements_text(c.emails)))
        ORDER BY o.is_active DESC, o.created_at LIMIT 1) AS join_to
FROM contacts c JOIN _mv m ON m.src = c.business_id;

-- Placeholder contacts Tom identified as a moved person
CREATE TEMP TABLE _fold (src_contact uuid PRIMARY KEY, into_contact uuid NOT NULL) ON COMMIT DROP;
INSERT INTO _fold VALUES
  ('3fd6e09b-bdf1-4560-8d6a-446acf1f3a4f', '11ef4c90-3aaf-4af3-b174-687743d67bb5'); -- "Contact" -> Mariana Mazur

DO $$ BEGIN
  IF (SELECT count(*) FROM _fold f JOIN contacts a ON a.id = f.src_contact JOIN contacts b ON b.id = f.into_contact
      WHERE a.business_id = 'd96021a3-c275-4733-bfa5-9cf9d0616a14'
        AND b.business_id = '8d1721c6-689d-424d-9cbc-00f32195dfeb') <> 1 THEN
    RAISE EXCEPTION 'the Mariana Mazur contacts are not where expected';
  END IF;
END $$;

CREATE TEMP TABLE _all_biz ON COMMIT DROP AS
SELECT src AS id FROM _mv UNION SELECT dst FROM _mv UNION SELECT id FROM _hide;

-- 1. Backup
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'businesses', b.id, to_jsonb(b), 'stage2_review_2026_10_21' FROM businesses b WHERE b.id IN (SELECT id FROM _all_biz)
UNION ALL
SELECT 'contacts', c.id, to_jsonb(c), 'stage2_review_2026_10_21' FROM contacts c
 WHERE c.business_id IN (SELECT src FROM _mv) OR c.id IN (SELECT join_to FROM _cmap)
    OR c.id IN (SELECT src_contact FROM _fold)
UNION ALL
SELECT 'correspondence', c.id, to_jsonb(c), 'stage2_review_2026_10_21' FROM correspondence c
 WHERE c.business_id IN (SELECT src FROM _mv)
    OR c.linked_business_ids && ARRAY(SELECT src FROM _mv)
    OR c.contact_id IN (SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL)
    OR c.cc_contact_ids && ARRAY(SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL)
    OR c.bcc_contact_ids && ARRAY(SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL)
    OR c.contact_id IN (SELECT src_contact FROM _fold)
    OR c.cc_contact_ids && ARRAY(SELECT src_contact FROM _fold)
    OR c.bcc_contact_ids && ARRAY(SELECT src_contact FROM _fold)
UNION ALL
SELECT 'tasks', t.id, to_jsonb(t), 'stage2_review_2026_10_21' FROM tasks t
 WHERE t.business_id IN (SELECT src FROM _mv) OR (t.business_id IN (SELECT id FROM _hide) AND t.status = 'open')
UNION ALL
SELECT 'domain_mappings', d.id, to_jsonb(d), 'stage2_review_2026_10_21' FROM domain_mappings d
 WHERE d.business_id IN (SELECT src FROM _mv UNION SELECT id FROM _hide) OR d.id IN (SELECT id FROM _personal_maps)
UNION ALL
SELECT 'mail_scan', md5('mail_scan:' || x.id)::uuid, to_jsonb(x), 'stage2_review_2026_10_21' FROM mail_scan x WHERE x.business_id IN (SELECT src FROM _mv)
UNION ALL
SELECT 'task_evidence', md5('task_evidence:' || x.id)::uuid, to_jsonb(x), 'stage2_review_2026_10_21' FROM task_evidence x WHERE x.business_id IN (SELECT src FROM _mv)
UNION ALL
SELECT 'task_term_aliases', md5('task_term_aliases:' || x.id)::uuid, to_jsonb(x), 'stage2_review_2026_10_21' FROM task_term_aliases x WHERE x.business_id IN (SELECT src FROM _mv);

-- 2. MOVE: contacts that join an existing one give it their addresses
UPDATE contacts o
SET emails = (SELECT jsonb_agg(DISTINCT e) FROM (
                SELECT jsonb_array_elements_text(o.emails) e
                UNION SELECT jsonb_array_elements_text(c.emails) FROM contacts c
                WHERE c.id IN (SELECT src_contact FROM _cmap WHERE join_to = o.id)) x)
WHERE o.id IN (SELECT join_to FROM _cmap WHERE join_to IS NOT NULL);

UPDATE correspondence c SET contact_id = m.join_to
FROM _cmap m WHERE m.join_to IS NOT NULL AND c.contact_id = m.src_contact;

UPDATE correspondence c
SET cc_contact_ids  = ARRAY(SELECT DISTINCT coalesce(m.join_to, x) FROM unnest(c.cc_contact_ids) x LEFT JOIN _cmap m ON m.src_contact = x),
    bcc_contact_ids = ARRAY(SELECT DISTINCT coalesce(m.join_to, x) FROM unnest(c.bcc_contact_ids) x LEFT JOIN _cmap m ON m.src_contact = x)
WHERE c.cc_contact_ids && ARRAY(SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL)
   OR c.bcc_contact_ids && ARRAY(SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL);

UPDATE contacts c
SET is_active = false,
    notes = concat_ws(E'\n', c.notes, 'Joined to the matching contact at the right business in the review of 21 Oct 2026.')
FROM _cmap m WHERE m.join_to IS NOT NULL AND c.id = m.src_contact;

-- the rest move with their person intact
UPDATE contacts c SET business_id = m.dst
FROM _cmap m WHERE m.join_to IS NULL AND c.id = m.src_contact;

-- 3. MOVE: everything else that points at the source business
UPDATE correspondence c SET business_id = m.dst FROM _mv m WHERE c.business_id = m.src;

UPDATE correspondence c
SET linked_business_ids = ARRAY(
      SELECT DISTINCT coalesce(m.dst, x) FROM unnest(c.linked_business_ids) x LEFT JOIN _mv m ON m.src = x
      WHERE coalesce(m.dst, x) <> c.business_id)
WHERE c.linked_business_ids && ARRAY(SELECT src FROM _mv);

UPDATE tasks t SET business_id = m.dst FROM _mv m WHERE t.business_id = m.src;
UPDATE mail_scan x SET business_id = m.dst FROM _mv m WHERE x.business_id = m.src;
UPDATE task_evidence x SET business_id = m.dst FROM _mv m WHERE x.business_id = m.src;
UPDATE task_term_aliases x SET business_id = m.dst FROM _mv m WHERE x.business_id = m.src;

-- a company domain moves with its business; a personal one is removed below
UPDATE domain_mappings d SET business_id = m.dst
FROM _mv m WHERE d.business_id = m.src AND d.id NOT IN (SELECT id FROM _personal_maps);

UPDATE businesses d
SET last_contacted_at = greatest(d.last_contacted_at, s.last_contacted_at)
FROM _mv m JOIN businesses s ON s.id = m.src
WHERE d.id = m.dst;

-- 3b. FOLD: the placeholder gives its addresses to the named contact
UPDATE contacts o
SET emails = (SELECT jsonb_agg(DISTINCT e) FROM (
                SELECT jsonb_array_elements_text(o.emails) e
                UNION SELECT jsonb_array_elements_text(c.emails) FROM contacts c
                WHERE c.id IN (SELECT src_contact FROM _fold WHERE into_contact = o.id)) x)
WHERE o.id IN (SELECT into_contact FROM _fold);

UPDATE correspondence c SET contact_id = f.into_contact FROM _fold f WHERE c.contact_id = f.src_contact;

UPDATE correspondence c
SET cc_contact_ids  = ARRAY(SELECT DISTINCT coalesce(f.into_contact, x) FROM unnest(c.cc_contact_ids) x LEFT JOIN _fold f ON f.src_contact = x),
    bcc_contact_ids = ARRAY(SELECT DISTINCT coalesce(f.into_contact, x) FROM unnest(c.bcc_contact_ids) x LEFT JOIN _fold f ON f.src_contact = x)
WHERE c.cc_contact_ids && ARRAY(SELECT src_contact FROM _fold)
   OR c.bcc_contact_ids && ARRAY(SELECT src_contact FROM _fold);

UPDATE contacts c
SET is_active = false,
    notes = concat_ws(E'\n', c.notes, 'Same person as Mariana Mazur; joined to that contact in the review of 21 Oct 2026.')
WHERE c.id IN (SELECT src_contact FROM _fold);

-- 4. HIDE, and the emptied MOVE records
UPDATE tasks t
SET status = 'done', completed_at = now(),
    signal_meta = coalesce(t.signal_meta, '{}'::jsonb) || jsonb_build_object('closed_by', 'stage2_review_2026_10_21')
WHERE t.business_id IN (SELECT id FROM _hide) AND t.status = 'open';

DELETE FROM domain_mappings
WHERE business_id IN (SELECT id FROM _hide UNION SELECT src FROM _mv)
   OR id IN (SELECT id FROM _personal_maps);

UPDATE businesses b
SET status = 'Not a business',
    notes = concat_ws(E'\n', b.notes,
      CASE WHEN b.id IN (SELECT src FROM _mv)
           THEN 'Moved into ' || (SELECT d.name FROM _mv m JOIN businesses d ON d.id = m.dst WHERE m.src = b.id)
                || ' in the review of 21 Oct 2026. Not a business.'
           ELSE 'Hidden in the review of 21 Oct 2026: not a business.' END)
WHERE b.id IN (SELECT id FROM _hide UNION SELECT src FROM _mv);

-- 5. Checks: the moved records are empty, the hidden ones catch no mail.
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM correspondence WHERE business_id IN (SELECT src FROM _mv);
  IF n > 0 THEN RAISE EXCEPTION '% correspondence rows still on a moved business', n; END IF;
  SELECT count(*) INTO n FROM contacts WHERE business_id IN (SELECT src FROM _mv) AND is_active;
  IF n > 0 THEN RAISE EXCEPTION '% active contacts still on a moved business', n; END IF;
  SELECT count(*) INTO n FROM domain_mappings WHERE business_id IN (SELECT id FROM _hide UNION SELECT src FROM _mv);
  IF n > 0 THEN RAISE EXCEPTION '% domain mappings still on a hidden business', n; END IF;
  SELECT count(*) INTO n FROM correspondence WHERE contact_id IN (SELECT src_contact FROM _fold);
  IF n > 0 THEN RAISE EXCEPTION '% correspondence rows still on a folded contact', n; END IF;
  SELECT count(*) INTO n FROM businesses WHERE status = 'Not a business';
  IF n <> 58 THEN RAISE EXCEPTION 'expected 58 businesses marked Not a business, found %', n; END IF;
END $$;

SELECT 'backed up: ' || string_agg(table_name || ' ' || n, ', ' ORDER BY table_name)
FROM (SELECT table_name, count(*) n FROM cc_phase0_backup WHERE reason = 'stage2_review_2026_10_21' GROUP BY 1) x;

COMMIT;
