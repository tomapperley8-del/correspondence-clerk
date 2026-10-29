-- Undo 20261029_004_data_health: new views only, so dropping them restores live as it was.
DROP VIEW IF EXISTS public.v_category_gap_prospects;
DROP VIEW IF EXISTS public.v_category_gaps;
DROP VIEW IF EXISTS public.v_outreach_winbacks;
DROP VIEW IF EXISTS public.v_data_health_counts;
DROP VIEW IF EXISTS public.v_data_health;
