-- 2 Nov 2026 (Tom: "this is for indefinite contracts so find a way to mark that"):
-- contracts.is_ongoing marks a deal with no end date. contract_end keeps the placeholder
-- 2030-01-01 (a trigger enforces it), so every reader that looks at contract_end (attention,
-- renewals, Club Card, task signals, data health) already treats an ongoing deal as running and
-- never expiring; the app shows "Ongoing" instead of the date. Rollback: rollback/20261102_004_*.sql
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS is_ongoing boolean NOT NULL DEFAULT false;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contracts_ongoing_end() RETURNS trigger
LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.is_ongoing AND (NEW.contract_end IS NULL OR NEW.contract_end < DATE '2030-01-01') THEN
    NEW.contract_end := DATE '2030-01-01';
  END IF;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS contracts_ongoing_end_trg ON public.contracts;
CREATE TRIGGER contracts_ongoing_end_trg BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_ongoing_end();

-- business_dossier: add is_ongoing to the current deal and to the history rows.
DO $m$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
    JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'business_dossier';
  IF d IS NULL THEN RAISE EXCEPTION 'business_dossier not found'; END IF;
  n := replace(d, 'c.contract_end, c.contract_amount, c.contract_currency,', 'c.contract_end, c.is_ongoing, c.contract_amount, c.contract_currency,');
  n := replace(n, 'c.contract_end, c.contract_amount, c.billing_frequency,', 'c.contract_end, c.is_ongoing, c.contract_amount, c.billing_frequency,');
  IF n = d THEN RAISE EXCEPTION 'business_dossier unchanged: text not found'; END IF;
  EXECUTE n;
END $m$;
