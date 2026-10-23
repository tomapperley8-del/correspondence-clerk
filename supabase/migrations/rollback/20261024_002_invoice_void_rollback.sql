-- Rollback of 20261024_002_invoice_void. Puts back QuickBooks' figures on any
-- invoice still marked void, then removes the trigger, function and columns.
UPDATE public.qbo_invoices SET voided_at = NULL WHERE voided_at IS NOT NULL;
DROP FUNCTION IF EXISTS public.mark_invoice_void(text, boolean, text);
DROP TRIGGER IF EXISTS qbo_invoice_keep_void ON public.qbo_invoices;
DROP FUNCTION IF EXISTS public.qbo_invoice_keep_void();
ALTER TABLE public.qbo_invoices
  DROP COLUMN IF EXISTS voided_at,
  DROP COLUMN IF EXISTS voided_by,
  DROP COLUMN IF EXISTS void_note,
  DROP COLUMN IF EXISTS balance_before_void,
  DROP COLUMN IF EXISTS memo_before_void;
