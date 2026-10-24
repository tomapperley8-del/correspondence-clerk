-- Undo for 20261024_stage16a_newsletter_rules.sql: removes the rules from Tom's 24 Oct review and asks the
-- next newsletter read to re-match every issue without them.
DELETE FROM public.newsletter_match_rules WHERE note LIKE 'Tom review 24 Oct 2026%';
UPDATE public.newsletter_issues SET matched_at = NULL WHERE organization_id = '00000000-0000-0000-0000-000000000001';
