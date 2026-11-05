-- Audit 5 Nov 2026, data fixes (Tom: "i want everything fixing"). Before-images in cc_phase0_backup,
-- reason 'audit 2026-11-05'; undo: 20261105_audit_data_fixes_undo.sql.
-- 1. TARANTELLA: its running Club Card term (04/07/2026 to 04/07/2027) becomes the current deal.
-- 2. Exact duplicate deals (same type, dates and amount as the current one, not current, nothing
--    linked to them): ACTIVE 360, CHISWICK PHYSIO, Indian Zing, Mirtala.
-- 3. Two inactive contacts left on merged records (Dawn Wilson, FOURFOURFOUR "Contact"); no email
--    points at them and the surviving records have their own.
-- 4. Hounslow Symphony Orchestra's two "Promote my Event" emails, misfiled on PHO, move to them.
-- 5. rocketmail.com (a personal Yahoo address) is no longer mapped to the hidden "Mail" record.
-- 6. The Unreviewed "Robertdyas" record (1 email, 1 contact) is merged into ROBERT DYAS.
BEGIN;

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'contracts', c.id, to_jsonb(c), 'audit 2026-11-05' FROM contracts c
WHERE c.id IN ('160f438e-c21a-488a-8f23-4c5132405b0a', 'a84832c3-cf2a-46a9-845f-56c772d96ba9',
  'f3738478-3407-49fe-a223-e9674c62789c', 'e1cfd5cf-2d96-4ee9-95cc-07b986864495', 'b85309dd-57dc-448c-aff9-dbbdef4cce74');
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'contacts', k.id, to_jsonb(k), 'audit 2026-11-05' FROM contacts k
WHERE k.id IN ('979d48af-0202-4ff4-8738-36ffc4b96c7d', '493b47d3-6a51-4ebe-93b5-0164674d04c4');
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'correspondence', r.id, to_jsonb(r), 'audit 2026-11-05' FROM correspondence r
WHERE r.id IN ('03c299d4-c62a-4f51-98a4-81236a11716a', 'dbdc41e7-f2b3-45c6-a126-cb11e689acd7');
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'domain_mappings', m.id, to_jsonb(m), 'audit 2026-11-05' FROM domain_mappings m
WHERE m.id = 'c9c12b29-3e64-477c-a29d-be98a4aedaee';

UPDATE contracts SET is_current = true, updated_at = now()
WHERE id = '160f438e-c21a-488a-8f23-4c5132405b0a' AND NOT is_current;

DELETE FROM contracts WHERE NOT is_current AND id IN ('a84832c3-cf2a-46a9-845f-56c772d96ba9',
  'f3738478-3407-49fe-a223-e9674c62789c', 'e1cfd5cf-2d96-4ee9-95cc-07b986864495', 'b85309dd-57dc-448c-aff9-dbbdef4cce74');

DELETE FROM contacts WHERE NOT is_active AND id IN ('979d48af-0202-4ff4-8738-36ffc4b96c7d', '493b47d3-6a51-4ebe-93b5-0164674d04c4');

UPDATE correspondence SET business_id = 'fb872f50-e070-47af-ac80-d08f457d901e', updated_at = now()
WHERE id IN ('03c299d4-c62a-4f51-98a4-81236a11716a', 'dbdc41e7-f2b3-45c6-a126-cb11e689acd7');

DELETE FROM domain_mappings WHERE id = 'c9c12b29-3e64-477c-a29d-be98a4aedaee';

-- merge_businesses returns what it moved; keep that with the other before-images
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'merge_businesses', '5f9c47ea-57c6-46f7-84cf-d0d85b96c80f',
  jsonb_build_object('src', to_jsonb(b), 'dst', 'e0a66051-ffec-40a4-b83f-74bd0f3ec421',
    'result', merge_businesses('5f9c47ea-57c6-46f7-84cf-d0d85b96c80f', 'e0a66051-ffec-40a4-b83f-74bd0f3ec421')),
  'audit 2026-11-05'
FROM businesses b WHERE b.id = '5f9c47ea-57c6-46f7-84cf-d0d85b96c80f';

SELECT refresh_business_truth(NULL);
COMMIT;
