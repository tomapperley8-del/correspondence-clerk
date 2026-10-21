-- Stage 3: merge_businesses, mark_not_a_business and undo_business_merge.
-- Run on the local copy of live: psql -v ON_ERROR_STOP=1 -f stage3_merge_test.sql
-- Everything runs in one transaction that is rolled back at the end.
--
--   1. M|P Studio (17 emails, a contract, 19 tasks, a domain link) into MP Studio:
--      nothing left on the source, totals unchanged, contract flags follow.
--   2. Dawn Wilson (a person filed as a business) into Dwmultimedia: her contact
--      shares an address with the one there, so it joins it instead of moving.
--   3. FOUR FOUR FOUR into FOURFOURFOUR, then FOURFOURFOUR into M|P... no:
--      a second merge of an already-merged business is refused.
--   4. Undo of all three merges in reverse order: every table is exactly as it
--      was (updated_at aside).
--   5. mark_not_a_business closes open tasks and removes domain links; undo restores.
--   6. A signed-in user from another organisation is refused; anon can't call it.

BEGIN;

CREATE TEMP TABLE _fp_tables (t text);
INSERT INTO _fp_tables VALUES ('businesses'),('contacts'),('correspondence'),('tasks'),('domain_mappings'),
  ('contracts'),('business_files'),('business_articles'),('care_exclusions'),('conversation_threads'),
  ('draft_requests'),('duplicate_dismissals'),('insight_cache'),('insight_history'),('one_off_sales'),
  ('qbo_links'),('routine_drafts'),('mail_scan'),('mail_backfill_stage'),('task_evidence'),
  ('task_term_aliases'),('prospect_leads'),('resources'),('oe_business_links'),('oe_pending_matches');

CREATE TEMP TABLE _fp (label text, t text, n bigint, h text);
CREATE OR REPLACE FUNCTION pg_temp.fp(p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; n bigint; h text; BEGIN
  FOR r IN SELECT t FROM _fp_tables LOOP
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg((to_jsonb(x) - ''updated_at'')::text, '''' ORDER BY (to_jsonb(x) - ''updated_at'')::text), '''')) FROM public.%I x', r.t)
      INTO n, h;
    INSERT INTO _fp VALUES (p_label, r.t, n, h);
  END LOOP;
END $$;

CREATE TEMP TABLE _res (k text PRIMARY KEY, v jsonb);
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(cond, false) THEN RAISE EXCEPTION 'FAIL: %', msg; END IF; RAISE NOTICE 'ok: %', msg; END $$;

SELECT pg_temp.fp('before');

-- 1. M|P Studio into MP Studio
INSERT INTO _res SELECT 'm1', merge_businesses('2acc0ef6-efc2-4c63-893a-02eeab023656', '3c65e020-3730-4b1c-8853-e5c0b1609c77');
SELECT pg_temp.ok((SELECT count(*) FROM correspondence WHERE business_id = '3c65e020-3730-4b1c-8853-e5c0b1609c77') = 19, 'all 19 emails on MP Studio');
SELECT pg_temp.ok((SELECT count(*) FROM contracts WHERE business_id = '3c65e020-3730-4b1c-8853-e5c0b1609c77') = 1, 'contract moved');
SELECT pg_temp.ok((SELECT count(*) FROM tasks WHERE business_id = '3c65e020-3730-4b1c-8853-e5c0b1609c77') = 19, 'tasks moved');
SELECT pg_temp.ok((SELECT count(*) FROM domain_mappings WHERE business_id = '3c65e020-3730-4b1c-8853-e5c0b1609c77') = 1, 'domain link moved');
SELECT pg_temp.ok((SELECT status = 'Not a business' AND merged_into = '3c65e020-3730-4b1c-8853-e5c0b1609c77' AND NOT is_club_card AND NOT is_advertiser
                   FROM businesses WHERE id = '2acc0ef6-efc2-4c63-893a-02eeab023656'), 'source hidden and points at target');
SELECT pg_temp.ok((SELECT is_club_card OR is_advertiser FROM businesses WHERE id = '3c65e020-3730-4b1c-8853-e5c0b1609c77')
                  = (SELECT bool_or(is_current AND membership_type IN ('club_card','advertiser')) FROM contracts WHERE business_id = '3c65e020-3730-4b1c-8853-e5c0b1609c77'),
                  'target flags follow the moved contract');
SELECT pg_temp.ok((SELECT notes LIKE '%Merged in M|P Studio%' FROM businesses WHERE id = '3c65e020-3730-4b1c-8853-e5c0b1609c77'), 'target note says what was merged');

-- 2. Dawn Wilson into Dwmultimedia (contact joins on a shared address)
INSERT INTO _res SELECT 'm2', merge_businesses('eaf396d4-1b7e-4221-acf0-9c41f76ea54a', '2f295ff1-87a8-4ca8-84d8-f674ad564231');
SELECT pg_temp.ok((_res.v->'moved'->>'contacts_joined')::int = 1 AND (_res.v->'moved'->>'contacts_moved')::int = 0, 'Dawn''s contact joined, not moved') FROM _res WHERE k = 'm2';
SELECT pg_temp.ok((SELECT count(*) FROM correspondence WHERE business_id = '2f295ff1-87a8-4ca8-84d8-f674ad564231') = 97, '92 + 5 emails on Dwmultimedia');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM correspondence c JOIN contacts k ON k.id = c.contact_id
                              WHERE c.business_id = '2f295ff1-87a8-4ca8-84d8-f674ad564231' AND k.business_id <> c.business_id),
                  'every email''s contact is at the business it is filed under');

