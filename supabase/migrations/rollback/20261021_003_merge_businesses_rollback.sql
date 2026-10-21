-- Rollback for 20261021_003_merge_businesses. Undo any merges first
-- (undo_business_merge per reason) if their effect should go too: this only
-- removes the functions and the three new columns (and what is stored in them).

BEGIN;
DROP FUNCTION IF EXISTS public.undo_business_merge(text);
DROP FUNCTION IF EXISTS public.mark_not_a_business(uuid);
DROP FUNCTION IF EXISTS public.merge_businesses(uuid, uuid);
DROP FUNCTION IF EXISTS public.cc_assert_business_access(uuid[]);
DROP FUNCTION IF EXISTS public.cc_backup_rows(text, text, text, uuid, uuid);
DROP INDEX IF EXISTS public.contacts_one_primary_per_business;
DROP INDEX IF EXISTS public.businesses_merged_into_idx;
ALTER TABLE public.org_business_types DROP COLUMN IF EXISTS is_commercial;
ALTER TABLE public.contacts DROP COLUMN IF EXISTS is_primary;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS merged_into;
COMMIT;
