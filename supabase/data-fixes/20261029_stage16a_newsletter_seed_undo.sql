-- Undo 20261029_stage16a_newsletter_seed.sql: removes only the rows it added (and their ticks).
DELETE FROM public.newsletter_promises WHERE notes LIKE 'Stage 16a seed 29 Oct 2026%';
DELETE FROM public.newsletter_contributors WHERE notes LIKE 'Stage 16a seed 29 Oct 2026%';
