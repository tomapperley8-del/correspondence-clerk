-- Undo 20261029_001_outreach_next. Nothing else reads these.
DROP VIEW IF EXISTS public.v_outreach_suggestions;
DROP VIEW IF EXISTS public.v_outreach_next;
DROP VIEW IF EXISTS public.v_outreach_signals;
DROP TABLE IF EXISTS public.outreach_suggestion_dismissals;
