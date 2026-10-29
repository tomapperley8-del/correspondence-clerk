-- Undo 20261029_stage16a_newsletter_series.sql: removes only the rows it added.
DELETE FROM public.newsletter_contributors WHERE notes LIKE 'Stage 16a series 29 Oct 2026%';
