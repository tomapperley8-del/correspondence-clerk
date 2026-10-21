-- Stage 2 behaviour test. LOCAL DATABASE ONLY: it inserts and then deletes
-- test businesses and contracts, so never run it against live.
--   docker exec supabase_db_correspondence-clerk psql -U postgres -d postgres -f /tmp/stage2_test.sql
-- Run after applying 20261021_002_unreviewed_status.sql.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

DELETE FROM businesses WHERE name LIKE 'Stage2 test %';

INSERT INTO businesses (organization_id, name, normalized_name, status)
SELECT organization_id, 'Stage2 test ' || s, 'stage2 test ' || s, s
FROM (SELECT organization_id FROM businesses WHERE organization_id IS NOT NULL LIMIT 1) o,
     unnest(ARRAY['Unreviewed', 'Prospect', 'Former']) s;

-- 1. A current contract makes an Unreviewed business Active, as it does a Prospect.
INSERT INTO contracts (business_id, membership_type, contract_start, contract_end, is_current)
SELECT id, 'club_card', current_date, current_date + 365, true
FROM businesses WHERE name LIKE 'Stage2 test %';

SELECT CASE WHEN bool_and(status = 'Active') THEN 'PASS' ELSE 'FAIL' END
       || ' 1 contract promotes to Active: ' || string_agg(name || '=' || status, ', ' ORDER BY name)
FROM businesses WHERE name LIKE 'Stage2 test %';

-- 2. The flags follow the contract too.
SELECT CASE WHEN bool_and(is_club_card) THEN 'PASS' ELSE 'FAIL' END || ' 2 Club Card flag set'
FROM businesses WHERE name LIKE 'Stage2 test %';

-- 3. Without a contract an Unreviewed business stays Unreviewed.
INSERT INTO businesses (organization_id, name, normalized_name, status)
SELECT organization_id, 'Stage2 test bare', 'stage2 test bare', 'Unreviewed'
FROM businesses WHERE organization_id IS NOT NULL LIMIT 1;
UPDATE businesses SET notes = 'touched' WHERE name = 'Stage2 test bare';
SELECT CASE WHEN status = 'Unreviewed' THEN 'PASS' ELSE 'FAIL' END || ' 3 stays Unreviewed: ' || status
FROM businesses WHERE name = 'Stage2 test bare';

DELETE FROM contracts WHERE business_id IN (SELECT id FROM businesses WHERE name LIKE 'Stage2 test %');
DELETE FROM businesses WHERE name LIKE 'Stage2 test %';
SELECT 'cleaned up: ' || count(*) || ' test businesses left' FROM businesses WHERE name LIKE 'Stage2 test %';
