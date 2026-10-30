-- Undo 20261030_domain_mappings_cleanup.sql: put the removed domain mappings back.
-- Skips a domain that has been mapped again since (one mapping per domain).
BEGIN;
INSERT INTO domain_mappings SELECT (jsonb_populate_record(NULL::domain_mappings, b.before_row)).*
FROM cc_phase0_backup b
WHERE b.reason = 'domain mappings 2026-10-30' AND b.table_name = 'domain_mappings'
  AND NOT EXISTS (SELECT 1 FROM domain_mappings dm
                  WHERE dm.org_id = (b.before_row->>'org_id')::uuid AND dm.domain = b.before_row->>'domain');
COMMIT;
