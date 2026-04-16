-- Drop all oe_* trigger functions with CASCADE.
-- These functions had search_path = '' set on them in migration 20260415_001,
-- which broke their unqualified table/function references (oe_business_links,
-- oe_normalise_business_name, etc), causing INSERT errors on businesses and
-- correspondence tables.
-- The app has no code paths that call these; they were DB-only triggers for
-- the marketing engine that was never active in production.
-- CASCADE automatically drops any triggers backed by these functions.

DROP FUNCTION IF EXISTS public.oe_link_on_business_insert() CASCADE;
DROP FUNCTION IF EXISTS public.oe_sync_correspondence_to_prospect() CASCADE;
DROP FUNCTION IF EXISTS public.oe_link_on_prospect_insert() CASCADE;
DROP FUNCTION IF EXISTS public.oe_recalculate_conversion_stats() CASCADE;
DROP FUNCTION IF EXISTS public.oe_sync_status_to_cc() CASCADE;
DROP FUNCTION IF EXISTS public.oe_normalise_business_name(text) CASCADE;
DROP FUNCTION IF EXISTS public.update_digital_profile_updated_at() CASCADE;
