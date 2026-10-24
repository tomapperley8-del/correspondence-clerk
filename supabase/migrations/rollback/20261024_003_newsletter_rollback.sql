-- Rollback for 20261024_003_newsletter (Stage 16a data half). Removes the newsletter tables and view.
-- The issues can be read from Gmail again; Tom's review decisions on unclear mentions would be lost,
-- so copy newsletter_mentions first if any have decided_at set.
DROP VIEW IF EXISTS public.v_business_newsletter;
DROP TABLE IF EXISTS public.newsletter_mentions;
DROP TABLE IF EXISTS public.newsletter_read_runs;
DROP TABLE IF EXISTS public.newsletter_issues;
