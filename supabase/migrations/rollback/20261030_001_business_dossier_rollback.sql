-- Undo 20261030_001_business_dossier: new functions only, nothing else depends on them.
DROP FUNCTION IF EXISTS public.search_everything(text, date, date, int);
DROP FUNCTION IF EXISTS public.search_correspondence(text, text, int);
DROP FUNCTION IF EXISTS public.find_businesses(jsonb);
DROP FUNCTION IF EXISTS public.business_dossier(text);
DROP FUNCTION IF EXISTS public.cc_business_candidates(text, int);
DROP FUNCTION IF EXISTS public.cc_business_survivor(uuid);
DROP FUNCTION IF EXISTS public.cc_name_key(text);
