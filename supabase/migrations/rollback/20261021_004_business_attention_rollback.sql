-- Rollback for 20261021_004_business_attention.sql
-- Removes the view and functions. The snooze column is dropped too: it only
-- holds snoozes set from the Needs attention page.

DROP FUNCTION IF EXISTS public.get_attention_count(uuid);
DROP VIEW IF EXISTS public.v_business_attention;
DROP FUNCTION IF EXISTS public.email_needs_reply(text, text);
DROP FUNCTION IF EXISTS public.cc_today();
ALTER TABLE public.businesses DROP COLUMN IF EXISTS attention_snoozed_until;
