-- Undo 20261029_002_newsletter_items (Stage 16a Newsletter tab). Drops the items, contributors,
-- promises and ticks and their views. Issues, mentions and rules are untouched.
DROP VIEW IF EXISTS public.v_newsletter_promises;
DROP VIEW IF EXISTS public.v_newsletter_contributors;
DROP VIEW IF EXISTS public.v_newsletter_items;
DROP TABLE IF EXISTS public.newsletter_promise_ticks;
DROP TABLE IF EXISTS public.newsletter_promises;
DROP TABLE IF EXISTS public.newsletter_items;
DROP TABLE IF EXISTS public.newsletter_contributors;
