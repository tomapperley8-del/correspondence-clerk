-- Undo 20261102_004. Run the data-fixes undo first if the backfill was applied (not needed: dropping the column removes the flag).
DROP TRIGGER IF EXISTS contracts_ongoing_end_trg ON public.contracts;
DROP FUNCTION IF EXISTS public.contracts_ongoing_end();
DO $m$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
    JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'business_dossier';
  n := replace(d, 'c.contract_end, c.is_ongoing,', 'c.contract_end,');
  EXECUTE n;
END $m$;
ALTER TABLE public.contracts DROP COLUMN IF EXISTS is_ongoing;
