-- Undo 20261024_stage11b_5_old_engine.sql: moves the oe_* tables back to public and puts websites, notes and contact details back as they were.
-- Relabels the backup 'stage11b_old_engine_2026_10_24_undone' so the script could run again.
-- Run with psql -v ON_ERROR_STOP=1.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = 'stage11b_old_engine_2026_10_24') THEN
    RAISE EXCEPTION 'stage11b_old_engine_2026_10_24 is not applied';
  END IF;
END $$;

ALTER TABLE archive.oe_actions SET SCHEMA public;
ALTER TABLE archive.oe_business_links SET SCHEMA public;
ALTER TABLE archive.oe_business_types SET SCHEMA public;
ALTER TABLE archive.oe_competitor_ads SET SCHEMA public;
ALTER TABLE archive.oe_conversion_stats SET SCHEMA public;
ALTER TABLE archive.oe_digital_profiles SET SCHEMA public;
ALTER TABLE archive.oe_discovery_runs SET SCHEMA public;
ALTER TABLE archive.oe_mastersheet_cache SET SCHEMA public;
ALTER TABLE archive.oe_outreach_events SET SCHEMA public;
ALTER TABLE archive.oe_pending_matches SET SCHEMA public;
ALTER TABLE archive.oe_prospects SET SCHEMA public;
GRANT ALL ON public.oe_actions, public.oe_business_links, public.oe_business_types, public.oe_competitor_ads, public.oe_conversion_stats, public.oe_digital_profiles, public.oe_discovery_runs, public.oe_mastersheet_cache, public.oe_outreach_events, public.oe_pending_matches, public.oe_prospects TO anon, authenticated, service_role;
DROP SCHEMA archive;

UPDATE businesses b SET website = k.before_row->>'website', notes = k.before_row->>'notes'
FROM cc_phase0_backup k WHERE k.reason = 'stage11b_old_engine_2026_10_24' AND k.table_name = 'businesses' AND k.row_id = b.id;

UPDATE contacts c SET emails = nullif(k.before_row->'emails', 'null'::jsonb), phones = nullif(k.before_row->'phones', 'null'::jsonb)
FROM cc_phase0_backup k WHERE k.reason = 'stage11b_old_engine_2026_10_24' AND k.table_name = 'contacts' AND k.row_id = c.id;

UPDATE cc_phase0_backup SET reason = 'stage11b_old_engine_2026_10_24_undone' WHERE reason = 'stage11b_old_engine_2026_10_24';

COMMIT;
