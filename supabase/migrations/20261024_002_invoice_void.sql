-- Stage 14a v2 (UI overhaul): Mark void on a QuickBooks invoice.
--
-- Tom, 23 Oct 2026: "Mark void on an invoice: the app marks that one invoice
-- void and it stops counting everywhere at once (Today, badge, business page,
-- desk email, routines); Tom voids it in QuickBooks himself."
--
-- How: the app does to the mirror row what a void in QuickBooks does. Every
-- reader of unpaid invoices already skips a row whose private_memo is 'Voided'
-- (v_business_attention, v_member_care_queue, v_care_gaps, v_task_signals,
-- v_business_financials, v_unrecorded_renewals, sync_qbo_to_crm,
-- record_qbo_terms, record_qbo_one_offs, derive_business_stages, the app's
-- calendar and business page) or counts only balance > 0 (v_receivables,
-- v_daily_brief). So a voided row gets balance 0 and private_memo 'Voided',
-- and no reader changes.
--
-- The daily desk routine's QuickBooks step sets `balance` from the aging
-- report every morning and never touches the new columns, so a BEFORE trigger
-- keeps a voided row at 0 and 'Voided' while voided_at is set. Until Tom voids
-- it in QuickBooks too, the routine's receivables check will differ from the
-- aging total by that amount and say so in its heartbeat.
--
-- Unmark (voided_at back to null) restores QuickBooks' latest balance and the
-- memo. Each mark and unmark backs the row up in cc_phase0_backup first.
-- Rollback: supabase/migrations/rollback/20261024_002_invoice_void_rollback.sql

ALTER TABLE public.qbo_invoices
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_note text,
  ADD COLUMN IF NOT EXISTS balance_before_void numeric,
  ADD COLUMN IF NOT EXISTS memo_before_void text;

COMMENT ON COLUMN public.qbo_invoices.voided_at IS 'Stage 14a v2: marked void in the app. While set, a trigger keeps balance 0 and private_memo ''Voided'' whatever the QuickBooks sync writes.';
COMMENT ON COLUMN public.qbo_invoices.balance_before_void IS 'Stage 14a v2: the latest balance QuickBooks gave while the invoice was marked void; restored if the mark is removed.';

CREATE OR REPLACE FUNCTION public.qbo_invoice_keep_void()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.voided_at IS NOT NULL THEN
    -- Keep QuickBooks' own figure and memo, then hold the row at void.
    IF coalesce(NEW.balance, 0) > 0 THEN NEW.balance_before_void := NEW.balance; END IF;
    IF coalesce(NEW.private_memo, '') <> 'Voided' THEN NEW.memo_before_void := NEW.private_memo; END IF;
    NEW.balance := 0;
    NEW.private_memo := 'Voided';
  ELSIF TG_OP = 'UPDATE' AND OLD.voided_at IS NOT NULL THEN
    -- Unmarked: back to what QuickBooks last said.
    NEW.balance := coalesce(OLD.balance_before_void, NEW.balance);
    NEW.private_memo := OLD.memo_before_void;
    NEW.balance_before_void := NULL;
    NEW.memo_before_void := NULL;
    NEW.voided_by := NULL;
    NEW.void_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qbo_invoice_keep_void ON public.qbo_invoices;
CREATE TRIGGER qbo_invoice_keep_void
  BEFORE INSERT OR UPDATE ON public.qbo_invoices
  FOR EACH ROW EXECUTE FUNCTION public.qbo_invoice_keep_void();

-- Mark one invoice void (or, with p_void false, take the mark off). Runs as
-- the caller, so RLS applies; backs the row up first.
CREATE OR REPLACE FUNCTION public.mark_invoice_void(p_invoice_id text, p_void boolean DEFAULT true, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row qbo_invoices;
BEGIN
  SELECT * INTO v_row FROM qbo_invoices WHERE qbo_invoice_id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;
  IF p_void = (v_row.voided_at IS NOT NULL) THEN
    RETURN jsonb_build_object('changed', false, 'doc_number', v_row.doc_number);
  END IF;
  INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
  VALUES ('qbo_invoices', md5(p_invoice_id)::uuid, to_jsonb(v_row),
          CASE WHEN p_void THEN 'invoice_void ' ELSE 'invoice_unvoid ' END || p_invoice_id);
  IF p_void THEN
    UPDATE qbo_invoices SET voided_at = now(), voided_by = auth.uid(), void_note = p_note WHERE qbo_invoice_id = p_invoice_id;
  ELSE
    UPDATE qbo_invoices SET voided_at = NULL WHERE qbo_invoice_id = p_invoice_id;
  END IF;
  RETURN jsonb_build_object('changed', true, 'doc_number', v_row.doc_number);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_invoice_void(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_invoice_void(text, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.qbo_invoice_keep_void() FROM PUBLIC, anon, authenticated;
