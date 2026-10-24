-- Rollback for 20261024_003_newsletter (Stage 16a data half). Removes the newsletter tables and view.
-- Mailchimp's archive keeps only the latest 20 issues, so older issues stored here would be lost, and so
-- would Tom's decisions on unclear mentions: copy newsletter_issues and newsletter_mentions first.
DROP VIEW IF EXISTS public.v_business_newsletter;
DROP TABLE IF EXISTS public.newsletter_mentions;
DROP TABLE IF EXISTS public.newsletter_read_runs;
DROP TABLE IF EXISTS public.newsletter_issues;