-- 3. FOUR FOUR FOUR into FOURFOURFOUR; a second merge of it is refused
INSERT INTO _res SELECT 'm3', merge_businesses('847a4b37-a831-4b9e-94fa-b9eced9b709c', 'bd82b193-9edd-4fe9-9fa8-aaca4fc5ee7e');
SELECT pg_temp.ok((_res.v->'moved'->>'contacts_joined')::int = 1, 'same address joins') FROM _res WHERE k = 'm3';
DO $$ BEGIN
  PERFORM merge_businesses('847a4b37-a831-4b9e-94fa-b9eced9b709c', '3c65e020-3730-4b1c-8853-e5c0b1609c77');
  RAISE EXCEPTION 'FAIL: second merge allowed';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'ok: second merge refused (%)', SQLERRM;
END $$;
DO $$ BEGIN
  PERFORM merge_businesses('3c65e020-3730-4b1c-8853-e5c0b1609c77', '2acc0ef6-efc2-4c63-893a-02eeab023656');
  RAISE EXCEPTION 'FAIL: merge into a hidden business allowed';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'ok: merge into a merged business refused (%)', SQLERRM;
END $$;

SELECT pg_temp.fp('merged');
SELECT pg_temp.ok((SELECT bool_and(a.n = b.n) FROM _fp a JOIN _fp b USING (t)
                   WHERE a.label = 'before' AND b.label = 'merged' AND t NOT IN ('insight_cache','business_articles','care_exclusions','qbo_links','task_term_aliases')),
                  'row totals unchanged in every table that keeps all its rows');

-- 4. Undo, newest first
SELECT pg_temp.ok((undo_business_merge(v->>'reason')->>'reason') IS NOT NULL, 'undo ' || k) FROM _res WHERE k = 'm3';
SELECT pg_temp.ok((undo_business_merge(v->>'reason')->>'reason') IS NOT NULL, 'undo ' || k) FROM _res WHERE k = 'm2';
SELECT pg_temp.ok((undo_business_merge(v->>'reason')->>'reason') IS NOT NULL, 'undo ' || k) FROM _res WHERE k = 'm1';
SELECT pg_temp.fp('undone');
SELECT t || ' differs after undo' AS problem FROM _fp a JOIN _fp b USING (t)
WHERE a.label = 'before' AND b.label = 'undone' AND (a.n <> b.n OR a.h <> b.h) AND t <> 'cc_phase0_backup';
SELECT pg_temp.ok((SELECT bool_and(a.n = b.n AND a.h = b.h) FROM _fp a JOIN _fp b USING (t)
                   WHERE a.label = 'before' AND b.label = 'undone'), 'every table exactly as before (updated_at aside)');
DO $$ BEGIN
  PERFORM undo_business_merge((SELECT v->>'reason' FROM _res WHERE k = 'm1'));
  RAISE EXCEPTION 'FAIL: undo ran twice';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'ok: second undo refused (%)', SQLERRM;
END $$;

-- 5. mark_not_a_business on Dwmultimedia (10 tasks, a domain link), then undo
INSERT INTO _res SELECT 'h1', mark_not_a_business('2f295ff1-87a8-4ca8-84d8-f674ad564231');
SELECT pg_temp.ok((SELECT status FROM businesses WHERE id = '2f295ff1-87a8-4ca8-84d8-f674ad564231') = 'Not a business', 'hidden');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM domain_mappings WHERE business_id = '2f295ff1-87a8-4ca8-84d8-f674ad564231'), 'domain link removed');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM tasks WHERE business_id = '2f295ff1-87a8-4ca8-84d8-f674ad564231' AND status <> 'done'), 'no open tasks');
SELECT pg_temp.ok((SELECT count(*) FROM correspondence WHERE business_id = '2f295ff1-87a8-4ca8-84d8-f674ad564231') = 92, 'emails kept');
SELECT pg_temp.ok((undo_business_merge(v->>'reason')->>'reason') IS NOT NULL, 'undo hide') FROM _res WHERE k = 'h1';
DELETE FROM _fp WHERE label = 'undone';
SELECT pg_temp.fp('undone');
SELECT pg_temp.ok((SELECT bool_and(a.n = b.n AND a.h = b.h) FROM _fp a JOIN _fp b USING (t)
                   WHERE a.label = 'before' AND b.label = 'undone'), 'hide undone exactly');
DO $$ BEGIN
  PERFORM mark_not_a_business('54c5d131-45bc-433e-b85c-e0fb63b5df32');
  RAISE EXCEPTION 'FAIL: hid a business with a current contract';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'ok: business with a current contract not hidden (%)', SQLERRM;
END $$;

-- 6. Access
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'merge_businesses(uuid,uuid)', 'execute'), 'anon cannot merge');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'undo_business_merge(text)', 'execute'), 'anon cannot undo');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated', 'cc_backup_rows(text,text,text,uuid,uuid)', 'execute'), 'helpers not exposed');
-- a signed-in user with no profile in this organisation
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM merge_businesses('847a4b37-a831-4b9e-94fa-b9eced9b709c', 'bd82b193-9edd-4fe9-9fa8-aaca4fc5ee7e');
  RAISE EXCEPTION 'FAIL: other organisation allowed';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'ok: other organisation refused (%)', SQLERRM;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"a1a0f121-f6e9-4f79-b8b0-20983cb67545","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((merge_businesses('847a4b37-a831-4b9e-94fa-b9eced9b709c', 'bd82b193-9edd-4fe9-9fa8-aaca4fc5ee7e')->>'reason') IS NOT NULL,
                  'a signed-in user of the organisation can merge');
RESET ROLE;

ROLLBACK;
